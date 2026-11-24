const {
	EmbedBuilder
} = require("discord.js");
const COLORS = {
	success: 5763719,
	info: 5793266,
	warning: 16705372,
	error: 15548997,
	neutral: 10070709
};

function makeEmbed({
	title,
	description,
	color = "info",
	fields = [],
	footer,
	timestamp = true
}) {
	const embed = (new EmbedBuilder).setTitle(title).setColor(COLORS[color] ?? color).setDescription(description || null);
	if (fields.length) embed.addFields(fields);
	if (footer) embed.setFooter({
 text: String(footer).slice(0, 2048)
	});
	if (timestamp) embed.setTimestamp();
	return embed
}

function resultEmbed(title, description, success = true, fields = []) {
	return makeEmbed({
 title: `${success?"[OK]":"[!]"} ${title}`,
 description,
 color: success ? "success" : "error",
 fields
	})
}

function errorEmbed(title, description) {
	return makeEmbed({
 title: `[X] ${title}`,
 description,
 color: "error"
	})
}
module.exports = {
	COLORS,
	makeEmbed,
	resultEmbed,
	errorEmbed
};
