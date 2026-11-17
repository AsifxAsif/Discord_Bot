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
	listUser
} = require('../lib/registrations');
const {
	fetchAlliance
} = require('../lib/mightpulse');
const {
	errorEmbed,
	makeEmbed
} = require('../lib/ui');
const MEMBERS_PER_EMBED = 25;
const MAX_MEMBERS = 100;

function memberLines(members, startIndex) {
	if (!members.length) return 'No members were returned for this alliance.';
	return members.map((m, i) => {
		const n = startIndex + i + 1;
		return `${n}. **${m.name || m.fid}** — \`${m.fid}\` · K${m.kid ?? '?'}${
        m.tc != null ? ` · TC${m.tc}` : ''
      }`;
	}).join('\n');
}

function statsEmbed(alliance, members) {
	const knownTc = members.filter((m) => m.tc != null);
	const averageTc = knownTc.length ? (knownTc.reduce((sum, m) => sum + Number(m.tc), 0) / knownTc.length).toFixed(1) : '—';
	return new EmbedBuilder().setTitle(`📊 ${alliance.name || alliance.slug} — summary`).setColor(0x57f287).addFields({
		name: 'Total members',
		value: String(members.length),
		inline: true
	}, {
		name: 'TC available',
		value: `${knownTc.length}/${members.length}`,
		inline: true
	}, {
		name: 'Average TC',
		value: averageTc,
		inline: true
	}, {
		name: 'Kingdom',
		value: `K${alliance.kid}`,
		inline: true
	}, {
		name: 'Alliance tag',
		value: alliance.abbr || alliance.slug || '—',
		inline: true
	}).setFooter({
		text: 'Summary shown after the full member list'
	}).setTimestamp();
}
/**
 * Member list embeds only (no stats mixed in).
 * Stats embed is appended only after the last member chunk.
 */
function buildRosterMessage(alliance, members, page, pageSize) {
	const totalPages = Math.max(1, Math.ceil(members.length / pageSize));
	const pageIndex = Math.max(0, Math.min(page, totalPages - 1));
	const start = pageIndex * pageSize;
	const pageMembers = members.slice(start, start + pageSize);
	const embeds = [];
	for (let offset = 0; offset < pageMembers.length; offset += MEMBERS_PER_EMBED) {
		const chunk = pageMembers.slice(offset, offset + MEMBERS_PER_EMBED);
		const abs = start + offset;
		const isFirstOverall = abs === 0;
		embeds.push(new EmbedBuilder().setTitle(isFirstOverall ? `👥 ${alliance.name || alliance.slug} [${alliance.abbr || alliance.slug}]` : `👥 ${alliance.name || alliance.slug} (continued)`).setDescription(memberLines(chunk, abs)).setColor(0x5865f2).setFooter({
			text: `Members ${abs + 1}–${abs + chunk.length} of ${members.length} · Page ${
            pageIndex + 1
          }/${totalPages}`,
		}));
	}
	// Stats ONLY after all members on the last page
	const isLastPage = pageIndex >= totalPages - 1;
	if (isLastPage) {
		embeds.push(statsEmbed(alliance, members));
	}
	if (!embeds.length) {
		embeds.push(new EmbedBuilder().setTitle(`👥 ${alliance.name || alliance.slug}`).setDescription('No members found.').setColor(0x5865f2));
	}
	return {
		embeds,
		page: pageIndex,
		totalPages
	};
}

function pageButtons(userId, page, totalPages) {
	if (totalPages <= 1) return [];
	return [
		new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`show_prev:${userId}`).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(page === 0), new ButtonBuilder().setCustomId(`show_next:${userId}`).setLabel('Next').setStyle(ButtonStyle.Primary).setDisabled(page >= totalPages - 1)),
	];
}
async function displayRoster(interaction, userId, alliance, members) {
	const safe = (members || []).slice(0, MAX_MEMBERS);
	// One page of up to 50 list lines → fewer split messages; stats only on last page
	const pageSize = 50;
	let page = 0;
	let view = buildRosterMessage(alliance, safe, page, pageSize);
	await interaction.editReply({
		content: null,
		embeds: view.embeds,
		components: pageButtons(userId, page, view.totalPages),
	});
	if (view.totalPages <= 1) return;
	const message = await interaction.fetchReply();
	while (true) {
		try {
			const click = await message.awaitMessageComponent({
				componentType: ComponentType.Button,
				time: 120_000,
				filter: (c) => c.user.id === userId && [`show_prev:${userId}`, `show_next:${userId}`].includes(c.customId),
			});
			if (click.customId === `show_prev:${userId}`) page = Math.max(0, page - 1);
			if (click.customId === `show_next:${userId}`) page = Math.min(view.totalPages - 1, page + 1);
			view = buildRosterMessage(alliance, safe, page, pageSize);
			await click.update({
				content: null,
				embeds: view.embeds,
				components: pageButtons(userId, page, view.totalPages),
			});
		} catch {
			await interaction.editReply({
				components: []
			}).catch(() => {});
			return;
		}
	}
}
async function loadAndDisplayRoster(interaction, userId, selected) {
	try {
		const result = await fetchAlliance(selected.kid, selected.slug);
		return displayRoster(interaction, userId, result.alliance || selected, result.members || []);
	} catch (error) {
		return interaction.editReply({
			content: null,
			embeds: [
				errorEmbed('Could not load alliance roster', `Alliance: **${selected.name || selected.slug}** · K${selected.kid}\n${error.message}`),
			],
			components: [],
		});
	}
}
module.exports = {
	data: new SlashCommandBuilder().setName('show').setDescription('Show members of one of your registered alliances'),
	async execute(interaction) {
		const userId = interaction.user.id;
		const u = listUser(userId);
		const alliances = u.alliances || [];
		if (!alliances.length) {
			return interaction.reply({
				embeds: [
					errorEmbed('No alliances registered', 'Use `/register alliance server:… name:…` first.'),
				],
				ephemeral: true,
			});
		}
		await interaction.deferReply({
			ephemeral: true
		});
		if (alliances.length === 1) {
			return loadAndDisplayRoster(interaction, userId, alliances[0]);
		}
		const menu = new StringSelectMenuBuilder().setCustomId(`show_pick:${userId}`).setPlaceholder('Select an alliance').addOptions(alliances.slice(0, 25).map((a, i) => ({
			label: `${a.name || a.slug} [${a.abbr || a.slug}]`.slice(0, 100),
			description: `K${a.kid}`.slice(0, 100),
			value: String(i),
		})));
		const msg = await interaction.editReply({
			embeds: [
				makeEmbed({
					title: 'Select alliance',
					description: 'Choose which registered alliance to show.',
					color: 'info',
				}),
			],
			components: [new ActionRowBuilder().addComponents(menu)],
		});
		try {
			const sel = await msg.awaitMessageComponent({
				componentType: ComponentType.StringSelect,
				time: 60_000,
				filter: (i) => i.user.id === userId,
			});
			const selected = alliances[Number(sel.values[0])];
			await sel.update({
				content: 'Loading roster…',
				embeds: [],
				components: []
			});
			return loadAndDisplayRoster(interaction, userId, selected);
		} catch {
			return interaction.editReply({
				content: 'Timed out.',
				embeds: [],
				components: []
			});
		}
	},
};
