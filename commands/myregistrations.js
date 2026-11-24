const {
	SlashCommandBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
} = require('discord.js');
const {
	listUser,
	removePlayer,
	removeAlliance,
	MAX_PLAYERS,
	MAX_ALLIANCES,
} = require('../lib/registrations');
const {
	makeEmbed,
	resultEmbed
} = require('../lib/ui');
module.exports = {
	data: new SlashCommandBuilder().setName('myregistrations').setDescription('View or remove your registered players and alliances').addSubcommand((s) => s.setName('list').setDescription('Show your registrations (with remove buttons)')).addSubcommand((s) => s.setName('remove-player').setDescription('Remove a solo player by ID').addStringOption((o) => o.setName('uid').setDescription('Player ID').setRequired(true))).addSubcommand((s) => s.setName('remove-alliance').setDescription('Remove an alliance').addIntegerOption((o) => o.setName('server').setDescription('Kingdom ID').setRequired(true)).addStringOption((o) => o.setName('tag').setDescription('Alliance tag/slug').setRequired(true))),
	async execute(interaction) {
 const sub = interaction.options.getSubcommand();
 const userId = interaction.user.id;
 if (sub === 'list') {
 const u = listUser(userId);
 const players = (u.players || []).map((p) => `- **${p.name}** \`${p.fid}\` K${p.kid}`).join('\n') || '_None_';
 const alliances = (u.alliances || []).map((a) => `- **${a.name}** [${a.abbr}] K${a.kid}`).join('\n') || '_None_';
 const embed = makeEmbed({
 title: ' Your registrations',
 color: 'info',
 description: 'AUTOREDEEM runs for these accounts and all alliance members (refreshed each cycle).',
 fields: [{
 name: ` Players | ${(u.players || []).length}/${MAX_PLAYERS}`,
 value: players,
 }, {
 name: ` Alliances | ${(u.alliances || []).length}/${MAX_ALLIANCES}`,
 value: alliances,
 }, ],
 footer: 'Use the buttons below to remove an entry',
 });
 const rows = [];
 const buttons = [];
 for (const p of (u.players || []).slice(0, 10)) {
 buttons.push(new ButtonBuilder().setCustomId(`rmreg:player:${p.fid}:${userId}`).setLabel(`Remove ${(p.name || p.fid).slice(0, 60)}`.slice(0, 80)).setStyle(ButtonStyle.Danger));
 }
 for (const a of (u.alliances || []).slice(0, 5)) {
 buttons.push(new ButtonBuilder().setCustomId(`rmreg:ally:${a.kid}:${a.slug}:${userId}`).setLabel(`Remove ${a.abbr || a.slug} K${a.kid}`.slice(0, 80)).setStyle(ButtonStyle.Danger));
 }
 // Discord max 5 buttons per row, 5 rows
 for (let i = 0; i < buttons.length && rows.length < 5; i += 5) {
 rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
 }
 return interaction.reply({
 embeds: [embed],
 components: rows,
 ephemeral: true,
 });
 }
 if (sub === 'remove-player') {
 const uid = interaction.options.getString('uid').trim();
 const ok = removePlayer(userId, uid);
 return interaction.reply({
 embeds: [resultEmbed(ok ? 'Player removed' : 'Not found', `ID: \`${uid}\``, ok)],
 ephemeral: true,
 });
 }
 if (sub === 'remove-alliance') {
 const server = interaction.options.getInteger('server');
 const tag = interaction.options.getString('tag').trim();
 const ok = removeAlliance(userId, server, tag);
 return interaction.reply({
 embeds: [
 resultEmbed(ok ? 'Alliance removed' : 'Not found', `**${tag}** | K${server}`, ok),
 ],
 ephemeral: true,
 });
 }
	},
};
