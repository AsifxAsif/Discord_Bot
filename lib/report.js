const {
	EmbedBuilder
} = require("discord.js");
const STATUS_LABEL = {
	success: "âœ… Success",
	already: "â„¹ï¸ Already redeemed",
	expired: "â° Expired",
	invalid: "âŒ Invalid code",
	error: "âš ï¸ Error",
	rate_limit: "ðŸš¦ Rate limited"
};
const STATUS_ORDER = ["success", "already", "rate_limit", "error", "invalid", "expired"];

function buildDetailedReport(code, results, summary, footer) {
	const groups = {};
	for (const r of results) {
		const st = r.status || "error";
		if (!groups[st]) groups[st] = [];
		groups[st].push(r)
	}
	const embeds = [];
	const main = (new EmbedBuilder).setTitle(`ðŸŽ Redeem â€” ${code}`).setColor((summary.success || 0) + (summary.already || 0) > 0 ? 5763719 : 15548997).addFields({
		name: "âœ… Success",
		value: String(summary.success || 0),
		inline: true
	}, {
		name: "â„¹ï¸ Already",
		value: String(summary.already || 0),
		inline: true
	}, {
		name: "ðŸš¦ Rate limit",
		value: String(summary.rate_limit || 0),
		inline: true
	}, {
		name: "âš ï¸ Errors",
		value: String(summary.error || 0),
		inline: true
	}, {
		name: "âŒ Invalid",
		value: String(summary.invalid || 0),
		inline: true
	}, {
		name: "â° Expired",
		value: String(summary.expired || 0),
		inline: true
	}, {
		name: "ðŸ“Š Total targets",
		value: String(results.length),
		inline: true
	}, {
		name: "ðŸ“ˆ Success rate",
		value: `${results.length?Math.round(((summary.success||0)+(summary.already||0))/results.length*100):0}%`,
		inline: true
	}).setFooter({
		text: footer || `${results.length} players Â· rewards â†’ in-game mail`
	}).setTimestamp();
	embeds.push(main);
	for (const st of STATUS_ORDER) {
		const list = groups[st];
		if (!list || !list.length) continue;
		const lines = list.map(r => {
			const name = (r.name || "Unknown").slice(0, 40);
			const extra = st === "error" || st === "invalid" || st === "rate_limit" ? ` â€” ${(r.message||"").slice(0,60)}` : "";
			return `â€¢ **${name}** \`${r.fid}\`${extra}`
		});
		let buf = "";
		let part = 1;
		for (const line of lines) {
			if ((buf + line + "\n").length > 3800) {
				embeds.push((new EmbedBuilder).setTitle(`${STATUS_LABEL[st]||st}${part>1?` (${part})`:""} â€” ${list.length} players`).setDescription(buf).setColor(st === "success" ? 5763719 : st === "already" ? 5793266 : 15548997));
				buf = "";
				part++
			}
			buf += line + "\n"
		}
		if (buf) {
			embeds.push((new EmbedBuilder).setTitle(`${STATUS_LABEL[st]||st}${part>1?` (${part})`:""} â€” ${list.length} players`).setDescription(buf).setColor(st === "success" ? 5763719 : st === "already" ? 5793266 : 15548997))
		}
	}
	return embeds.slice(0, 10)
}
module.exports = {
	buildDetailedReport,
	STATUS_LABEL
};
