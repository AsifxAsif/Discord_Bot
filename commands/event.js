const {
	SlashCommandBuilder,
	PermissionFlagsBits,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	ActionRowBuilder,
	ChannelSelectMenuBuilder,
	ChannelType,
	ButtonBuilder,
	ButtonStyle,
	StringSelectMenuBuilder,
	EmbedBuilder,
} = require('discord.js');
const {
	isAdmin
} = require('../lib/admin');
const {
	makeEmbed,
	errorEmbed,
	resultEmbed
} = require('../lib/ui');
const {
	createBlog,
	listBlogs,
	getBlog,
	deleteBlog,
	setBlogEnabled
} = require('../lib/blogs');
const {
	blogEmbed
} = require('../lib/eventembed');
const {
	fieldGetter
} = require('../lib/discordutil');
const {
	parseTime,
	parseDetails,
	formatSchedule,
	getNextOccurrence
} = require('../lib/schedule');

function canManage(interaction) {
	if (isAdmin(interaction)) return true;
	return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) || false;
}
const drafts = new Map();

function input(id, label, {
	style = TextInputStyle.Short,
	required = true,
	placeholder,
	max
} = {}) {
	const t = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required);
	if (placeholder) t.setPlaceholder(placeholder);
	if (max) t.setMaxLength(max);
	return new ActionRowBuilder().addComponents(t);
}

function panel(userId, d) {
	const info = makeEmbed({
		title: 'ðŸ“ Announcement draft',
		description: 'Pick a channel, then **post now** or **schedule** it.',
		color: 'info',
		fields: [{
			name: 'Channel',
			value: d.channelId ? `<#${d.channelId}>` : '_not selected_',
			inline: true
		}, {
			name: 'Mention',
			value: d.mention === '@everyone' ? '@everyone' : 'none',
			inline: true
		}, ],
	});
	const channelMenu = new ChannelSelectMenuBuilder().setCustomId(`event_channel:${userId}`).setPlaceholder(d.channelId ? 'Change channelâ€¦' : 'Post to which channel?').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
	const buttons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`event_mention:${userId}`).setLabel(d.mention === '@everyone' ? '@everyone: ON' : '@everyone: OFF').setStyle(d.mention === '@everyone' ? ButtonStyle.Danger : ButtonStyle.Secondary), new ButtonBuilder().setCustomId(`event_now:${userId}`).setLabel('Post now').setStyle(ButtonStyle.Success).setDisabled(!d.channelId), new ButtonBuilder().setCustomId(`event_sched:${userId}`).setLabel('Scheduleâ€¦').setStyle(ButtonStyle.Primary).setDisabled(!d.channelId), new ButtonBuilder().setCustomId(`event_cancel:${userId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary));
	return {
		embeds: [info, blogEmbed(d)],
		components: [new ActionRowBuilder().addComponents(channelMenu), buttons]
	};
}
module.exports = {
	data: new SlashCommandBuilder().setName('event').setDescription('Post or schedule event announcements (Admin only)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addSubcommand((s) => s.setName('post').setDescription('Write an announcement (post now or schedule)')).addSubcommand((s) => s.setName('quick').setDescription('Quick LIVE announcement').addStringOption((o) => o.setName('event').setDescription('Event').setRequired(true).addChoices(...require('../lib/reminders').PRESET_EVENTS.filter((e) => e !== 'Custom').slice(0, 24).map((e) => ({
		name: e,
		value: e
	}))))).addSubcommand((s) => s.setName('list').setDescription('List scheduled announcements')).addSubcommand((s) => s.setName('delete').setDescription('Delete a scheduled announcement').addStringOption((o) => o.setName('id').setDescription('Announcement ID').setRequired(true))).addSubcommand((s) => s.setName('toggle').setDescription('Enable or disable a scheduled announcement').addStringOption((o) => o.setName('id').setDescription('Announcement ID').setRequired(true)).addBooleanOption((o) => o.setName('enabled').setDescription('Enable?').setRequired(true))),
	async execute(interaction) {
		if (!canManage(interaction)) {
			return interaction.reply({
				embeds: [errorEmbed('Permission denied', 'Admin only.')],
				ephemeral: true
			});
		}
		const sub = interaction.options.getSubcommand();
		const userId = interaction.user.id;
		const guildId = interaction.guildId;
		if (sub === 'post') {
			const modal = new ModalBuilder().setCustomId(`event_modal:${userId}`).setTitle('Event Announcement');
			modal.addComponents(input('event', 'Event name', {
				placeholder: 'Bear Trap / Arena / KVKâ€¦',
				max: 60
			}), input('title', 'Title', {
				placeholder: 'Weekend Bear Trap schedule',
				max: 200
			}), input('content', 'Content', {
				style: TextInputStyle.Paragraph,
				placeholder: 'Write the announcementâ€¦',
				max: 2000
			}), input('image', 'Image URL (optional)', {
				required: false,
				placeholder: 'https://â€¦',
				max: 400
			}));
			return interaction.showModal(modal);
		}
		if (sub === 'quick') {
			const eventName = interaction.options.getString('event');
			const d = {
				event: eventName,
				title: `${eventName} is LIVE!`,
				content: `**${eventName}** has started!\n\nGet ready, gather your troops, and fight for glory.\nGood luck, Governors! ðŸ†`,
				image: '',
				color: 0xed4245,
				mention: '@everyone',
				channelId: null
			};
			drafts.set(userId, d);
			return interaction.reply({
				...panel(userId, d),
				ephemeral: true
			});
		}
		if (sub === 'list') {
			const list = listBlogs(guildId);
			if (!list.length) {
				return interaction.reply({
					embeds: [makeEmbed({
						title: 'ðŸ“‹ Scheduled announcements',
						description: '_None yet. Use `/event post` â†’ Schedule._',
						color: 'info'
					})],
					ephemeral: true
				});
			}
			const lines = list.map((b) => {
				const next = b.enabled ? getNextOccurrence(b) : null;
				const nextStr = next ? `<t:${Math.floor(next.getTime() / 1000)}:R>` : 'â€”';
				return `${b.enabled ? 'âœ…' : 'âŒ'} **${b.title}** \`${b.id}\`\n${b.event} Â· ${formatSchedule(b)} â†’ <#${b.channelId}> Â· Next ${nextStr}`;
			});
			return interaction.reply({
				embeds: [makeEmbed({
					title: `ðŸ“‹ Scheduled announcements (${list.length})`,
					description: lines.join('\n\n').slice(0, 4000),
					color: 'info'
				})],
				ephemeral: true
			});
		}
		if (sub === 'delete') {
			const id = interaction.options.getString('id').trim();
			const b = getBlog(id);
			const ok = b && b.guildId === guildId ? deleteBlog(id) : false;
			return interaction.reply({
				embeds: [resultEmbed(ok ? 'Deleted' : 'Not found', `\`${id}\``, !!ok)],
				ephemeral: true
			});
		}
		if (sub === 'toggle') {
			const id = interaction.options.getString('id').trim();
			const enabled = interaction.options.getBoolean('enabled');
			const b = getBlog(id);
			const ok = b && b.guildId === guildId ? setBlogEnabled(id, enabled) : false;
			return interaction.reply({
				embeds: [resultEmbed(ok ? (enabled ? 'Enabled' : 'Disabled') : 'Not found', `\`${id}\``, !!ok)],
				ephemeral: true
			});
		}
	},
};
async function handleEventUI(interaction) {
	const userId = interaction.user.id;
	const id = interaction.customId || '';
	if (!id.startsWith('event:')) return false;
	if (!canManage(interaction)) {
		await interaction.reply({
			content: 'Admin only.',
			ephemeral: true
		}).catch(() => {});
		return true;
	}
	const owner = id.split(':')[1];
	if (owner && owner !== userId) {
		await interaction.reply({
			content: 'This draft is not yours.',
			ephemeral: true
		}).catch(() => {});
		return true;
	}
	if (id.startsWith('event_modal:')) {
		const get = fieldGetter(interaction);
		const d = {
			event: get('event').trim(),
			title: get('title').trim(),
			content: get('content').trim(),
			image: get('image').trim(),
			color: 0x5865f2,
			mention: '@everyone',
			channelId: null
		};
		drafts.set(userId, d);
		await interaction.reply({
			...panel(userId, d),
			ephemeral: true
		});
		return true;
	}
	const d = drafts.get(userId);
	if (!d) {
		if (interaction.isRepliable()) {
			await interaction.reply({
				content: 'Draft expired. Run the command again.',
				ephemeral: true
			}).catch(() => {});
		}
		return true;
	}
	if (id.startsWith('event_channel:')) {
		d.channelId = interaction.values[0];
		await interaction.update(panel(userId, d));
		return true;
	}
	if (id.startsWith('event_mention:')) {
		d.mention = d.mention === '@everyone' ? '' : '@everyone';
		await interaction.update(panel(userId, d));
		return true;
	}
	if (id.startsWith('event_cancel:')) {
		drafts.delete(userId);
		await interaction.update({
			embeds: [makeEmbed({
				title: 'Cancelled',
				description: 'Draft discarded.',
				color: 'neutral'
			})],
			components: []
		});
		return true;
	}
	if (id.startsWith('event_now:')) {
		try {
			const ch = await interaction.client.channels.fetch(d.channelId);
			if (!ch?.isTextBased()) throw new Error('That channel is not a text channel.');
			await ch.send({
				content: d.mention || undefined,
				embeds: [blogEmbed(d)]
			});
			drafts.delete(userId);
			await interaction.update({
				embeds: [resultEmbed('Posted', `Sent to <#${d.channelId}>`, true)],
				components: []
			});
		} catch (e) {
			await interaction.reply({
				embeds: [errorEmbed('Failed', e.message)],
				ephemeral: true
			}).catch(() => {});
		}
		return true;
	}
	if (id.startsWith('event_sched:') || id.startsWith('event_back:')) {
		if (id.startsWith('event_back:')) {
			await interaction.update(panel(userId, d));
			return true;
		}
		const typeMenu = new StringSelectMenuBuilder().setCustomId(`event_stype:${userId}`).setPlaceholder('Schedule type').addOptions({
			label: 'One-time',
			value: 'once',
			description: 'Single date + time'
		}, {
			label: 'Daily',
			value: 'daily',
			description: 'Every day at a fixed UTC time'
		}, {
			label: 'Every X days',
			value: 'every_x_days',
			description: 'Repeats every N days'
		}, {
			label: 'Weekly',
			value: 'weekly',
			description: 'Specific weekdays'
		}, {
			label: 'Monthly',
			value: 'monthly',
			description: 'Day of month'
		});
		await interaction.update({
			embeds: [makeEmbed({
				title: 'ðŸ“… Schedule announcement',
				description: `**${d.title}** â†’ <#${d.channelId}>\n\nChoose when it should be posted (UTC).`,
				color: 'info'
			})],
			components: [new ActionRowBuilder().addComponents(typeMenu), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`event_back:${userId}`).setLabel('â† Back').setStyle(ButtonStyle.Secondary))],
		});
		return true;
	}
	if (id.startsWith('event_stype:')) {
		d.stype = interaction.values[0];
		const modal = new ModalBuilder().setCustomId(`event_modal_time:${userId}`).setTitle('Post time (UTC)');
		const rows = [input('time', 'Post time UTC (HH:MM)', {
			placeholder: '20:00',
			max: 5
		})];
		if (d.stype === 'once') rows.push(input('date', 'Date YYYY-MM-DD', {
			placeholder: '2026-11-20',
			max: 10
		}));
		if (d.stype === 'every_x_days') rows.push(input('interval', 'Every how many days?', {
			placeholder: '2',
			max: 3
		}));
		if (d.stype === 'weekly') rows.push(input('weekdays', 'Weekdays 0=Sunâ€¦6=Sat (e.g. 1,3,5)', {
			placeholder: '1,3,5',
			max: 20
		}));
		if (d.stype === 'monthly') rows.push(input('monthday', 'Day of month (1-31)', {
			placeholder: '15',
			max: 2
		}));
		modal.addComponents(...rows);
		await interaction.showModal(modal);
		return true;
	}
	if (id.startsWith('event_modal_time:')) {
		const get = fieldGetter(interaction);
		const t = parseTime(get('time'));
		const details = t ? parseDetails(d.stype, get) : null;
		const err = !t ? 'Invalid time. Use `HH:MM` in UTC, e.g. `20:00`.' : details.error;
		const schedule = !err ? {
			type: d.stype,
			hour: t.hour,
			minute: t.minute,
			date: null,
			intervalDays: null,
			weekdays: null,
			monthDay: null,
			...details.data
		} : null;
		if (!err && d.stype === 'once' && !getNextOccurrence(schedule)) {
			await interaction.reply({
				content: 'âš ï¸ That date/time is already in the past.',
				ephemeral: true
			});
			return true;
		}
		if (err) {
			await interaction.reply({
				content: `âš ï¸ ${err}`,
				ephemeral: true
			});
			return true;
		}
		const blog = createBlog({
			guildId: interaction.guildId,
			event: d.event,
			title: d.title,
			content: d.content,
			image: d.image,
			color: d.color,
			mention: d.mention,
			channelId: d.channelId,
			createdBy: userId,
			...schedule
		});
		drafts.delete(userId);
		const next = getNextOccurrence(blog);
		await interaction.update({
			embeds: [resultEmbed('Announcement scheduled', `**${blog.title}**\n${formatSchedule(blog)} â†’ <#${blog.channelId}>\nNext: ${next ? `<t:${Math.floor(next.getTime() / 1000)}:F>` : 'â€”'}\nID: \`${blog.id}\``, true)],
			components: [],
		});
		return true;
	}
	return false;
}
module.exports.handleEventUI = handleEventUI;
