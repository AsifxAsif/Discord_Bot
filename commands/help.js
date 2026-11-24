const {
	SlashCommandBuilder,
	PermissionFlagsBits
} = require('discord.js');
const {
	makeEmbed
} = require('../lib/ui');
module.exports = {
	data: new SlashCommandBuilder().setName('help').setDescription('How to use the bot'),
	async execute(interaction) {
		const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) || false;
		const fields = [{
			name: '📝 Account',
			value: '`/register` · `/myregistrations` · `/roster` · `/show` · `/codes`',
			inline: false
		}, {
			name: '🎮 Games',
			value: '`/games` — Opens Kingshot Arcade (all 9 games)\n`/stats` — Your personal game stats\n`/leaderboard` — Top 10 players',
			inline: false
		}, {
			name: '📅 Events',
			value: '`/eventreminder setup` — Dropdowns + form (with rules/note field)\n`/eventreminder list|edit|delete|toggle|test`\n`/eventblog post` — Write it, then **Post now** or **Schedule**\n`/eventblog quick` — Quick LIVE post (now or scheduled)\n`/eventblog list|delete|toggle` — Scheduled announcements',
			inline: false
		}, {
			name: '🔗 Invite',
			value: 'Use the **🎮 Invite** button in the Activity lobby to invite specific players or post invites to channels.',
			inline: false
		}, {
			name: 'Other',
			value: '`/ping` · `/help`',
			inline: false
		}, ];
		if (isAdmin) {
			fields.push({
				name: '⚙️ Admin (hidden from members)',
				value: '`/auto` · `/stats` (bot-wide stats + user breakdown)',
			});
		}
		await interaction.reply({
			embeds: [makeEmbed({
				title: '🏰 Kingshot Bot',
				color: 'info',
				description: 'Gift codes · event tools · games · invites',
				fields,
				footer: 'Admin commands use menus & modals — no long option lists',
			})],
			ephemeral: true,
		});
	},
};
