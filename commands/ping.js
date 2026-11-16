const {
	SlashCommandBuilder
} = require("discord.js");
const {
	makeEmbed
} = require("../lib/ui");
module.exports = {
	data: (new SlashCommandBuilder).setName("ping").setDescription("Bot latency"),
	async execute(interaction) {
		const sent = await interaction.reply({
			content: "🏓 Measuring latency…",
			fetchReply: true,
			ephemeral: true
		});
		const responseMs = Math.max(0, sent.createdTimestamp - interaction.createdTimestamp);
		const wsMs = Math.round(interaction.client.ws.ping);
		const quality = wsMs < 150 ? "Excellent" : wsMs < 300 ? "Good" : "High latency";
		const embed = makeEmbed({
			title: "🏓 Bot connection status",
			color: wsMs < 300 ? "success" : "warning",
			fields: [{
				name: "Response time",
				value: `\`${responseMs} ms\``,
				inline: true
			}, {
				name: "Discord gateway",
				value: `\`${wsMs} ms\``,
				inline: true
			}, {
				name: "Connection quality",
				value: quality,
				inline: true
			}],
			footer: "Latency can fluctuate with network conditions"
		});
		return interaction.editReply({
			content: null,
			embeds: [embed]
		})
	}
};
