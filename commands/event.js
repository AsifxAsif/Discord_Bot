/**
 * /event — opens Kingshot Arcade Activity (Event Desk lives inside the graphical UI)
 * Same launch method as /games.
 */
const {
	SlashCommandBuilder,
	PermissionFlagsBits,
} = require('discord.js');
const { isAdmin } = require('../lib/admin');
const { errorEmbed } = require('../lib/ui');

function canManage(interaction) {
	if (isAdmin(interaction)) return true;
	return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) || false;
}

/**
 * Discord interaction callback type 12 = LAUNCH_ACTIVITY
 * Opens the embedded Kingshot Arcade app for this server.
 */
async function launchActivity(interaction) {
	const response = await fetch(
		`https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ type: 12 }),
		}
	);
	if (!response.ok) {
		const detail = await response.text().catch(() => '');
		console.error('[event] Activity launch failed:', response.status, detail);
		throw new Error(
			'Discord could not launch Kingshot Arcade. Enable Activities for this app, or open it from the App Launcher.'
		);
	}
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('event')
		.setDescription('Open Kingshot Arcade Event Desk (graphical UI)')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

	async execute(interaction) {
		if (!canManage(interaction)) {
			return interaction.reply({
				embeds: [errorEmbed('Permission denied', 'Admin only.')],
				ephemeral: true,
			});
		}
		try {
			await launchActivity(interaction);
		} catch (e) {
			// If already responded via type 12, followUp may fail — try reply only if needed
			if (interaction.replied || interaction.deferred) {
				return interaction.followUp({
					embeds: [errorEmbed('Could not open Activity', e.message)],
					ephemeral: true,
				}).catch(() => {});
			}
			return interaction.reply({
				embeds: [errorEmbed('Could not open Activity', e.message)],
				ephemeral: true,
			});
		}
	},
};

// No message-component Event Desk — UI is inside the Activity
async function handleEventUI() {
	return false;
}

module.exports.handleEventUI = handleEventUI;
