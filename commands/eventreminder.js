const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  ComponentType,
} = require('discord.js');
const {
  PRESET_EVENTS,
  createReminder,
  listReminders,
  deleteReminder,
  setEnabled,
  getNextOccurrence,
  getReminder,
} = require('../lib/reminders');
const { isAdmin } = require('../lib/admin');
const { makeEmbed, errorEmbed, resultEmbed } = require('../lib/ui');

function canManage(interaction) {
  if (isAdmin(interaction)) return true;
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) || false;
}

function formatSchedule(r) {
  const time = `${String(r.hour).padStart(2, '0')}:${String(r.minute).padStart(2, '0')} UTC`;
  switch (r.type) {
    case 'once':
      return `One-time · ${r.date} at ${time}`;
    case 'daily':
      return `Daily at ${time}`;
    case 'every_x_days':
      return `Every ${r.intervalDays} day(s) at ${time}`;
    case 'weekly': {
      const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const days = (r.weekdays || []).map((d) => names[d]).join(', ');
      return `Weekly (${days}) at ${time}`;
    }
    case 'monthly':
      return `Monthly on day ${r.monthDay} at ${time}`;
    default:
      return time;
  }
}

// In-memory wizard state (per user)
const wizards = new Map();

function getWizard(userId) {
  return wizards.get(userId) || null;
}
function setWizard(userId, data) {
  wizards.set(userId, data);
}
function clearWizard(userId) {
  wizards.delete(userId);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('eventreminder')
    .setDescription('Event reminder setup (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName('setup').setDescription('Interactive setup with dropdowns'))
    .addSubcommand((s) => s.setName('list').setDescription('List all reminders'))
    .addSubcommand((s) =>
      s
        .setName('delete')
        .setDescription('Delete a reminder by ID')
        .addStringOption((o) => o.setName('id').setDescription('Reminder ID').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('toggle')
        .setDescription('Enable or disable a reminder')
        .addStringOption((o) => o.setName('id').setDescription('Reminder ID').setRequired(true))
        .addBooleanOption((o) => o.setName('enabled').setDescription('Enable?').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('test')
        .setDescription('Send a test message for a reminder')
        .addStringOption((o) => o.setName('id').setDescription('Reminder ID').setRequired(true))
    ),

  async execute(interaction) {
    if (!canManage(interaction)) {
      return interaction.reply({
        embeds: [errorEmbed('Permission denied', 'Admin only.')],
        ephemeral: true,
      });
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    /* ===== LIST ===== */
    if (sub === 'list') {
      const list = listReminders(guildId);
      if (!list.length) {
        return interaction.reply({
          embeds: [makeEmbed({ title: '📅 Reminders', description: '_None yet. Use `/eventreminder setup`_', color: 'info' })],
          ephemeral: true,
        });
      }
      const lines = list.map((r) => {
        const next = getNextOccurrence(r);
        const nextStr = next ? `<t:${Math.floor(next.getTime() / 1000)}:R>` : '—';
        return `${r.enabled ? '🟢' : '🔴'} **${r.name}** \`${r.id}\`\n${formatSchedule(r)} · Next ${nextStr}`;
      });
      return interaction.reply({
        embeds: [
          makeEmbed({
            title: `📅 Reminders (${list.length})`,
            description: lines.join('\n\n').slice(0, 4000),
            color: 'info',
          }),
        ],
        ephemeral: true,
      });
    }

    if (sub === 'delete') {
      const id = interaction.options.getString('id').trim();
      const ok = deleteReminder(id);
      return interaction.reply({
        embeds: [resultEmbed(ok ? 'Deleted' : 'Not found', `\`${id}\``, ok)],
        ephemeral: true,
      });
    }

    if (sub === 'toggle') {
      const id = interaction.options.getString('id').trim();
      const enabled = interaction.options.getBoolean('enabled');
      const ok = setEnabled(id, enabled);
      return interaction.reply({
        embeds: [resultEmbed(ok ? (enabled ? 'Enabled' : 'Disabled') : 'Not found', `\`${id}\``, ok)],
        ephemeral: true,
      });
    }

    if (sub === 'test') {
      const id = interaction.options.getString('id').trim();
      const r = getReminder(id);
      if (!r || r.guildId !== guildId) {
        return interaction.reply({ embeds: [errorEmbed('Not found', `\`${id}\``)], ephemeral: true });
      }
      const mention = r.mention === '@everyone' ? '@everyone' : `<@&${r.mention}>`;
      const embed = new EmbedBuilder()
        .setTitle(`⚔️ ${r.name}`)
        .setColor(0xed4245)
        .setDescription(`**TEST**\n${formatSchedule(r)}`)
        .setFooter({ text: 'UTC' })
        .setTimestamp();
      try {
        const ch = await interaction.client.channels.fetch(r.channelId);
        if (ch?.isTextBased()) await ch.send({ content: mention, embeds: [embed] });
        return interaction.reply({
          embeds: [resultEmbed('Test sent', `<#${r.channelId}>`, true)],
          ephemeral: true,
        });
      } catch (e) {
        return interaction.reply({ embeds: [errorEmbed('Failed', e.message)], ephemeral: true });
      }
    }

    /* ===== SETUP WIZARD ===== */
    if (sub === 'setup') {
      clearWizard(userId);
      setWizard(userId, { guildId, step: 'event' });

      const eventMenu = new StringSelectMenuBuilder()
        .setCustomId(`er_event:${userId}`)
        .setPlaceholder('Select event')
        .addOptions(
          PRESET_EVENTS.slice(0, 24).map((e) => ({
            label: e,
            value: e,
          }))
        );

      await interaction.reply({
        embeds: [
          makeEmbed({
            title: '📅 Event Reminder Setup',
            description: '**Step 1/4** — Choose the event',
            color: 'info',
          }),
        ],
        components: [new ActionRowBuilder().addComponents(eventMenu)],
        ephemeral: true,
      });
    }
  },
};

/**
 * Handle wizard component interactions — called from index.js
 */
async function handleEventReminderUI(interaction) {
  const userId = interaction.user.id;
  const id = interaction.customId || '';

  if (!id.startsWith('er_') && !id.startsWith('er_modal_')) return false;
  if (!canManage(interaction)) {
    await interaction.reply({ content: 'Admin only.', ephemeral: true }).catch(() => {});
    return true;
  }

  // Only the user who started the wizard
  const ownerMatch = id.match(/:(?:er_)?(\d{15,})/) || id.split(':');
  // customId formats: er_event:USERID, er_type:USERID, er_channel:USERID, er_modal_time:USERID, er_confirm:USERID

  const parts = id.split(':');
  const ownerId = parts[parts.length - 1];
  if (ownerId !== userId && !id.startsWith('er_modal_')) {
    // modals don't always embed user the same way
  }
  if (parts.length >= 2 && /^\d{15,}$/.test(parts[1]) && parts[1] !== userId) {
    await interaction.reply({ content: 'This setup is not yours.', ephemeral: true }).catch(() => {});
    return true;
  }

  /* Step 1: event selected */
  if (id.startsWith('er_event:')) {
    const eventName = interaction.values[0];
    const wiz = getWizard(userId) || { guildId: interaction.guildId };
    wiz.event = eventName;
    wiz.step = 'type';
    setWizard(userId, wiz);

    const typeMenu = new StringSelectMenuBuilder()
      .setCustomId(`er_type:${userId}`)
      .setPlaceholder('Schedule type')
      .addOptions(
        { label: 'Daily', value: 'daily', description: 'Every day at a fixed UTC time' },
        { label: 'One-time', value: 'once', description: 'Single date + time' },
        { label: 'Every X days', value: 'every_x_days', description: 'Repeats every N days' },
        { label: 'Weekly', value: 'weekly', description: 'Specific weekdays' },
        { label: 'Monthly', value: 'monthly', description: 'Day of month' }
      );

    await interaction.update({
      embeds: [
        makeEmbed({
          title: '📅 Event Reminder Setup',
          description: `Event: **${eventName}**\n\n**Step 2/4** — Choose schedule type`,
          color: 'info',
        }),
      ],
      components: [new ActionRowBuilder().addComponents(typeMenu)],
    });
    return true;
  }

  /* Step 2: type selected → open modal for time details */
  if (id.startsWith('er_type:')) {
    const type = interaction.values[0];
    const wiz = getWizard(userId) || {};
    wiz.type = type;
    wiz.step = 'time';
    setWizard(userId, wiz);

    const modal = new ModalBuilder()
      .setCustomId(`er_modal_time:${userId}`)
      .setTitle('Reminder time (UTC)');

    const hourInput = new TextInputBuilder()
      .setCustomId('hour')
      .setLabel('Hour UTC (0-23)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('14')
      .setMaxLength(2);

    const minuteInput = new TextInputBuilder()
      .setCustomId('minute')
      .setLabel('Minute (0-59)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('0')
      .setMaxLength(2);

    const offsetsInput = new TextInputBuilder()
      .setCustomId('offsets')
      .setLabel('Remind minutes before (e.g. 60,10)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setPlaceholder('60,10')
      .setValue('60,10');

    modal.addComponents(
      new ActionRowBuilder().addComponents(hourInput),
      new ActionRowBuilder().addComponents(minuteInput),
      new ActionRowBuilder().addComponents(offsetsInput)
    );

    // Extra field depending on type
    if (type === 'once') {
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('date')
            .setLabel('Date YYYY-MM-DD')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('2026-11-20')
        )
      );
    } else if (type === 'every_x_days') {
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('interval')
            .setLabel('Every how many days?')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('2')
        )
      );
    } else if (type === 'weekly') {
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('weekdays')
            .setLabel('Weekdays 0=Sun…6=Sat (e.g. 1,3,5)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('1,3,5')
        )
      );
    } else if (type === 'monthly') {
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('monthday')
            .setLabel('Day of month (1-31)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('15')
        )
      );
    }

    await interaction.showModal(modal);
    return true;
  }

  /* Step 3: modal submitted → pick channel */
  if (id.startsWith('er_modal_time:')) {
    const wiz = getWizard(userId);
    if (!wiz) {
      await interaction.reply({ content: 'Setup expired. Run `/eventreminder setup` again.', ephemeral: true });
      return true;
    }

    const hour = parseInt(interaction.fields.getTextInputValue('hour'), 10);
    const minute = parseInt(interaction.fields.getTextInputValue('minute'), 10);
    if (isNaN(hour) || hour < 0 || hour > 23 || isNaN(minute) || minute < 0 || minute > 59) {
      await interaction.reply({ content: 'Invalid hour/minute. Use 0-23 and 0-59.', ephemeral: true });
      return true;
    }

    wiz.hour = hour;
    wiz.minute = minute;
    const offsetsRaw = interaction.fields.getTextInputValue('offsets') || '60,10';
    wiz.offsets = offsetsRaw
      .split(',')
      .map((x) => parseInt(x.trim(), 10))
      .filter((n) => !isNaN(n) && n >= 0)
      .slice(0, 5);
    if (!wiz.offsets.length) wiz.offsets = [60];

    try {
      if (wiz.type === 'once') wiz.date = interaction.fields.getTextInputValue('date');
      if (wiz.type === 'every_x_days') wiz.intervalDays = parseInt(interaction.fields.getTextInputValue('interval'), 10);
      if (wiz.type === 'weekly') {
        wiz.weekdays = interaction.fields
          .getTextInputValue('weekdays')
          .split(',')
          .map((x) => parseInt(x.trim(), 10))
          .filter((n) => n >= 0 && n <= 6);
      }
      if (wiz.type === 'monthly') wiz.monthDay = parseInt(interaction.fields.getTextInputValue('monthday'), 10);
    } catch {
      /* optional fields */
    }

    wiz.step = 'channel';
    setWizard(userId, wiz);

    const channelMenu = new ChannelSelectMenuBuilder()
      .setCustomId(`er_channel:${userId}`)
      .setPlaceholder('Select channel for reminders')
      .addChannelTypes(ChannelType.GuildText)
      .setMaxValues(1);

    await interaction.reply({
      embeds: [
        makeEmbed({
          title: '📅 Event Reminder Setup',
          description:
            `Event: **${wiz.event}**\n` +
            `Type: **${wiz.type}** · ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} UTC\n\n` +
            `**Step 3/4** — Choose the channel`,
          color: 'info',
        }),
      ],
      components: [new ActionRowBuilder().addComponents(channelMenu)],
      ephemeral: true,
    });
    return true;
  }

  /* Step 4: channel selected → confirm */
  if (id.startsWith('er_channel:')) {
    const wiz = getWizard(userId);
    if (!wiz) {
      await interaction.reply({ content: 'Setup expired.', ephemeral: true });
      return true;
    }
    wiz.channelId = interaction.values[0];
    wiz.step = 'confirm';
    setWizard(userId, wiz);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`er_confirm:${userId}`).setLabel('Create reminder').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`er_cancel:${userId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    );

    const preview = {
      event: wiz.event,
      type: wiz.type,
      time: `${String(wiz.hour).padStart(2, '0')}:${String(wiz.minute).padStart(2, '0')} UTC`,
      channel: `<#${wiz.channelId}>`,
      offsets: (wiz.offsets || []).map((o) => `${o}m`).join(', '),
    };

    await interaction.update({
      embeds: [
        makeEmbed({
          title: '📅 Confirm reminder',
          description:
            `**${preview.event}**\n` +
            `Schedule: ${preview.type} at ${preview.time}\n` +
            `Channel: ${preview.channel}\n` +
            `Offsets: ${preview.offsets}\n` +
            `Mention: @everyone`,
          color: 'warning',
        }),
      ],
      components: [row],
    });
    return true;
  }

  if (id.startsWith('er_cancel:')) {
    clearWizard(userId);
    await interaction.update({
      embeds: [makeEmbed({ title: 'Cancelled', description: 'Reminder setup cancelled.', color: 'neutral' })],
      components: [],
    });
    return true;
  }

  if (id.startsWith('er_confirm:')) {
    const wiz = getWizard(userId);
    if (!wiz || !wiz.channelId) {
      await interaction.update({ content: 'Setup expired.', embeds: [], components: [] });
      return true;
    }

    const reminder = createReminder({
      guildId: wiz.guildId || interaction.guildId,
      name: wiz.event,
      type: wiz.type,
      hour: wiz.hour,
      minute: wiz.minute,
      date: wiz.date || null,
      intervalDays: wiz.intervalDays || null,
      weekdays: wiz.weekdays || null,
      monthDay: wiz.monthDay || null,
      channelId: wiz.channelId,
      mention: '@everyone',
      offsets: wiz.offsets || [60, 10],
      createdBy: userId,
    });

    clearWizard(userId);
    const next = getNextOccurrence(reminder);
    const nextStr = next ? `<t:${Math.floor(next.getTime() / 1000)}:F>` : '—';

    await interaction.update({
      embeds: [
        resultEmbed(
          'Reminder created',
          `**${reminder.name}**\n${formatSchedule(reminder)}\nNext: ${nextStr}\nID: \`${reminder.id}\``,
          true
        ),
      ],
      components: [],
    });
    return true;
  }

  return false;
}

module.exports.handleEventReminderUI = handleEventReminderUI;
