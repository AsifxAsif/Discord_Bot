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
			name: 'ðŸ“ Account',
			value: '`/register` Â· `/myregistrations` Â· `/roster` Â· `/show` Â· `/codes`',
			inline: false
		}, {
			name: 'ðŸŽ® Games',
			value: '`/games` â€” Opens Kingshot Arcade (all 9 games)\n`/stats` â€” Your personal game stats\n`/leaderboard` â€” Top 10 players',
			inline: false
		}, {
			name: 'ðŸ“… Events',
			value: '`/eventreminder setup` â€” Dropdowns + form (with rules/note field)\n`/eventreminder list|edit|delete|toggle|test`\n`/eventblog post` â€” Write it, then **Post now** or **Schedule**\n`/eventblog quick` â€” Quick LIVE post (now or scheduled)\n`/eventblog list|delete|toggle` â€” Scheduled announcements',
			inline: false
		}, {
			name: 'ðŸ”— Invite',
			value: 'Use the **ðŸŽ® Invite** button in the Activity lobby to invite specific players or post invites to channels.',
			inline: false
		}, {
			name: 'Other',
			value: '`/ping` Â· `/help`',
			inline: false
		}, ];
		if (isAdmin) {
			fields.push({
				name: 'âš™ï¸ Admin (hidden from members)',
				value: '`/auto` Â· `/stats` (bot-wide stats + user breakdown)',
			});
		}
		await interaction.reply({
			embeds: [makeEmbed({
				title: 'ðŸ° Kingshot Bot',
				color: 'info',
				description: 'Gift codes Â· event tools Â· games Â· invites',
				fields,
				footer: 'Admin commands use menus & modals â€” no long option lists',
			})],
			ephemeral: true,
		});
	},
};
