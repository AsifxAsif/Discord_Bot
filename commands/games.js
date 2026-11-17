const {
	SlashCommandBuilder
} = require('discord.js');
const core = require('../games/core');
const stats = require('../lib/gamestats');
const {
	embed
} = core;
/**
 * Launch the Discord Embedded Activity from any gameplay subcommand.
 * Discord handles the Activity window; the Activity's own game menu lets
 * players choose a game and invite friends into the same session.
 */
async function launchActivity(interaction) {
	const response = await fetch(`https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			type: 12
		}), // LAUNCH_ACTIVITY
	});
	if (!response.ok) {
		const detail = await response.text().catch(() => '');
		console.error('[games] Activity launch failed:', response.status, detail);
		throw new Error('Discord could not launch Kingshot Arcade. Make sure Activities are enabled for this application and try the App Launcher.');
	}
}
async function showStats(interaction) {
	const user = interaction.options.getUser('user') || interaction.user;
	const st = stats.getStats(user.id);
	const rate = st.played ? Math.round((st.wins / st.played) * 100) : 0;
	const per = Object.entries(st.games || {}).map(([k, g]) => `• **${k}** — ${g.wins}/${g.played} wins`).join('\n') || '_No games played yet_';
	return interaction.reply({
		embeds: [
			embed({
				title: `📊 Game stats — ${user.username}`,
				color: 'info',
				fields: [{
					name: '⭐ Points',
					value: `**${st.points}**`,
					inline: true
				}, {
					name: 'Played',
					value: String(st.played),
					inline: true
				}, {
					name: 'Win rate',
					value: `${rate}%`,
					inline: true
				}, {
					name: 'W / L / D',
					value: `${st.wins} / ${st.losses} / ${st.draws}`,
					inline: true
				}, {
					name: '🔥 Win streak',
					value: `${st.streak} (best ${st.bestStreak})`,
					inline: true
				}, {
					name: '📅 Daily streak',
					value: `${st.daily?.streak || 0} (best ${st.daily?.best || 0})`,
					inline: true
				}, {
					name: 'By game',
					value: per
				}, ],
			}),
		],
		flags: core.EPH,
	});
}
async function showLeaderboard(interaction) {
	const top = stats.leaderboard(10);
	const medals = ['🥇', '🥈', '🥉'];
	const lines = top.map(
		(u, i) => `${medals[i] || `**${i + 1}.**`} <@${u.id}> — **${u.points}** pts · ${u.wins}W ${u.losses}L ${u.draws}D`);
	return interaction.reply({
		embeds: [
			embed({
				title: '🏆 Games leaderboard',
				description: lines.join('\n') || '_No games played yet — be the first!_',
				color: 'gold',
				footer: 'Win = 5 pts · Draw = 2 · Loss = 1 · solo games score by performance',
			}),
		],
		allowedMentions: {
			parse: []
		},
	});
}
const gameSubcommands = [
	['activity', 'Open the graphical Kingshot Arcade Activity'],
	['trivia', 'Open Kingshot Arcade (choose Trivia inside)'],
	['guess', 'Open Kingshot Arcade (choose Guess the Number inside)'],
	['hangman', 'Open Kingshot Arcade (choose Hangman inside)'],
	['scramble', 'Open Kingshot Arcade (choose Word Scramble inside)'],
	['daily', 'Open Kingshot Arcade (choose Daily Challenge inside)'],
	['rps', 'Open Kingshot Arcade (choose Rock Paper Scissors inside)'],
	['tictactoe', 'Open Kingshot Arcade (choose Tic-Tac-Toe inside)'],
	['connect4', 'Open Kingshot Arcade (choose Connect Four inside)'],
	['reaction', 'Open Kingshot Arcade (choose Reaction Duel inside)'],
];
const builder = new SlashCommandBuilder().setName('games').setDescription('Open Kingshot Arcade and view game stats');
for (const [name, description] of gameSubcommands) {
	builder.addSubcommand((sub) => sub.setName(name).setDescription(description));
}
builder.addSubcommand((sub) => sub.setName('stats').setDescription('Your game stats').addUserOption((option) => option.setName('user').setDescription('Someone else (optional)'))).addSubcommand((sub) => sub.setName('leaderboard').setDescription('Top players'));
module.exports = {
	data: builder,
	async execute(interaction) {
		const sub = interaction.options.getSubcommand();
		if (sub === 'stats') return showStats(interaction);
		if (sub === 'leaderboard') return showLeaderboard(interaction);
		// Every gameplay command now opens the same graphical Activity.
		// The user selects the requested game from the Activity's game menu.
		if (gameSubcommands.some(([name]) => name === sub)) {
			return launchActivity(interaction);
		}
	},
};
