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
			name: ' Account',
			value: '`/register` `/myregistrations` `/roster` `/show` `/codes`',
		}, {
			name: ' Games',
			value: '`/games` Kingshot Arcade\n`/stats` `/leaderboard` (if available)',
		}, {
			name: 'Other',
			value: '`/ping` `/help`',
		}];
		if (isAdmin) {
			fields.push({
				name: ' Admin',
				value: '`/event` **Event Desk** (all reminders + announcements)\n' + '`/auto` `/stats` (bot)',
			});
		}
		await interaction.reply({
			embeds: [makeEmbed({
				title: ' Kingshot Bot',
				color: 'info',
				description: 'Gift codes Event Desk Games',
				fields,
				footer: 'Admins: one /event command opens the full event interface',
			})],
			ephemeral: true,
		});
	},
};
