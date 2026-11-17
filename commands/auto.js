const {
	SlashCommandBuilder,
	EmbedBuilder,
	PermissionFlagsBits,
} = require("discord.js");
const {
	denyIfNotAdmin
} = require("../lib/admin");
const {
	loadAutoState,
	loadSeen
} = require("../lib/store");
const {
	fetchActiveCodes
} = require("../lib/codes");
const auto = require("../lib/auto");
const {
	makeEmbed,
	resultEmbed,
	errorEmbed
} = require("../lib/ui");
module.exports = {
	data: new SlashCommandBuilder().setName("auto").setDescription("Automatic gift-code discovery and redeem (owner only)").setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addSubcommand(s => s.setName("start").setDescription("Start auto: find codes + redeem for all members")).addSubcommand(s => s.setName("stop").setDescription("Stop auto loop")).addSubcommand(s => s.setName("status").setDescription("Show auto status + active codes")).addSubcommand(s => s.setName("scan").setDescription("Run one scan now (find + redeem new codes)")),
	async execute(interaction) {
		if (await denyIfNotAdmin(interaction)) return;
		const sub = interaction.options.getSubcommand();
		if (sub === "status") {
			await interaction.deferReply({
				ephemeral: true
			});
			const state = loadAutoState();
			const seen = loadSeen();
			let activeList = "—";
			let activeCount = 0;
			try {
				const active = await fetchActiveCodes();
				activeCount = active.length;
				activeList = active.map(c => `\`${c.code}\`${c.expiresAt?` (exp ${c.expiresAt.slice(0,10)})`:""}`).join("\n") || "_none_"
			} catch (e) {
				activeList = `Error: ${e.message}`
			}
			const done = Object.keys(seen.codes || {});
			const asDiscordTime = value => value && !Number.isNaN(new Date(value).getTime()) ? `<t:${Math.floor(new Date(value).getTime()/1e3)}:R>` : "No record yet";
			const embed = makeEmbed({
				title: "🤖 Automatic redemption status",
				color: auto.isAutoRunning() ? "success" : "neutral",
				description: auto.isAutoRunning() ? "The scanner is running and will check for newly discovered gift codes." : "The scanner is currently stopped.",
				fields: [{
					name: "Scanner",
					value: auto.isAutoRunning() ? "🟢 Running" : "⏹ Stopped",
					inline: true
				}, {
					name: "Scan interval",
					value: `${(auto.getIntervalMs()/6e4).toFixed(0)} minutes`,
					inline: true
				}, {
					name: "Notify channel",
					value: process.env.NOTIFYCHANNELID ? `<#${process.env.NOTIFYCHANNELID}>` : "Not configured",
					inline: true
				}, {
					name: "Last scan",
					value: asDiscordTime(state.lastScanAt),
					inline: true
				}, {
					name: "Last redemption",
					value: asDiscordTime(state.lastRedeemAt),
					inline: true
				}, {
					name: "Codes processed",
					value: String(done.length),
					inline: true
				}, {
					name: `Active codes (${activeCount})`,
					value: activeList.slice(0, 1e3)
				}],
				footer: "Automatic redemption targets come from explicit registrations"
			});
			return interaction.editReply({
				embeds: [embed]
			})
		}
		if (await denyIfNotAdmin(interaction)) return;
		if (sub === "start") {
			if (!process.env.NOTIFYCHANNELID) {
				await interaction.reply({
					embeds: [makeEmbed({
						title: "🤖 Automatic redemption starting",
						description: "The scanner will run, but no channel notifications will be posted because `NOTIFYCHANNELID` is not configured.",
						color: "warning",
						fields: [{
							name: "Scan interval",
							value: `${(auto.getIntervalMs()/6e4).toFixed(0)} minutes`,
							inline: true
						}, {
							name: "Target source",
							value: "Registered players and alliance members",
							inline: true
						}]
					})],
					ephemeral: true
				})
			} else {
				await interaction.reply({
					embeds: [resultEmbed("Automatic redemption enabled", "The bot will scan for new gift codes and redeem them for registered targets.", true, [{
						name: "Scan interval",
						value: `${(auto.getIntervalMs()/6e4).toFixed(0)} minutes`,
						inline: true
					}, {
						name: "Results channel",
						value: `<#${process.env.NOTIFYCHANNELID}>`,
						inline: true
					}, {
						name: "Targets",
						value: "Registered solo players and alliance members",
						inline: false
					}])],
					ephemeral: true
				})
			}
			auto.startAuto(interaction.client);
			return
		}
		if (sub === "stop") {
			auto.stopAuto();
			return interaction.reply({
				embeds: [makeEmbed({
					title: "⏹ Automatic redemption stopped",
					description: "The scheduled scanner has been stopped. You can restart it with `/auto start`.",
					color: "neutral",
					fields: [{
						name: "Manual scan",
						value: "Use `/auto scan` to run one scan on demand.",
						inline: false
					}]
				})],
				ephemeral: true
			})
		}
		if (sub === "scan") {
			await interaction.deferReply({
				ephemeral: true
			});
			await interaction.editReply({
				embeds: [makeEmbed({
					title: "🔄 Scan in progress",
					description: "Checking active gift codes and processing any new codes for registered targets.",
					color: "info",
					footer: "This may take a while depending on target count and rate limits"
				})]
			});
			await auto.runOnce();
			return interaction.editReply({
				embeds: [resultEmbed("Scan completed", "The scan routine has finished. Check `/auto status` or the configured notification channel for code results.", true)]
			})
		}
	}
};
