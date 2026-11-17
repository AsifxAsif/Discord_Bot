const {
	EmbedBuilder
} = require('discord.js');
const {
	pad
} = require('./schedule');
const BRAND = 'PXD_BOT';

function fmtOffset(min) {
	if (min < 60) return `${min} minute${min === 1 ? '' : 's'}`;
	const h = Math.floor(min / 60);
	const m = min % 60;
	const hs = `${h} hour${h === 1 ? '' : 's'}`;
	return m ? `${hs} ${m} min` : hs;
}
/**
 * Reminder as a plain message (so the @mention really pings):
 *   ⚔️ **Arena** @everyone
 *   <whatever the admin wrote in the reminder details>
 *   -# PXD_BOT · Event: 20:00 UTC
 * No generated text — only what was written in the reminder details.
 */
function reminderMessage(r, eventTime, {
	test = false
} = {}) {
	const mention = r.mention === '@everyone' || !r.mention ? '@everyone' : `<@&${r.mention}>`;
	const lines = [`${r.emoji || '⚔️'} **${test ? '[TEST] ' : ''}${r.name}** ${mention}`];
	if (r.note && String(r.note).trim()) lines.push(String(r.note).trim());
	lines.push(`-# ${BRAND} · Event: ${pad(eventTime.getUTCHours())}:${pad(eventTime.getUTCMinutes())} UTC`);
	return lines.join('\n').slice(0, 2000);
}

function blogEmbed(b) {
	const e = new EmbedBuilder().setTitle(`📢 ${b.title}`.slice(0, 256)).setDescription(String(b.content).slice(0, 4000)).setColor(b.color || 0x5865f2).addFields({
		name: 'Event',
		value: String(b.event).slice(0, 1024),
		inline: true
	}).setFooter({
		text: `${BRAND} · Event Blog`
	}).setTimestamp();
	if (b.image) {
		try {
			e.setImage(b.image);
		} catch {
			/* invalid URL — skip image */
		}
	}
	return e;
}
module.exports = {
	BRAND,
	fmtOffset,
	reminderMessage,
	blogEmbed
};
