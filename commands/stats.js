const {
	SlashCommandBuilder,
	PermissionFlagsBits,
	EmbedBuilder,
	MessageFlags
} = require('discord.js');
const {
	denyIfNotAdmin
} = require('../lib/admin');
const reg = require('../lib/registrations');
const {
	stats,
	buildAllRedeemTargets
} = reg;
const listAllUsers = typeof reg.listAllUsers === 'function' ? reg.listAllUsers : () => [];
const {
	loadAutoState,
	loadSeen,
	getEffectiveDelayMs
} = require('../lib/store');
const {
	makeEmbed
} = require('../lib/ui');
const auto = require('../lib/auto');
module.exports = {
	data: new SlashCommandBuilder().setName('stats').setDescription('Bot stats and registered users (owner only)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
		if (await denyIfNotAdmin(interaction)) return;
		await interaction.deferReply({
			flags: MessageFlags.Ephemeral
		});
		const s = stats();
		const targets = await buildAllRedeemTargets();
		const st = loadAutoState();
		const seen = loadSeen();
		const users = listAllUsers();
		// Overview embed
		const overview = makeEmbed({
			title: ' Bot stats',
			color: 'info',
			fields: [{
				name: 'Discord users registered',
				value: String(s.users),
				inline: true
			}, {
				name: 'Solo players (total)',
				value: String(s.players),
				inline: true
			}, {
				name: 'Alliances (total)',
				value: String(s.alliances),
				inline: true
			}, {
				name: 'Unique redeem targets',
				value: String(targets.length),
				inline: true
			}, {
				name: 'Auto running',
				value: auto.isAutoRunning() ? 'Yes' : 'No',
				inline: true
			}, {
				name: 'Tracked codes',
				value: String(Object.keys(seen.codes || {}).length),
				inline: true
			}, {
				name: 'Last scan',
				value: st.lastScanAt ? st.lastScanAt.slice(0, 19).replace('T', ' ') : ' - ',
				inline: true
			}, {
				name: 'Last redeem',
				value: st.lastRedeemAt ? st.lastRedeemAt.slice(0, 19).replace('T', ' ') : ' - ',
				inline: true
			}, ],
			footer: 'Only you can see this | roster refreshes each auto cycle',
		});
		// User breakdown (ephemeral, owner only)
		const lines = [];
		for (const u of users.slice(0, 20)) {
			let mention = `\`${u.discordId}\``;
			try {
				const user = await interaction.client.users.fetch(u.discordId);
				mention = `**${user.tag}** (\`${u.discordId}\`)`;
			} catch {
				/* keep id */
			}
			const players = (u.players || []).map((p) => `${p.name || 'Player'} \`${p.fid}\` K${p.kid ?? '?'}`).join(', ') || '_none_';
			const alliances = (u.alliances || []).map((a) => `${a.name || a.slug} [${a.abbr || a.slug}] K${a.kid}`).join(', ') || '_none_';
			lines.push(`${mention}\n ${players}\n ${alliances}`);
		}
		const userEmbed = new EmbedBuilder().setTitle(' Registered users').setColor(0x5865f2).setDescription(lines.length ? lines.join('\n\n').slice(0, 4000) : '_No users have registered yet._').setFooter({
			text: users.length > 20 ? `Showing 20 of ${users.length} users` : `${users.length} user(s)`,
		}).setTimestamp();
		return interaction.editReply({
			embeds: [overview, userEmbed]
		});
	},
};
