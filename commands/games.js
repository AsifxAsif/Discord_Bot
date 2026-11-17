const { SlashCommandBuilder } = require('discord.js');
const core = require('../games/core');
const solo = require('../games/solo');
const versus = require('../games/versus');
const stats = require('../lib/gamestats');

const { embed } = core;

const opp = (s) => s.addUserOption((o) => o.setName('opponent').setDescription('Who to challenge').setRequired(true));

async function showStats(interaction) {
  const user = interaction.options.getUser('user') || interaction.user;
  const st = stats.getStats(user.id);
  const rate = st.played ? Math.round((st.wins / st.played) * 100) : 0;
  const per = Object.entries(st.games || {})
    .map(([k, g]) => `• **${k}** — ${g.wins}/${g.played} wins`)
    .join('\n') || '_No games played yet_';
  return interaction.reply({
    embeds: [
      embed({
        title: `📊 Game stats — ${user.username}`,
        color: 'info',
        fields: [
          { name: '⭐ Points', value: `**${st.points}**`, inline: true },
          { name: 'Played', value: String(st.played), inline: true },
          { name: 'Win rate', value: `${rate}%`, inline: true },
          { name: 'W / L / D', value: `${st.wins} / ${st.losses} / ${st.draws}`, inline: true },
          { name: '🔥 Win streak', value: `${st.streak} (best ${st.bestStreak})`, inline: true },
          { name: '📅 Daily streak', value: `${st.daily?.streak || 0} (best ${st.daily?.best || 0})`, inline: true },
          { name: 'By game', value: per },
        ],
      }),
    ],
    flags: core.EPH,
  });
}

async function launchActivity(interaction) {
  const response = await fetch(`https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 12 }), // LAUNCH_ACTIVITY
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error('[games] Activity launch failed:', response.status, detail);
    throw new Error('Discord could not launch Kingshot Arcade. Make sure Activities are enabled for this application and try the App Launcher.');
  }
}

async function showLeaderboard(interaction) {
  const top = stats.leaderboard(10);
  const medals = ['🥇', '🥈', '🥉'];
  const lines = top.map((u, i) => `${medals[i] || `**${i + 1}.**`} <@${u.id}> — **${u.points}** pts · ${u.wins}W ${u.losses}L ${u.draws}D`);
  return interaction.reply({
    embeds: [embed({ title: '🏆 Games leaderboard', description: lines.join('\n') || '_No games played yet — be the first!_', color: 'gold', footer: 'Win = 5 pts · Draw = 2 · Loss = 1 · solo games score by performance' })],
    allowedMentions: { parse: [] },
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('games')
    .setDescription('Launch Kingshot Arcade or play chat-based games')
    .addSubcommand((s) => s.setName('activity').setDescription('Launch the graphical Kingshot Arcade Activity inside Discord'))
    .addSubcommand((s) => s.setName('trivia').setDescription('5-question Kingshot trivia (private)'))
    .addSubcommand((s) =>
      s
        .setName('guess')
        .setDescription('Guess the number (private)')
        .addIntegerOption((o) => o.setName('max').setDescription('Highest number (default 100)').setMinValue(10).setMaxValue(1000))
    )
    .addSubcommand((s) => s.setName('hangman').setDescription('Hangman with a letter keyboard (private)'))
    .addSubcommand((s) => s.setName('scramble').setDescription('Word scramble rounds (private)'))
    .addSubcommand((s) => s.setName('daily').setDescription('Daily challenge — same number for everyone, keep your streak'))
    .addSubcommand((s) => opp(s.setName('rps').setDescription('Rock Paper Scissors — first to 2')))
    .addSubcommand((s) => opp(s.setName('tictactoe').setDescription('Tic-Tac-Toe 1v1')))
    .addSubcommand((s) => opp(s.setName('connect4').setDescription('Connect Four 1v1')))
    .addSubcommand((s) => opp(s.setName('reaction').setDescription('Reaction duel — first to 2')))
    .addSubcommand((s) =>
      s
        .setName('stats')
        .setDescription('Your game stats')
        .addUserOption((o) => o.setName('user').setDescription('Someone else (optional)'))
    )
    .addSubcommand((s) => s.setName('leaderboard').setDescription('Top players')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'activity') return launchActivity(interaction);
    if (sub === 'stats') return showStats(interaction);
    if (sub === 'leaderboard') return showLeaderboard(interaction);
    if (solo.SUB_TO_KEY[sub]) {
      const key = solo.SUB_TO_KEY[sub];
      return key === 'guess'
        ? solo.STARTERS.guess(interaction, false, interaction.options.getInteger('max') || 100)
        : solo.STARTERS[key](interaction, false);
    }
    if (versus.SUB_TO_KEY[sub]) return versus.challenge(interaction, versus.SUB_TO_KEY[sub]);
  },
};

/** Routes every `g:<game>:…` button / select / modal. Returns true if handled. */
module.exports.handleGamesUI = async function handleGamesUI(interaction) {
  const id = interaction.customId || '';
  if (!id.startsWith('g:')) return false;
  const parts = id.split(':');
  const key = parts[1];
  try {
    if (solo.KEYS.has(key)) await solo.handle(interaction, parts);
    else if (versus.KEYS.has(key)) await versus.handle(interaction, parts);
    else return false;
  } catch (e) {
    console.error(`[games] ${id} failed:`, e);
    const payload = { content: '⚠️ Something went wrong with that game. Try starting a new one.', flags: core.EPH };
    if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
  }
  return true;
};
