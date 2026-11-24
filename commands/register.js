const {
	SlashCommandBuilder,
	EmbedBuilder,
	ActionRowBuilder,
	StringSelectMenuBuilder,
	ButtonBuilder,
	ButtonStyle,
	ComponentType,
} = require('discord.js');
const {
	searchPlayers,
	searchAlliances
} = require('../lib/search');
const {
	addPlayer,
	addAlliance,
	listUser,
	MAX_PLAYERS,
	MAX_ALLIANCES,
} = require('../lib/registrations');
const {
	errorEmbed
} = require('../lib/ui');

function slotsFooter(userId) {
	const u = listUser(userId);
	const pLeft = Math.max(0, MAX_PLAYERS - (u.players || []).length);
	const aLeft = Math.max(0, MAX_ALLIANCES - (u.alliances || []).length);
	return `Slots left: ${pLeft}/${MAX_PLAYERS} players Â· ${aLeft}/${MAX_ALLIANCES} alliances Â· AUTOREDEEM ON`;
}

function playerEmbed(p, userId) {
	return new EmbedBuilder().setTitle('âœ… Player registered').setColor(0x57f287).setDescription('This account will receive gift codes automatically.').addFields({
		name: 'Name',
		value: p.name || 'â€”',
		inline: true
	}, {
		name: 'Player ID',
		value: `\`${p.fid}\``,
		inline: true
	}, {
		name: 'Kingdom',
		value: p.kid != null ? String(p.kid) : 'â€”',
		inline: true
	}).setFooter({
		text: slotsFooter(userId)
	}).setTimestamp();
}

function allianceEmbed(a, userId) {
	return new EmbedBuilder().setTitle('âœ… Alliance registered').setColor(0x57f287).setDescription('Gift codes will be redeemed for **all members**.\nNew members are picked up every auto cycle.').addFields({
		name: 'Alliance',
		value: `**${a.name}** [${a.abbr || a.slug}]`,
		inline: true
	}, {
		name: 'Kingdom',
		value: String(a.kid),
		inline: true
	}, {
		name: 'Members',
		value: a.members != null ? String(a.members) : 'â€”',
		inline: true
	}).setFooter({
		text: slotsFooter(userId)
	}).setTimestamp();
}
async function confirmPlayer(interaction, pick, userId) {
	const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('reg_confirm_yes').setLabel('Confirm').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('reg_confirm_no').setLabel('Cancel').setStyle(ButtonStyle.Secondary));
	const preview = new EmbedBuilder().setTitle('Confirm player registration').setColor(0xfee75c).setDescription(`Register **${pick.name}** \`${pick.fid}\` (K${pick.kid ?? '?'})?`).setFooter({
		text: 'You have 60 seconds'
	});
	const msg = await interaction.editReply({
		embeds: [preview],
		components: [row],
		content: null
	});
	try {
		const btn = await msg.awaitMessageComponent({
			componentType: ComponentType.Button,
			time: 60_000,
			filter: (i) => i.user.id === userId,
		});
		if (btn.customId === 'reg_confirm_no') {
			return btn.update({
				content: 'Cancelled.',
				embeds: [],
				components: []
			});
		}
		const r = addPlayer(userId, pick);
		if (!r.ok) {
			return btn.update({
				embeds: [errorEmbed('Could not register', r.error)],
				components: []
			});
		}
		return btn.update({
			embeds: [playerEmbed(pick, userId)],
			components: []
		});
	} catch {
		return interaction.editReply({
			content: 'â° Timed out.',
			embeds: [],
			components: []
		});
	}
}
async function confirmAlliance(interaction, pick, userId) {
	const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('reg_confirm_yes').setLabel('Confirm').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('reg_confirm_no').setLabel('Cancel').setStyle(ButtonStyle.Secondary));
	const preview = new EmbedBuilder().setTitle('Confirm alliance registration').setColor(0xfee75c).setDescription(`Register **${pick.name}** [${pick.abbr}] Â· K${pick.kid}` + (pick.members != null ? ` Â· ~${pick.members} members` : '') + '?').setFooter({
		text: 'Codes redeem for all members Â· 60s to confirm'
	});
	const msg = await interaction.editReply({
		embeds: [preview],
		components: [row],
		content: null
	});
	try {
		const btn = await msg.awaitMessageComponent({
			componentType: ComponentType.Button,
			time: 60_000,
			filter: (i) => i.user.id === userId,
		});
		if (btn.customId === 'reg_confirm_no') {
			return btn.update({
				content: 'Cancelled.',
				embeds: [],
				components: []
			});
		}
		const r = addAlliance(userId, pick);
		if (!r.ok) {
			return btn.update({
				embeds: [errorEmbed('Could not register', r.error)],
				components: []
			});
		}
		return btn.update({
			embeds: [allianceEmbed(pick, userId)],
			components: []
		});
	} catch {
		return interaction.editReply({
			content: 'â° Timed out.',
			embeds: [],
			components: []
		});
	}
}
async function handlePlayer(interaction) {
	const userId = interaction.user.id;
	const uid = interaction.options.getString('uid', true).trim();
	const server = interaction.options.getInteger('server');
	await interaction.deferReply({
		ephemeral: true
	});
	let results;
	try {
		results = await searchPlayers(uid);
	} catch (e) {
		return interaction.editReply({
			embeds: [errorEmbed('Search failed', e.message)]
		});
	}
	if (server != null) {
		results = results.filter((p) => p.kid == null || Number(p.kid) === Number(server));
	}
	if (!results.length) {
		return interaction.editReply({
			embeds: [
				errorEmbed('Not found', server != null ? `No player \`${uid}\` found on kingdom **${server}**.` : `No player found for \`${uid}\`.`),
			],
		});
	}
	if (results.length === 1) return confirmPlayer(interaction, results[0], userId);
	const menu = new StringSelectMenuBuilder().setCustomId(`reg_player:${userId}`).setPlaceholder('Select your player account').addOptions(results.slice(0, 25).map((p, i) => ({
		label: String(p.name || p.fid).slice(0, 100),
		description: `ID ${p.fid} Â· K${p.kid ?? '?'} Â· TC${p.tc ?? '?'}${p.alliance ? ` Â· ${p.alliance}` : ''}`.slice(0, 100),
		value: String(i),
	})));
	const msg = await interaction.editReply({
		content: `Found **${results.length}** matches. Select **your** account:`,
		components: [new ActionRowBuilder().addComponents(menu)],
	});
	try {
		const sel = await msg.awaitMessageComponent({
			componentType: ComponentType.StringSelect,
			time: 60_000,
			filter: (i) => i.user.id === userId,
		});
		const pick = results[Number(sel.values[0])];
		await sel.update({
			content: 'Confirm belowâ€¦',
			components: []
		});
		return confirmPlayer(interaction, pick, userId);
	} catch {
		return interaction.editReply({
			content: 'â° Timed out.',
			components: []
		});
	}
}
async function handleAlliance(interaction) {
	const userId = interaction.user.id;
	const server = interaction.options.getInteger('server', true);
	// Option is registered as "name"
	const allianceQ = (interaction.options.getString('name') || '').trim();
	if (!allianceQ) {
		return interaction.reply({
			embeds: [errorEmbed('Alliance name required', 'Use `/register alliance` and fill **server** and **name**.')],
			ephemeral: true,
		});
	}
	await interaction.deferReply({
		ephemeral: true
	});
	let results;
	try {
		results = await searchAlliances(allianceQ, server);
	} catch (e) {
		return interaction.editReply({
			embeds: [errorEmbed('Search failed', e.message)]
		});
	}
	if (!results.length) {
		return interaction.editReply({
			embeds: [errorEmbed('Not found', `No alliance **${allianceQ}** on kingdom **${server}**.`)],
		});
	}
	if (results.length === 1) return confirmAlliance(interaction, results[0], userId);
	const menu = new StringSelectMenuBuilder().setCustomId(`reg_ally:${userId}`).setPlaceholder('Select the correct alliance').addOptions(results.slice(0, 25).map((a, i) => ({
		label: `${a.name} [${a.abbr}]`.slice(0, 100),
		description: `K${a.kid} Â· ${a.members ?? '?'} members Â· ${a.leader || 'â€”'}`.slice(0, 100),
		value: String(i),
	})));
	const msg = await interaction.editReply({
		content: `Found **${results.length}** alliances on K${server}. Select one:`,
		components: [new ActionRowBuilder().addComponents(menu)],
	});
	try {
		const sel = await msg.awaitMessageComponent({
			componentType: ComponentType.StringSelect,
			time: 60_000,
			filter: (i) => i.user.id === userId,
		});
		const pick = results[Number(sel.values[0])];
		await sel.update({
			content: 'Confirm belowâ€¦',
			components: []
		});
		return confirmAlliance(interaction, pick, userId);
	} catch {
		return interaction.editReply({
			content: 'â° Timed out.',
			components: []
		});
	}
}
module.exports = {
	data: new SlashCommandBuilder().setName('register').setDescription('Register a player or alliance for auto gift-code redeem').addSubcommand((s) => s.setName('player').setDescription('Register a solo player account').addStringOption((o) => o.setName('uid').setDescription('Your Player ID').setRequired(true)).addIntegerOption((o) => o.setName('server').setDescription('Kingdom / server ID (optional)').setRequired(false))).addSubcommand((s) => s.setName('alliance').setDescription('Register a whole alliance (all members)').addIntegerOption((o) => o.setName('server').setDescription('Kingdom / server ID').setRequired(true)).addStringOption((o) => o.setName('name').setDescription('Alliance tag or name').setRequired(true))),
	async execute(interaction) {
		const sub = interaction.options.getSubcommand(false);
		if (sub === 'player') return handlePlayer(interaction);
		if (sub === 'alliance') return handleAlliance(interaction);
		// Old command shape still cached by Discord â€” clear guidance
		return interaction.reply({
			embeds: [
				errorEmbed('Update required', 'Please use the new commands:\n' + 'â€¢ `/register player` â†’ options: **uid**, **server** (optional)\n' + 'â€¢ `/register alliance` â†’ options: **server**, **name**\n\n' + 'If you still see the old form, wait a minute or ask the owner to re-register slash commands.'),
			],
			ephemeral: true,
		});
	},
};
