require('dotenv').config();
const http = require('http');
const { Client, GatewayIntentBits, Collection, Events, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const auto = require('./lib/auto');
const { errorEmbed } = require('./lib/ui');
const { getLastResultLists } = require('./lib/store');
const { getDueReminders, updateLastFired, addSent, takeSuperseded, takeDueDeletions } = require('./lib/reminders');
const { getDueBlogs, markFired } = require('./lib/blogs');
const { reminderMessage, blogEmbed } = require('./lib/eventembed');
const { deleteMessage } = require('./lib/discordutil');
const { handleGamesUI } = require('./commands/games');
const { handleEventReminderUI } = require('./commands/eventreminder');
const { handleEventBlogUI } = require('./commands/eventblog');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});
client.commands = new Collection();

const PORT = Number(process.env.PORT || 8080);
const { attachActivityServer } = require('./activity-server');
const activityHttpServer = http.createServer();
attachActivityServer(activityHttpServer);
activityHttpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP health check + Kingshot Activity on :${PORT}`);
});

const dir = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
  const cmd = require(path.join(dir, file));
  if (cmd.data && cmd.execute) {
    client.commands.set(cmd.data.name, cmd);
    console.log('Loaded /' + cmd.data.name);
  }
}

/* ---------- Scheduler tick (UTC): reminders, auto-removal, scheduled blogs ---------- */
let tickBusy = false;
async function runSchedulerTick() {
  if (tickBusy) return;
  tickBusy = true;
  try {
    // 1) Event reminders
    for (const { reminder: r, offset, eventTime } of getDueReminders(new Date())) {
      try {
        const ch = await client.channels.fetch(r.channelId);
        if (!ch || !ch.isTextBased()) continue;
        const msg = await ch.send({ content: reminderMessage(r, eventTime) });
        updateLastFired(r.id, offset, new Date().toISOString());
        addSent(r.id, { offset, messageId: msg.id, channelId: ch.id, eventMs: eventTime.getTime() });
        // the newer reminder replaces the earlier ones for the same event
        for (const old of takeSuperseded(r.id, eventTime.getTime(), offset)) {
          await deleteMessage(client, old.channelId, old.messageId);
        }
        console.log(`[reminder] Fired ${r.name} (${offset}m) → #${ch.name}`);
      } catch (e) {
        console.error(`[reminder] Failed ${r.id}:`, e.message);
      }
    }

    // 2) Auto-remove finished reminder messages
    for (const s of takeDueDeletions(Date.now())) {
      await deleteMessage(client, s.channelId, s.messageId);
    }

    // 3) Scheduled event blogs
    for (const { blog: b, eventMs } of getDueBlogs(new Date())) {
      try {
        const ch = await client.channels.fetch(b.channelId);
        if (!ch || !ch.isTextBased()) continue;
        const mention = b.mention === '@everyone' ? '@everyone' : b.mention ? `<@&${b.mention}>` : undefined;
        await ch.send({ content: mention, embeds: [blogEmbed(b)] });
        markFired(b.id, eventMs);
        console.log(`[blog] Posted "${b.title}" → #${ch.name}`);
      } catch (e) {
        console.error(`[blog] Failed ${b.id}:`, e.message);
      }
    }
  } catch (e) {
    console.error('[scheduler] tick error:', e.message);
  } finally {
    tickBusy = false;
  }
}

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
  const autoOff = String(process.env.AUTOREDEEM || 'true').toLowerCase() === 'false';
  if (!autoOff) {
    console.log('AUTOREDEEM ON');
    auto.startAuto(c);
  } else {
    console.log('Auto is OFF. Use /auto start to enable.');
  }
  if (String(process.env.BOOTSTATUS || 'true').toLowerCase() !== 'false') {
    setTimeout(() => auto.postBootStatus(c).catch(console.error), 3000);
  }

  setInterval(runSchedulerTick, 30 * 1000);
  setTimeout(runSchedulerTick, 5000);
  console.log('Scheduler started (reminders + blogs, UTC)');
});

function formatPlayerList(list, title) {
  if (!list || !list.length) return `_No players in **${title}**_`;
  return list
    .slice(0, 40)
    .map((p, i) => `${i + 1}. **${p.name || p.fid}** \`${p.fid}\``)
    .join('\n')
    .slice(0, 3900);
}

client.on(Events.InteractionCreate, async (interaction) => {
  // ===== Redeem detail buttons =====
  if (interaction.isButton() && interaction.customId.startsWith('rdetail:')) {
    try {
      const parts = interaction.customId.split(':');
      const kind = parts[parts.length - 1];
      const code = parts.slice(1, -1).join(':');
      const data = getLastResultLists(code);
      if (!data) {
        return interaction.reply({
          embeds: [errorEmbed('No details', `No stored results for \`${code}\`.`)],
          ephemeral: true,
        });
      }
      let list = [];
      let title = '';
      if (kind === 'success') {
        list = data.success || [];
        title = 'Redeemed';
      } else if (kind === 'already') {
        list = data.already || [];
        title = 'Already claimed';
      } else if (kind === 'failed') {
        list = [...(data.errors || []), ...(data.rate_limit || []), ...(data.failed || [])];
        const map = new Map();
        for (const p of list) map.set(String(p.fid), p);
        list = Array.from(map.values());
        title = 'Couldn’t finish / try later';
      } else {
        return interaction.reply({ embeds: [errorEmbed('Unknown', 'Unknown detail type.')], ephemeral: true });
      }
      const embed = new EmbedBuilder()
        .setTitle(`${title} — ${code}`)
        .setColor(kind === 'success' ? 0x57f287 : kind === 'already' ? 0x5865f2 : 0xed4245)
        .setDescription(formatPlayerList(list, title))
        .setFooter({ text: `${list.length} player(s) · only you can see this` })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (e) {
      console.error(e);
      return interaction.reply({ embeds: [errorEmbed('Error', e.message)], ephemeral: true }).catch(() => {});
    }
  }

  // ===== Registration remove buttons =====
  if (interaction.isButton() && interaction.customId.startsWith('rmreg:')) {
    try {
      const reg = require('./lib/registrations');
      const parts = interaction.customId.split(':');
      if (parts[1] === 'player') {
        const fid = parts[2];
        const owner = parts[3];
        if (interaction.user.id !== owner) {
          return interaction.reply({
            embeds: [errorEmbed('Not yours', 'Only the owner can remove this.')],
            ephemeral: true,
          });
        }
        const ok = reg.removePlayer(owner, fid);
        return interaction.reply({
          content: ok ? `🗑️ Removed player \`${fid}\`` : 'Not found.',
          ephemeral: true,
        });
      }
      if (parts[1] === 'ally') {
        const kid = parts[2];
        const slug = parts[3];
        const owner = parts[4];
        if (interaction.user.id !== owner) {
          return interaction.reply({
            embeds: [errorEmbed('Not yours', 'Only the owner can remove this.')],
            ephemeral: true,
          });
        }
        const ok = reg.removeAlliance(owner, kid, slug);
        return interaction.reply({
          content: ok ? `🗑️ Removed alliance **${slug}** (K${kid})` : 'Not found.',
          ephemeral: true,
        });
      }
    } catch (e) {
      console.error(e);
      return interaction.reply({ embeds: [errorEmbed('Error', e.message)], ephemeral: true }).catch(() => {});
    }
    return;
  }

  // ===== Games (buttons, select menus, modals: customId "g:…") =====
  if (
    (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) &&
    interaction.customId.startsWith('g:')
  ) {
    if (await handleGamesUI(interaction)) return;
  }

  // ===== Event reminder / blog interactive UI =====
  if (interaction.isStringSelectMenu() || interaction.isChannelSelectMenu() || interaction.isButton() || interaction.isModalSubmit()) {
    try {
      if (await handleEventReminderUI(interaction)) return;
      if (await handleEventBlogUI(interaction)) return;
    } catch (e) {
      console.error('UI handler error:', e);
    }
  }

  // ===== Slash commands =====
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(err);
    const msg = {
      embeds: [errorEmbed('Command failed', 'Something went wrong. Please try again.')],
      ephemeral: true,
    };
    if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(() => {});
    else await interaction.reply(msg).catch(() => {});
  }
});

if (!process.env.DISCORDTOKEN) {
  console.error('Missing DISCORDTOKEN in .env');
  process.exit(1);
}
client.login(process.env.DISCORDTOKEN);
