const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');
const { isAdmin } = require('../lib/admin');
const { makeEmbed, errorEmbed, resultEmbed } = require('../lib/ui');
const { PRESET_EVENTS } = require('../lib/reminders');

function canManage(interaction) {
  if (isAdmin(interaction)) return true;
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) || false;
}

const blogDrafts = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('eventblog')
    .setDescription('Post event announcements (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName('post').setDescription('Write a blog with a form'))
    .addSubcommand((s) =>
      s
        .setName('quick')
        .setDescription('Quick LIVE announcement')
        .addStringOption((o) =>
          o
            .setName('event')
            .setDescription('Event')
            .setRequired(true)
            .addChoices(...PRESET_EVENTS.slice(0, 24).map((e) => ({ name: e, value: e })))
        )
    ),

  async execute(interaction) {
    if (!canManage(interaction)) {
      return interaction.reply({
        embeds: [errorEmbed('Permission denied', 'Admin only.')],
        ephemeral: true,
      });
    }

    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === 'post') {
      const modal = new ModalBuilder()
        .setCustomId(`eb_modal:${userId}`)
        .setTitle('Event Blog');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('event')
            .setLabel('Event name')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('Bear Trap / Arena / KVK…')
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('title')
            .setLabel('Title')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('Weekend Bear Trap schedule')
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('content')
            .setLabel('Content')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setPlaceholder('Write the announcement…')
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('image')
            .setLabel('Image URL (optional)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder('https://…')
        )
      );

      return interaction.showModal(modal);
    }

    if (sub === 'quick') {
      const eventName = interaction.options.getString('event');
      blogDrafts.set(userId, {
        mode: 'quick',
        event: eventName,
        title: `${eventName} is LIVE!`,
        content:
          `**${eventName}** has started!\n\nGet ready, gather your troops, and fight for glory.\nGood luck, Governors! 🏆`,
        color: 0xed4245,
      });

      const channelMenu = new ChannelSelectMenuBuilder()
        .setCustomId(`eb_channel:${userId}`)
        .setPlaceholder('Post to which channel?')
        .addChannelTypes(ChannelType.GuildText);

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`eb_everyone:${userId}`).setLabel('@everyone ON').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`eb_no_mention:${userId}`).setLabel('No mention').setStyle(ButtonStyle.Secondary)
      );

      blogDrafts.get(userId).mention = '@everyone';

      return interaction.reply({
        embeds: [
          makeEmbed({
            title: 'Quick announcement',
            description: `**${eventName}** — pick a channel, then post.`,
            color: 'info',
          }),
        ],
        components: [new ActionRowBuilder().addComponents(channelMenu), row2],
        ephemeral: true,
      });
    }
  },
};

async function handleEventBlogUI(interaction) {
  const userId = interaction.user.id;
  const id = interaction.customId || '';
  if (!id.startsWith('eb_')) return false;
  if (!canManage(interaction)) {
    await interaction.reply({ content: 'Admin only.', ephemeral: true }).catch(() => {});
    return true;
  }

  if (id.startsWith('eb_modal:')) {
    const event = interaction.fields.getTextInputValue('event');
    const title = interaction.fields.getTextInputValue('title');
    const content = interaction.fields.getTextInputValue('content');
    let image = '';
    try {
      image = interaction.fields.getTextInputValue('image') || '';
    } catch {
      image = '';
    }

    blogDrafts.set(userId, {
      mode: 'post',
      event,
      title,
      content,
      image,
      color: 0x5865f2,
      mention: '@everyone',
    });

    const channelMenu = new ChannelSelectMenuBuilder()
      .setCustomId(`eb_channel:${userId}`)
      .setPlaceholder('Post to which channel?')
      .addChannelTypes(ChannelType.GuildText);

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`eb_everyone:${userId}`).setLabel('@everyone ON').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`eb_no_mention:${userId}`).setLabel('No mention').setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      embeds: [
        makeEmbed({
          title: 'Choose channel',
          description: `**${title}**\n\n${content.slice(0, 200)}${content.length > 200 ? '…' : ''}`,
          color: 'info',
        }),
      ],
      components: [new ActionRowBuilder().addComponents(channelMenu), row2],
      ephemeral: true,
    });
    return true;
  }

  const draft = blogDrafts.get(userId);
  if (!draft) {
    if (interaction.isRepliable()) {
      await interaction.reply({ content: 'Draft expired. Run the command again.', ephemeral: true }).catch(() => {});
    }
    return true;
  }

  if (id.startsWith('eb_everyone:')) {
    draft.mention = '@everyone';
    blogDrafts.set(userId, draft);
    await interaction.reply({ content: 'Will mention **@everyone**', ephemeral: true });
    return true;
  }
  if (id.startsWith('eb_no_mention:')) {
    draft.mention = '';
    blogDrafts.set(userId, draft);
    await interaction.reply({ content: 'No mention.', ephemeral: true });
    return true;
  }

  if (id.startsWith('eb_channel:')) {
    const channelId = interaction.values[0];
    const embed = new EmbedBuilder()
      .setTitle(`📢 ${draft.title}`)
      .setDescription(draft.content)
      .setColor(draft.color || 0x5865f2)
      .addFields({ name: 'Event', value: draft.event, inline: true })
      .setFooter({ text: 'Kingshot Event Blog' })
      .setTimestamp();
    if (draft.image) {
      try {
        embed.setImage(draft.image);
      } catch {
        /* ignore */
      }
    }

    try {
      const ch = await interaction.client.channels.fetch(channelId);
      if (ch?.isTextBased()) {
        await ch.send({
          content: draft.mention || undefined,
          embeds: [embed],
        });
      }
      blogDrafts.delete(userId);
      await interaction.update({
        embeds: [resultEmbed('Posted', `Sent to <#${channelId}>`, true)],
        components: [],
      });
    } catch (e) {
      await interaction.reply({ embeds: [errorEmbed('Failed', e.message)], ephemeral: true }).catch(() => {});
    }
    return true;
  }

  return false;
}

module.exports.handleEventBlogUI = handleEventBlogUI;
