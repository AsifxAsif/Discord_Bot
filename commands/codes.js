const {
	SlashCommandBuilder
} = require('discord.js');
const {
	fetchActiveCodes
} = require('../lib/codes');
const {
	makeEmbed,
	errorEmbed
} = require('../lib/ui');
const {
	isBlacklisted,
	loadSeen,
	loadBlacklist,
	getPendingMembers,
	countFidStatuses,
} = require('../lib/store');
const {
	buildAllRedeemTargets
} = require('../lib/registrations');
module.exports = {
	data: new SlashCommandBuilder().setName('codes').setDescription('List active gift codes and bot progress'),
	async execute(interaction) {
		await interaction.deferReply({
			ephemeral: true
		});
		let active = [];
		try {
			active = await fetchActiveCodes();
		} catch (e) {
			return interaction.editReply({
				embeds: [errorEmbed('Could not load gift codes', e.message)]
			});
		}
		let targets = [];
		try {
			targets = await buildAllRedeemTargets();
		} catch {
			targets = [];
		}
		const lines = active.map((c) => {
			const bl = isBlacklisted(c.code);
			if (bl) return `🔴 \`${c.code}\` — **Blacklisted**`;
			const pending = getPendingMembers(c.code, targets);
			const counts = countFidStatuses(c.code);
			const exp = c.expiresAt ? ` · exp ${String(c.expiresAt).slice(0, 10)}` : '';
			if (!targets.length) {
				return `🟡 \`${c.code}\` — **Awaiting** (no registrations)${exp}`;
			}
			if (pending.length === 0 && counts.total > 0) {
				return `🟢 \`${c.code}\` — **Done** for current roster (${counts.success + counts.already} ok)${exp}`;
			}
			if (pending.length > 0 && counts.total > 0) {
				return `🟡 \`${c.code}\` — **${pending.length} pending** (new members / retries)${exp}`;
			}
			return `🟡 \`${c.code}\` — **Not yet** for current roster${exp}`;
		});
		const seen = loadSeen();
		const bl = loadBlacklist();
		return interaction.editReply({
			embeds: [
				makeEmbed({
					title: '🎁 Active gift codes',
					color: 'info',
					description: lines.join('\n') || '_No active codes_',
					fields: [{
						name: 'Active',
						value: String(active.length),
						inline: true
					}, {
						name: 'Tracked codes',
						value: String(Object.keys(seen.codes || {}).length),
						inline: true
					}, {
						name: 'Blacklisted',
						value: String(bl.length),
						inline: true
					}, {
						name: 'Current roster',
						value: String(targets.length),
						inline: true
					}, {
						name: 'Legend',
						value: '🟢 Done · 🟡 Pending / not yet · 🔴 Blacklisted',
					}, ],
					footer: 'New alliance members stay pending until redeemed',
				}),
			],
		});
	},
};
