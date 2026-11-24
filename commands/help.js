const {
	SlashCommandBuilder,
	PermissionFlagsBits
} = require('discord.js');
const { makeEmbed } = require('../lib/ui');

module.exports = {
	data: new SlashCommandBuilder().setName('help').setDescription('How to use the bot'),
	async execute(interaction) {
		const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) || false;
		const fields = [
			{
				name: 'Account',
				value: '`/register` | `/myregistrations` | `/roster` | `/show` | `/codes`',
			},
			{
				name: 'Games',
				value: '`/games` — Opens Kingshot Arcade (graphical games UI)',
			},
			{
				name: 'Other',
				value: '`/ping` | `/help`',
			},
		];
		if (isAdmin) {
			fields.push({
				name: 'Admin',
				value:
					'`/event` — Opens Kingshot Arcade (use **Event Desk** inside)\n' +
					'`/auto` | `/stats`',
			});
		}
		await interaction.reply({
			embeds: [
				makeEmbed({
					title: 'Kingshot Bot',
					color: 'info',
					description: 'Gift codes | Arcade games | Event Desk',
					fields,
					footer: 'Events and games use the graphical Kingshot Arcade Activity',
				}),
			],
			ephemeral: true,
		});
	},
};
