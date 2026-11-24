const {
	SlashCommandBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const {
	fetchAlliance
} = require('../lib/mightpulse');
const {
	searchPlayers
} = require('../lib/search');
const {
	listUser,
	MAX_PLAYERS,
	MAX_ALLIANCES
} = require('../lib/registrations');
const {
	makeEmbed,
	errorEmbed
} = require('../lib/ui');

function saveUserRegistrations(userId, userData) {
	const dataDir = process.env.DATADIR || path.join(__dirname, '..', 'data');
	const regPath = path.join(dataDir, 'registrations.json');
	if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, {
 recursive: true
	});
	let all = {
 users: {}
	};
	if (fs.existsSync(regPath)) {
 all = JSON.parse(fs.readFileSync(regPath, 'utf8'));
	}
	all.users = all.users || {};
	all.users[String(userId)] = userData;
	fs.writeFileSync(regPath, JSON.stringify(all, null, 2));
}
module.exports = {
	data: new SlashCommandBuilder().setName('roster').setDescription('Refresh and view your registered players and alliances').addSubcommand((s) => s.setName('sync').setDescription('Refresh live data for your registered players and alliances')).addSubcommand((s) => s.setName('list').setDescription('Show your registered players and alliances')).addSubcommand((s) => s.setName('count').setDescription('How many players / alliances you registered')),
	async execute(interaction) {
 const sub = interaction.options.getSubcommand();
 const userId = interaction.user.id;
 const u = listUser(userId);
 if (sub === 'count') {
 return interaction.reply({
 embeds: [
 makeEmbed({
 title: ' Your roster count',
 color: 'info',
 fields: [{
 name: 'Solo players',
 value: `${(u.players || []).length} / ${MAX_PLAYERS}`,
 inline: true,
 }, {
 name: 'Alliances',
 value: `${(u.alliances || []).length} / ${MAX_ALLIANCES}`,
 inline: true,
 }, ],
 }),
 ],
 ephemeral: true,
 });
 }
 if (sub === 'list') {
 const players = (u.players || []).map((p) => `- **${p.name || 'Player'}** \`${p.fid}\` | K${p.kid ?? '?'}`).join('\n') || '_None - `/register player`_';
 const alliances = (u.alliances || []).map((a) => `- **${a.name}** [${a.abbr || a.slug}] | K${a.kid}`).join('\n') || '_None - `/register alliance`_';
 return interaction.reply({
 embeds: [
 makeEmbed({
 title: ' Your registrations',
 color: 'info',
 fields: [{
 name: `Players (${(u.players || []).length}/${MAX_PLAYERS})`,
 value: players,
 }, {
 name: `Alliances (${(u.alliances || []).length}/${MAX_ALLIANCES})`,
 value: alliances,
 }, ],
 footer: 'Use /roster sync to refresh live alliance members',
 }),
 ],
 ephemeral: true,
 });
 }
 // sync
 if (!(u.players || []).length && !(u.alliances || []).length) {
 return interaction.reply({
 embeds: [
 errorEmbed('Nothing registered', 'Register first:\n`/register player uid:...`\n`/register alliance server:... name:...`'),
 ],
 ephemeral: true,
 });
 }
 await interaction.deferReply({
 ephemeral: true
 });
 const lines = [];
 let totalAllianceMembers = 0;
 const players = [...(u.players || [])];
 const alliances = [...(u.alliances || [])];
 for (let i = 0; i < players.length; i++) {
 const p = {
 ...players[i]
 };
 try {
 const found = await searchPlayers(String(p.fid));
 const match = found.find((x) => String(x.fid) === String(p.fid)) || found[0];
 if (match) {
 p.name = match.name || p.name;
 if (match.kid != null) p.kid = match.kid;
 lines.push(`[OK] Player **${p.name}** \`${p.fid}\` | K${p.kid ?? '?'}`);
 } else {
 lines.push(`[!] Player \`${p.fid}\` - kept as registered`);
 }
 } catch (e) {
 lines.push(`[!] Player \`${p.fid}\` - ${e.message}`);
 }
 players[i] = p;
 }
 for (let i = 0; i < alliances.length; i++) {
 const a = {
 ...alliances[i]
 };
 try {
 const {
 alliance,
 members
 } = await fetchAlliance(a.kid, a.slug);
 a.name = alliance.name || a.name;
 a.abbr = alliance.abbr || a.abbr;
 totalAllianceMembers += members.length;
 lines.push(`[OK] Alliance **${a.name}** [${a.abbr || a.slug}] | K${a.kid} | **${members.length}** members`);
 } catch (e) {
 lines.push(`[!] Alliance **${a.name || a.slug}** K${a.kid} - ${e.message}`);
 }
 alliances[i] = a;
 }
 saveUserRegistrations(userId, {
 ...u,
 players,
 alliances,
 lastSyncedAt: new Date().toISOString(),
 });
 return interaction.editReply({
 embeds: [
 makeEmbed({
 title: ' Roster synced',
 color: 'success',
 description: lines.join('\n').slice(0, 4000) || '_Done_',
 fields: [{
 name: 'Solo players',
 value: String(players.length),
 inline: true
 }, {
 name: 'Alliances',
 value: String(alliances.length),
 inline: true
 }, {
 name: 'Alliance members (live)',
 value: String(totalAllianceMembers),
 inline: true
 }, ],
 footer: 'AUTOREDEEM uses updated data on the next cycle',
 }),
 ],
 });
	},
};
