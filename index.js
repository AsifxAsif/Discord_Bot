require('dotenv').config();
const http = require('http');
const {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const auto = require('./lib/auto');
const { errorEmbed, makeEmbed, resultEmbed } = require('./lib/ui');
const { getLastResultLists } = require('./lib/store');
const { getDueReminders, updateLastFired } = require('./lib/reminders');
const gamesLib = require('./lib/games');
const gamesCmd = require('./commands/games');
const { handleEventReminderUI } = require('./commands/eventreminder');
const { handleEventBlogUI } = require('./commands/eventblog');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});
client.commands = new Collection();

const PORT = process.env.PORT || 8080;
http
  .createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  })
  .listen(PORT, '0.0.0.0', () => console.log(`HTTP health check on :${PORT}`));

const dir = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
  const cmd = require(path.join(dir, file));
  if (cmd.data && cmd.execute) {
    client.commands.set(cmd.data.name, cmd);
    console.log('Loaded /' + cmd.data.name);
  }
}

/* ---------- Event Reminder Scheduler (UTC) ---------- */
async function runReminderTick() {
  try {
    const due = getDueReminders(new Date());
    for (const { reminder: r, offset, eventTime } of due) {
      try {
        const ch = await client.channels.fetch(r.channelId);
        if (!ch || !ch.isTextBased()) continue;
        const mention = r.mention === '@everyone' ? '@everyone' : `<@&${r.mention}>`;
        const when = `<t:${Math.floor(eventTime.getTime() / 1000)}:R>`;
        const embed = new EmbedBuilder()
          .setTitle(`⚔️ ${r.name}`)
          .setColor(0xed4245)
          .setDescription(
            offset === 0
              ? `**Event is starting now!**`
              : `**Starting in ${offset} minute(s)** (${when})`
          )
          .setFooter({ text: 'Kingshot Event Reminder · UTC' })
          .setTimestamp();
        await ch.send({ content: mention, embeds: [embed] });
        updateLastFired(r.id, offset, new Date().toISOString());
        console.log(`[reminder] Fired ${r.name} (${offset}m) → #${ch.name}`);
      } catch (e) {
        console.error(`[reminder] Failed ${r.id}:`, e.message);
      }
    }
  } catch (e) {
    console.error('[reminder] tick error:', e.message);
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

  // Reminder loop every 30 seconds
  setInterval(runReminderTick, 30 * 1000);
  setTimeout(runReminderTick, 5000);
  console.log('Event reminder scheduler started (UTC)');
});

function formatPlayerList(list, title) {
  if (!list || !list.length) return `_No players in **${title}**_`;
  return list
    .slice(0, 40)
    .map((p, i) => `${i + 1}. **${p.name || p.fid}** \`${p.fid}\``)
    .join('\n')
    .slice(0, 3900);
}

/* ---------- RPS choices ---------- */
const RPS = {
  rock: { beats: 'scissors', emoji: '🪨' },
  paper: { beats: 'rock', emoji: '📄' },
  scissors: { beats: 'paper', emoji: '✂️' },
};

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

  // ===== Game challenge accept / decline =====
  if (interaction.isButton()) {
    const id = interaction.customId;

    // --- RPS ---
    if (id.startsWith('rps_accept:') || id.startsWith('rps_decline:')) {
      const [, challengerId, opponentId] = id.split(':');
      if (interaction.user.id !== opponentId) {
        return interaction.reply({ content: 'This challenge is not for you.', ephemeral: true });
      }
      if (id.startsWith('rps_decline:')) {
        return interaction.update({ content: '❌ Challenge declined.', components: [] });
      }
      // Start RPS picks
      const pickRow = (uid) =>
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`rps_pick:rock:${challengerId}:${opponentId}:${uid}`).setLabel('🪨 Rock').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`rps_pick:paper:${challengerId}:${opponentId}:${uid}`).setLabel('📄 Paper').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`rps_pick:scissors:${challengerId}:${opponentId}:${uid}`).setLabel('✂️ Scissors').setStyle(ButtonStyle.Primary)
        );
      gamesLib.setGame(`rps:${challengerId}:${opponentId}`, { picks: {} });
      await interaction.update({
        content: `🎮 **Rock Paper Scissors**\nBoth players: pick your move!`,
        components: [pickRow(challengerId), pickRow(opponentId)],
      });
      return;
    }

    if (id.startsWith('rps_pick:')) {
      const [, choice, challengerId, opponentId, forUser] = id.split(':');
      if (interaction.user.id !== forUser) {
        return interaction.reply({ content: 'Not your button.', ephemeral: true });
      }
      const key = `rps:${challengerId}:${opponentId}`;
      const state = gamesLib.getGame(key) || { picks: {} };
      state.picks[forUser] = choice;
      gamesLib.setGame(key, state);

      if (state.picks[challengerId] && state.picks[opponentId]) {
        const a = state.picks[challengerId];
        const b = state.picks[opponentId];
        let result;
        if (a === b) result = 'It’s a **draw**!';
        else if (RPS[a].beats === b) result = `<@${challengerId}> wins!`;
        else result = `<@${opponentId}> wins!`;
        gamesLib.endGame(key);
        return interaction.update({
          content: null,
          embeds: [
            makeEmbed({
              title: '🪨📄✂️ Rock Paper Scissors',
              description:
                `<@${challengerId}> ${RPS[a].emoji} **${a}**\n` +
                `<@${opponentId}> ${RPS[b].emoji} **${b}**\n\n${result}`,
              color: 'success',
            }),
          ],
          components: [],
        });
      }
      return interaction.reply({ content: `You picked **${choice}**. Waiting for opponent…`, ephemeral: true });
    }

    // --- Tic-Tac-Toe ---
    if (id.startsWith('ttt_accept:') || id.startsWith('ttt_decline:')) {
      const [, challengerId, opponentId] = id.split(':');
      if (interaction.user.id !== opponentId) {
        return interaction.reply({ content: 'This challenge is not for you.', ephemeral: true });
      }
      if (id.startsWith('ttt_decline:')) {
        return interaction.update({ content: '❌ Challenge declined.', components: [] });
      }
      const board = gamesCmd.emptyBoard();
      const key = `ttt:${challengerId}:${opponentId}`;
      gamesLib.setGame(key, { board, turn: challengerId, p1: challengerId, p2: opponentId });
      const rows = [];
      for (let r = 0; r < 3; r++) {
        const row = new ActionRowBuilder();
        for (let c = 0; c < 3; c++) {
          const i = r * 3 + c;
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`ttt_move:${i}:${challengerId}:${opponentId}`)
              .setLabel(String(i + 1))
              .setStyle(ButtonStyle.Secondary)
          );
        }
        rows.push(row);
      }
      return interaction.update({
        content: `❌ <@${challengerId}> vs ⭕ <@${opponentId}>\nTurn: <@${challengerId}>`,
        embeds: [makeEmbed({ title: 'Tic-Tac-Toe', description: gamesCmd.renderBoard(board), color: 'info' })],
        components: rows,
      });
    }

    if (id.startsWith('ttt_move:')) {
      const [, idxStr, p1, p2] = id.split(':');
      const idx = Number(idxStr);
      const key = `ttt:${p1}:${p2}`;
      const state = gamesLib.getGame(key);
      if (!state) return interaction.reply({ content: 'Game ended.', ephemeral: true });
      if (interaction.user.id !== state.turn) {
        return interaction.reply({ content: 'Not your turn.', ephemeral: true });
      }
      if (state.board[idx]) {
        return interaction.reply({ content: 'Cell taken.', ephemeral: true });
      }
      const symbol = state.turn === state.p1 ? 'X' : 'O';
      state.board[idx] = symbol;
      const winner = gamesCmd.checkWinner(state.board);
      if (winner) {
        gamesLib.endGame(key);
        const msg =
          winner === 'draw'
            ? 'It’s a **draw**!'
            : `**${winner === 'X' ? '❌' : '⭕'} <@${winner === 'X' ? state.p1 : state.p2}> wins!**`;
        return interaction.update({
          content: msg,
          embeds: [makeEmbed({ title: 'Tic-Tac-Toe — Finished', description: gamesCmd.renderBoard(state.board), color: 'success' })],
          components: [],
        });
      }
      state.turn = state.turn === state.p1 ? state.p2 : state.p1;
      gamesLib.setGame(key, state);
      const rows = [];
      for (let r = 0; r < 3; r++) {
        const row = new ActionRowBuilder();
        for (let c = 0; c < 3; c++) {
          const i = r * 3 + c;
          const cell = state.board[i];
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`ttt_move:${i}:${p1}:${p2}`)
              .setLabel(cell === 'X' ? 'X' : cell === 'O' ? 'O' : String(i + 1))
              .setStyle(cell ? ButtonStyle.Primary : ButtonStyle.Secondary)
              .setDisabled(!!cell)
          );
        }
        rows.push(row);
      }
      return interaction.update({
        content: `❌ <@${state.p1}> vs ⭕ <@${state.p2}>\nTurn: <@${state.turn}>`,
        embeds: [makeEmbed({ title: 'Tic-Tac-Toe', description: gamesCmd.renderBoard(state.board), color: 'info' })],
        components: rows,
      });
    }

    // --- Connect Four ---
    if (id.startsWith('c4_accept:') || id.startsWith('c4_decline:')) {
      const [, challengerId, opponentId] = id.split(':');
      if (interaction.user.id !== opponentId) {
        return interaction.reply({ content: 'This challenge is not for you.', ephemeral: true });
      }
      if (id.startsWith('c4_decline:')) {
        return interaction.update({ content: '❌ Challenge declined.', components: [] });
      }
      const board = gamesCmd.emptyC4();
      const key = `c4:${challengerId}:${opponentId}`;
      gamesLib.setGame(key, { board, turn: challengerId, p1: challengerId, p2: opponentId });
      const row = new ActionRowBuilder();
      for (let c = 0; c < 7; c++) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`c4_drop:${c}:${challengerId}:${opponentId}`)
            .setLabel(String(c + 1))
            .setStyle(ButtonStyle.Primary)
        );
      }
      return interaction.update({
        content: `🔴 <@${challengerId}> vs 🟡 <@${opponentId}>\nTurn: <@${challengerId}>`,
        embeds: [makeEmbed({ title: 'Connect Four', description: gamesCmd.renderC4(board), color: 'info' })],
        components: [row],
      });
    }

    if (id.startsWith('c4_drop:')) {
      const [, colStr, p1, p2] = id.split(':');
      const col = Number(colStr);
      const key = `c4:${p1}:${p2}`;
      const state = gamesLib.getGame(key);
      if (!state) return interaction.reply({ content: 'Game ended.', ephemeral: true });
      if (interaction.user.id !== state.turn) {
        return interaction.reply({ content: 'Not your turn.', ephemeral: true });
      }
      const piece = state.turn === state.p1 ? 'R' : 'Y';
      const row = gamesCmd.dropC4(state.board, col, piece);
      if (row < 0) return interaction.reply({ content: 'Column full.', ephemeral: true });
      if (gamesCmd.checkC4(state.board, row, col, piece)) {
        gamesLib.endGame(key);
        return interaction.update({
          content: `**${piece === 'R' ? '🔴' : '🟡'} <@${state.turn}> wins!**`,
          embeds: [makeEmbed({ title: 'Connect Four — Finished', description: gamesCmd.renderC4(state.board), color: 'success' })],
          components: [],
        });
      }
      // draw check
      if (state.board[0].every((c) => c)) {
        gamesLib.endGame(key);
        return interaction.update({
          content: 'It’s a **draw**!',
          embeds: [makeEmbed({ title: 'Connect Four — Draw', description: gamesCmd.renderC4(state.board), color: 'neutral' })],
          components: [],
        });
      }
      state.turn = state.turn === state.p1 ? state.p2 : state.p1;
      gamesLib.setGame(key, state);
      const btnRow = new ActionRowBuilder();
      for (let c = 0; c < 7; c++) {
        btnRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`c4_drop:${c}:${p1}:${p2}`)
            .setLabel(String(c + 1))
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!!state.board[0][c])
        );
      }
      return interaction.update({
        content: `🔴 <@${state.p1}> vs 🟡 <@${state.p2}>\nTurn: <@${state.turn}>`,
        embeds: [makeEmbed({ title: 'Connect Four', description: gamesCmd.renderC4(state.board), color: 'info' })],
        components: [btnRow],
      });
    }

    // --- Reaction Duel ---
    if (id.startsWith('react_accept:') || id.startsWith('react_decline:')) {
      const [, challengerId, opponentId] = id.split(':');
      if (interaction.user.id !== opponentId) {
        return interaction.reply({ content: 'This challenge is not for you.', ephemeral: true });
      }
      if (id.startsWith('react_decline:')) {
        return interaction.update({ content: '❌ Challenge declined.', components: [] });
      }
      await interaction.update({
        content: `⚡ Get ready…`,
        components: [],
      });
      const delay = 2000 + Math.floor(Math.random() * 4000);
      setTimeout(async () => {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`react_go:${challengerId}:${opponentId}`)
            .setLabel('🔥 CLICK!')
            .setStyle(ButtonStyle.Danger)
        );
        try {
          const msg = await interaction.editReply({
            content: `⚡ **NOW!** First to click wins!`,
            components: [row],
          });
          const click = await msg.awaitMessageComponent({
            componentType: ComponentType.Button,
            time: 10000,
            filter: (i) =>
              i.customId === `react_go:${challengerId}:${opponentId}` &&
              (i.user.id === challengerId || i.user.id === opponentId),
          });
          await click.update({
            content: `🏆 <@${click.user.id}> wins the reaction duel!`,
            components: [],
          });
        } catch {
          await interaction.editReply({ content: '⏰ Nobody clicked in time.', components: [] }).catch(() => {});
        }
      }, delay);
      return;
    }
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

  // ===== Solo game modals (private) =====
  if (interaction.isModalSubmit() && interaction.customId.startsWith('game_')) {
    try {
      const { getGame, setGame, endGame, randomInt } = require('./lib/games');
      const { resultEmbed, makeEmbed, errorEmbed } = require('./lib/ui');
      const id = interaction.customId;

      if (id.startsWith('game_trivia:')) {
        const key = id.slice('game_trivia:'.length);
        const state = getGame(key);
        endGame(key);
        if (!state) {
          return interaction.reply({ embeds: [errorEmbed('Expired', 'This trivia question expired.')], ephemeral: true });
        }
        const ans = interaction.fields.getTextInputValue('answer').toLowerCase().trim();
        const correct = (state.answers || []).some((a) => ans.includes(a));
        return interaction.reply({
          embeds: [
            resultEmbed(
              correct ? 'Correct!' : 'Wrong',
              correct ? `✅ **${ans}** is right!` : `Answer: **${state.answers[0]}**\nQuestion: ${state.q}`,
              correct
            ),
          ],
          ephemeral: true,
        });
      }

      if (id.startsWith('game_guess:')) {
        const key = id.slice('game_guess:'.length);
        const state = getGame(key);
        if (!state) {
          return interaction.reply({ embeds: [errorEmbed('No game', 'Start a new game with /games guess')], ephemeral: true });
        }
        const n = parseInt(interaction.fields.getTextInputValue('guess'), 10);
        state.tries = (state.tries || 0) + 1;
        if (isNaN(n)) {
          return interaction.reply({ content: 'Please enter a valid number.', ephemeral: true });
        }
        if (n === state.secret) {
          endGame(key);
          return interaction.reply({
            embeds: [resultEmbed('You got it!', `**${state.secret}** in ${state.tries} tries 🎉`, true)],
            ephemeral: true,
          });
        }
        if (state.tries >= 8) {
          endGame(key);
          return interaction.reply({
            embeds: [resultEmbed('Out of tries', `The number was **${state.secret}**`, false)],
            ephemeral: true,
          });
        }
        setGame(key, state);
        const hint = n < state.secret ? 'Higher ⬆️' : 'Lower ⬇️';
        // Offer another modal attempt via button
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`guess_again:${key}`)
            .setLabel(`Try again (${8 - state.tries} left)`)
            .setStyle(ButtonStyle.Primary)
        );
        return interaction.reply({
          content: `${hint} · tries left: **${8 - state.tries}**`,
          components: [row],
          ephemeral: true,
        });
      }

      if (id.startsWith('game_hang:')) {
        const key = id.slice('game_hang:'.length);
        const state = getGame(key);
        if (!state) {
          return interaction.reply({ embeds: [errorEmbed('No game', 'Start with /games hangman')], ephemeral: true });
        }
        const letter = interaction.fields.getTextInputValue('letter').toUpperCase().trim();
        if (!/^[A-Z]$/.test(letter)) {
          return interaction.reply({ content: 'Enter a single letter A–Z.', ephemeral: true });
        }
        if (state.guessed.includes(letter)) {
          return interaction.reply({ content: 'Already guessed that letter.', ephemeral: true });
        }
        state.guessed.push(letter);
        if (!state.word.includes(letter)) state.lives--;
        const display = state.word
          .split('')
          .map((c) => (state.guessed.includes(c) ? c : '_'))
          .join(' ');
        const done = state.word.split('').every((c) => state.guessed.includes(c));
        if (done) {
          endGame(key);
          return interaction.reply({
            embeds: [resultEmbed('You won!', `Word: **${state.word}**`, true)],
            ephemeral: true,
          });
        }
        if (state.lives <= 0) {
          endGame(key);
          return interaction.reply({
            embeds: [resultEmbed('You lost', `Word was **${state.word}**`, false)],
            ephemeral: true,
          });
        }
        setGame(key, state);
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`hang_again:${key}`)
            .setLabel('Guess next letter')
            .setStyle(ButtonStyle.Primary)
        );
        return interaction.reply({
          embeds: [
            makeEmbed({
              title: '🪝 Hangman',
              description: `\`${display}\`\nLives: ${'❤️'.repeat(state.lives)}${'🖤'.repeat(6 - state.lives)}\nGuessed: ${state.guessed.join(', ')}`,
              color: 'info',
            }),
          ],
          components: [row],
          ephemeral: true,
        });
      }

      if (id.startsWith('game_scramble:')) {
        const key = id.slice('game_scramble:'.length);
        const state = getGame(key);
        endGame(key);
        if (!state) {
          return interaction.reply({ embeds: [errorEmbed('Expired', 'This scramble expired.')], ephemeral: true });
        }
        const ans = interaction.fields.getTextInputValue('answer').toUpperCase().trim();
        const correct = ans === state.word;
        return interaction.reply({
          embeds: [
            resultEmbed(correct ? 'Correct!' : 'Wrong', correct ? `✅ **${state.word}**` : `Answer: **${state.word}**`, correct),
          ],
          ephemeral: true,
        });
      }

      if (id.startsWith('game_daily:')) {
        const key = id.slice('game_daily:'.length);
        const state = getGame(key);
        if (!state || state.done) {
          return interaction.reply({ embeds: [errorEmbed('Already done', 'Come back tomorrow!')], ephemeral: true });
        }
        const n = parseInt(interaction.fields.getTextInputValue('guess'), 10);
        state.done = true;
        setGame(key, state);
        const win = n === state.secret;
        return interaction.reply({
          embeds: [
            resultEmbed(
              win ? 'Daily complete — Perfect!' : 'Daily complete',
              win ? `🎯 You nailed **${state.secret}**!` : `Number was **${state.secret}**. Better luck tomorrow!`,
              win
            ),
          ],
          ephemeral: true,
        });
      }
    } catch (e) {
      console.error('Modal game error:', e);
      return interaction.reply({ embeds: [errorEmbed('Error', e.message)], ephemeral: true }).catch(() => {});
    }
    return;
  }

  // Continue guess/hangman via buttons (still ephemeral)
  if (interaction.isButton() && (interaction.customId.startsWith('guess_again:') || interaction.customId.startsWith('hang_again:'))) {
    try {
      const { getGame } = require('./lib/games');
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
      if (interaction.customId.startsWith('guess_again:')) {
        const key = interaction.customId.slice('guess_again:'.length);
        const state = getGame(key);
        if (!state) return interaction.reply({ content: 'Game ended. Start a new one.', ephemeral: true });
        const modal = new ModalBuilder().setCustomId(`game_guess:${key}`).setTitle(`Guess 1–${state.max}`);
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('guess')
              .setLabel(`Tries used: ${state.tries}/8`)
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
        return interaction.showModal(modal);
      }
      if (interaction.customId.startsWith('hang_again:')) {
        const key = interaction.customId.slice('hang_again:'.length);
        const state = getGame(key);
        if (!state) return interaction.reply({ content: 'Game ended.', ephemeral: true });
        const display = state.word.split('').map((c) => (state.guessed.includes(c) ? c : '_')).join(' ');
        const modal = new ModalBuilder().setCustomId(`game_hang:${key}`).setTitle('Hangman — next letter');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('letter')
              .setLabel(`${display} · Lives ${state.lives}`)
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(1)
          )
        );
        return interaction.showModal(modal);
      }
    } catch (e) {
      console.error(e);
      return interaction.reply({ content: 'Error: ' + e.message, ephemeral: true }).catch(() => {});
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
