/**
 * Single /event command Event Desk (admin only)
 */
const {
	SlashCommandBuilder,
	PermissionFlagsBits,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	StringSelectMenuBuilder,
	ChannelSelectMenuBuilder,
	ChannelType,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
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
	PRESET_EVENTS,
	createReminder,
	listReminders,
	deleteReminder,
	setEnabled,
	getNextOccurrence,
	getReminder,
} = require('../lib/reminders');
const {
	createBlog,
	listBlogs,
	deleteBlog,
	getBlog
} = require('../lib/blogs');
const {
	reminderMessage,
	blogEmbed
} = require('../lib/eventembed');
const {
	formatSchedule
} = require('../lib/schedule');

function canManage(interaction) {
	if (isAdmin(interaction)) return true;
	return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) || false;
}
const wizards = new Map();
const drafts = new Map();

function row(...components) {
	return new ActionRowBuilder().addComponents(...components);
}

function deskEmbed() {
	return makeEmbed({
		title: ' Event Desk',
		description: 'Manage **reminders** and **announcements** from one place.\n' + 'Admin-only private to you all times **UTC**.',
		color: 'info',
		fields: [{
			name: ' Reminders',
			value: 'Recurring or one-time pings before events.'
		}, {
			name: ' Announcements',
			value: 'Post now or schedule event blogs.'
		}, {
			name: ' Lists',
			value: 'View, test, enable/disable, delete.'
		}, ],
		footer: 'PXD_BOT Event Desk UTC',
	});
}

function deskComponents(userId) {
	return [
		row(new ButtonBuilder().setCustomId(`ed:rem:${userId}`).setLabel('New reminder').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`ed:blog:${userId}`).setLabel('New announcement').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`ed:quick:${userId}`).setLabel('Quick LIVE').setStyle(ButtonStyle.Danger)),
		row(new ButtonBuilder().setCustomId(`ed:list_rem:${userId}`).setLabel('List reminders').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(`ed:list_blog:${userId}`).setLabel('List announcements').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(`ed:close:${userId}`).setLabel('Close').setStyle(ButtonStyle.Secondary)),
	];
}

function input(id, label, {
	style = TextInputStyle.Short,
	required = true,
	placeholder,
	max,
	value
} = {}) {
	const t = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required);
	if (placeholder) t.setPlaceholder(placeholder);
	if (max) t.setMaxLength(max);
	if (value != null) t.setValue(String(value).slice(0, max || 4000));
	return new ActionRowBuilder().addComponents(t);
}

function own(customId, userId) {
	const parts = String(customId).split(':');
	return parts[parts.length - 1] === userId || parts.includes(userId);
}
module.exports = {
	data: new SlashCommandBuilder().setName('event').setDescription('Open the Event Desk (reminders + announcements)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
		if (!canManage(interaction)) {
			return interaction.reply({
				embeds: [errorEmbed('Permission denied', 'Admin only.')],
				ephemeral: true,
			});
		}
		return interaction.reply({
			embeds: [deskEmbed()],
			components: deskComponents(interaction.user.id),
			ephemeral: true,
		});
	},
};
async function handleEventUI(interaction) {
	const id = interaction.customId || '';
	if (!id.startsWith('ed:') && !id.startsWith('er_') && !id.startsWith('eb_')) return false;
	if (!canManage(interaction)) {
		await interaction.reply({
			content: 'Admin only.',
			ephemeral: true
		}).catch(() => {});
		return true;
	}
	const userId = interaction.user.id;
	const guildId = interaction.guildId;
	if (id.startsWith('ed:') && !own(id, userId)) {
		await interaction.reply({
			content: 'This panel is not yours.',
			ephemeral: true
		}).catch(() => {});
		return true;
	}
	if (id.startsWith('ed:close:')) {
		await interaction.update({
			embeds: [makeEmbed({
				title: 'Event Desk closed',
				description: 'Run `/event` to open again.',
				color: 'neutral'
			})],
			components: [],
		});
		return true;
	}
	if (id.startsWith('ed:home:')) {
		await interaction.update({
			embeds: [deskEmbed()],
			components: deskComponents(userId)
		});
		return true;
	}
	/* New reminder */
	if (id.startsWith('ed:rem:')) {
		wizards.set(userId, {
			guildId,
			step: 'event'
		});
		const menu = new StringSelectMenuBuilder().setCustomId(`er_event:${userId}`).setPlaceholder('Select event').addOptions(PRESET_EVENTS.slice(0, 25).map((e) => ({
			label: e.slice(0, 100),
			value: e
		})));
		await interaction.update({
			embeds: [makeEmbed({
				title: ' New reminder',
				description: '**Step 1/4** Choose the event',
				color: 'info'
			})],
			components: [
				row(menu),
				row(new ButtonBuilder().setCustomId(`ed:home:${userId}`).setLabel(' Desk').setStyle(ButtonStyle.Secondary)),
			],
		});
		return true;
	}
	if (id.startsWith('ed:list_rem:')) {
		const list = listReminders(guildId);
		if (!list.length) {
			await interaction.update({
				embeds: [makeEmbed({
					title: ' Reminders',
					description: '_None yet. Use **New reminder** on the Event Desk._',
					color: 'info'
				})],
				components: [row(new ButtonBuilder().setCustomId(`ed:home:${userId}`).setLabel(' Desk').setStyle(ButtonStyle.Secondary))],
			});
			return true;
		}
		const lines = list.map((r) => {
			const next = getNextOccurrence(r);
			const nextStr = next ? `<t:${Math.floor(next.getTime() / 1000)}:R>` : '';
			return `${r.enabled ? '' : ''} **${r.name}** \`${r.id}\`\n${formatSchedule(r)} Next ${nextStr}`;
		});
		const menu = new StringSelectMenuBuilder().setCustomId(`er_manage:${userId}`).setPlaceholder('Manage a reminder').addOptions(list.slice(0, 25).map((r) => ({
			label: `${r.enabled ? 'ON' : 'OFF'} ${r.name}`.slice(0, 100),
			description: r.id,
			value: r.id
		})));
		await interaction.update({
			embeds: [makeEmbed({
				title: ` Reminders (${list.length})`,
				description: lines.join('\n\n').slice(0, 4000),
				color: 'info'
			})],
			components: [
				row(menu),
				row(new ButtonBuilder().setCustomId(`ed:rem:${userId}`).setLabel('New reminder').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`ed:home:${userId}`).setLabel(' Desk').setStyle(ButtonStyle.Secondary)),
			],
		});
		return true;
	}
	if (id.startsWith('er_manage:')) {
		const rid = interaction.values[0];
		const r = getReminder(rid);
		if (!r || r.guildId !== guildId) {
			await interaction.reply({
				embeds: [errorEmbed('Not found', rid)],
				ephemeral: true
			});
			return true;
		}
		await interaction.update({
			embeds: [
				makeEmbed({
					title: ` ${r.name}`,
					description: `${formatSchedule(r)}\nID: \`${r.id}\`\nChannel: <#${r.channelId}>${r.note ? `\n\nNote:\n${r.note}` : ''}`,
					color: 'info',
				}),
			],
			components: [
				row(new ButtonBuilder().setCustomId(`er_test:${userId}:${rid}`).setLabel('Test').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`er_toggle:${userId}:${rid}`).setLabel(r.enabled ? 'Disable' : 'Enable').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(`er_del:${userId}:${rid}`).setLabel('Delete').setStyle(ButtonStyle.Danger)),
				row(new ButtonBuilder().setCustomId(`ed:list_rem:${userId}`).setLabel(' List').setStyle(ButtonStyle.Secondary)),
			],
		});
		return true;
	}
	if (id.startsWith('er_test:')) {
		const rid = id.split(':')[2];
		const r = getReminder(rid);
		if (!r) {
			await interaction.reply({
				content: 'Not found.',
				ephemeral: true
			});
			return true;
		}
		try {
			const ch = await interaction.client.channels.fetch(r.channelId);
			const next = getNextOccurrence(r) || new Date();
			if (ch?.isTextBased()) await ch.send({
				content: reminderMessage(r, next, {
					test: true
				})
			});
			await interaction.reply({
				embeds: [resultEmbed('Test sent', `<#${r.channelId}>`, true)],
				ephemeral: true
			});
		} catch (e) {
			await interaction.reply({
				embeds: [errorEmbed('Failed', e.message)],
				ephemeral: true
			});
		}
		return true;
	}
	if (id.startsWith('er_toggle:')) {
		const rid = id.split(':')[2];
		const r = getReminder(rid);
		if (!r) {
			await interaction.reply({
				content: 'Not found.',
				ephemeral: true
			});
			return true;
		}
		setEnabled(rid, !r.enabled);
		await interaction.reply({
			embeds: [resultEmbed(!r.enabled ? 'Enabled' : 'Disabled', `\`${rid}\``, true)],
			ephemeral: true
		});
		return true;
	}
	if (id.startsWith('er_del:')) {
		const rid = id.split(':')[2];
		const ok = deleteReminder(rid);
		await interaction.update({
			embeds: [resultEmbed(ok ? 'Deleted' : 'Not found', `\`${rid}\``, ok)],
			components: [row(new ButtonBuilder().setCustomId(`ed:list_rem:${userId}`).setLabel(' List').setStyle(ButtonStyle.Secondary))],
		});
		return true;
	}
	if (id.startsWith('er_event:')) {
		const eventName = interaction.values[0];
		const wiz = wizards.get(userId) || {
			guildId
		};
		wiz.event = eventName;
		wizards.set(userId, wiz);
		const typeMenu = new StringSelectMenuBuilder().setCustomId(`er_type:${userId}`).setPlaceholder('Schedule type').addOptions({
			label: 'Daily',
			value: 'daily',
			description: 'Every day at fixed UTC time'
		}, {
			label: 'One-time',
			value: 'once',
			description: 'Single date + time'
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
				title: ' New reminder',
				description: `Event: **${eventName}**\n\n**Step 2/4** Schedule type`,
				color: 'info'
			})],
			components: [
				row(typeMenu),
				row(new ButtonBuilder().setCustomId(`ed:home:${userId}`).setLabel(' Desk').setStyle(ButtonStyle.Secondary)),
			],
		});
		return true;
	}
	if (id.startsWith('er_type:')) {
		const type = interaction.values[0];
		const wiz = wizards.get(userId) || {};
		wiz.type = type;
		wizards.set(userId, wiz);
		const modal = new ModalBuilder().setCustomId(`er_modal_time:${userId}`).setTitle('Reminder details (UTC)');
		const rows = [
			input('hour', 'Hour UTC (0-23)', {
				placeholder: '14',
				max: 2
			}),
			input('minute', 'Minute (0-59)', {
				placeholder: '0',
				max: 2
			}),
			input('offsets', 'Minutes before (e.g. 60,10)', {
				required: false,
				placeholder: '60,10',
				value: '60,10'
			}),
			input('note', 'Event rules / note', {
				style: TextInputStyle.Paragraph,
				required: false,
				placeholder: 'Optional rules',
				max: 500
			}),
		];
		if (type === 'once') rows.push(input('date', 'Date YYYY-MM-DD', {
			placeholder: '2026-11-25'
		}));
		else if (type === 'every_x_days') rows.push(input('interval', 'Every how many days?', {
			placeholder: '2'
		}));
		else if (type === 'weekly') rows.push(input('weekdays', 'Weekdays 0=Sun6=Sat e.g. 1,3,5', {
			placeholder: '1,3,5'
		}));
		else if (type === 'monthly') rows.push(input('monthday', 'Day of month (1-31)', {
			placeholder: '15'
		}));
		else if (wiz.event === 'Custom') rows.push(input('custom_name', 'Custom event name', {
			placeholder: 'My event',
			max: 80
		}));
		modal.addComponents(...rows.slice(0, 5));
		await interaction.showModal(modal);
		return true;
	}
	if (id.startsWith('er_modal_time:')) {
		const wiz = wizards.get(userId);
		if (!wiz) {
			await interaction.reply({
				content: 'Setup expired. Run `/event` again.',
				ephemeral: true
			});
			return true;
		}
		const hour = parseInt(interaction.fields.getTextInputValue('hour'), 10);
		const minute = parseInt(interaction.fields.getTextInputValue('minute'), 10);
		if (isNaN(hour) || hour < 0 || hour > 23 || isNaN(minute) || minute < 0 || minute > 59) {
			await interaction.reply({
				content: 'Invalid hour/minute.',
				ephemeral: true
			});
			return true;
		}
		wiz.hour = hour;
		wiz.minute = minute;
		try {
			wiz.note = interaction.fields.getTextInputValue('note') || '';
		} catch {
			wiz.note = '';
		}
		let offsetsRaw = '60,10';
		try {
			offsetsRaw = interaction.fields.getTextInputValue('offsets') || '60,10';
		} catch {}
		wiz.offsets = offsetsRaw.split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => !isNaN(n) && n >= 0).slice(0, 5);
		if (!wiz.offsets.length) wiz.offsets = [60];
		try {
			if (wiz.type === 'once') wiz.date = interaction.fields.getTextInputValue('date');
			if (wiz.type === 'every_x_days') wiz.intervalDays = parseInt(interaction.fields.getTextInputValue('interval'), 10);
			if (wiz.type === 'weekly') {
				wiz.weekdays = interaction.fields.getTextInputValue('weekdays').split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => n >= 0 && n <= 6);
			}
			if (wiz.type === 'monthly') wiz.monthDay = parseInt(interaction.fields.getTextInputValue('monthday'), 10);
			if (wiz.event === 'Custom') {
				try {
					wiz.event = interaction.fields.getTextInputValue('custom_name') || 'Custom Event';
				} catch {}
			}
		} catch {}
		wizards.set(userId, wiz);
		const channelMenu = new ChannelSelectMenuBuilder().setCustomId(`er_channel:${userId}`).setPlaceholder('Channel for reminders').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
		await interaction.reply({
			embeds: [
				makeEmbed({
					title: ' New reminder',
					description: `Event: **${wiz.event}** ${wiz.type}\nTime: **${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} UTC**\n\n**Step 3/4** Choose channel`,
					color: 'info',
				}),
			],
			components: [
				row(channelMenu),
				row(new ButtonBuilder().setCustomId(`ed:home:${userId}`).setLabel(' Desk').setStyle(ButtonStyle.Secondary)),
			],
			ephemeral: true,
		});
		return true;
	}
	if (id.startsWith('er_channel:')) {
		const wiz = wizards.get(userId);
		if (!wiz) {
			await interaction.reply({
				content: 'Setup expired.',
				ephemeral: true
			});
			return true;
		}
		wiz.channelId = interaction.values[0];
		wizards.set(userId, wiz);
		await interaction.update({
			embeds: [
				makeEmbed({
					title: 'Confirm reminder',
					description: `**${wiz.event}**\nType: ${wiz.type} at ${String(wiz.hour).padStart(2, '0')}:${String(wiz.minute).padStart(2, '0')} UTC\n` + `Channel: <#${wiz.channelId}>\nOffsets: ${(wiz.offsets || []).map((o) => o + 'm').join(', ')}\nMention: @everyone` + (wiz.note ? `\n\nNote:\n${wiz.note}` : ''),
					color: 'warning',
				}),
			],
			components: [
				row(new ButtonBuilder().setCustomId(`er_confirm:${userId}`).setLabel('Create reminder').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`ed:home:${userId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)),
			],
		});
		return true;
	}
	if (id.startsWith('er_confirm:')) {
		const wiz = wizards.get(userId);
		if (!wiz?.channelId) {
			await interaction.update({
				content: 'Setup expired.',
				embeds: [],
				components: []
			});
			return true;
		}
		const reminder = createReminder({
			guildId: wiz.guildId || guildId,
			name: wiz.event,
			type: wiz.type,
			hour: wiz.hour,
			minute: wiz.minute,
			date: wiz.date || null,
			intervalDays: wiz.intervalDays || null,
			weekdays: wiz.weekdays || null,
			monthDay: wiz.monthDay || null,
			channelId: wiz.channelId,
			mention: '@everyone',
			offsets: wiz.offsets || [60, 10],
			note: wiz.note || '',
			createdBy: userId,
		});
		wizards.delete(userId);
		const next = getNextOccurrence(reminder);
		const nextStr = next ? `<t:${Math.floor(next.getTime() / 1000)}:F>` : '';
		await interaction.update({
			embeds: [resultEmbed('Reminder created', `**${reminder.name}**\n${formatSchedule(reminder)}\nNext: ${nextStr}\nID: \`${reminder.id}\``, true)],
			components: [
				row(new ButtonBuilder().setCustomId(`ed:list_rem:${userId}`).setLabel('List reminders').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(`ed:home:${userId}`).setLabel('Event Desk').setStyle(ButtonStyle.Primary)),
			],
		});
		return true;
	}
	/* Announcements */
	if (id.startsWith('ed:blog:')) {
		const modal = new ModalBuilder().setCustomId(`eb_modal:${userId}`).setTitle('Event announcement');
		modal.addComponents(input('event', 'Event name', {
			placeholder: 'Bear Trap / Arena / KVK',
			max: 60
		}), input('title', 'Title', {
			placeholder: 'Weekend schedule',
			max: 200
		}), input('content', 'Content', {
			style: TextInputStyle.Paragraph,
			placeholder: 'Write the announcement',
			max: 2000
		}), input('image', 'Image URL (optional)', {
			required: false,
			placeholder: 'https://',
			max: 400
		}));
		await interaction.showModal(modal);
		return true;
	}
	if (id.startsWith('eb_modal:')) {
		const event = interaction.fields.getTextInputValue('event');
		const title = interaction.fields.getTextInputValue('title');
		const content = interaction.fields.getTextInputValue('content');
		let image = '';
		try {
			image = interaction.fields.getTextInputValue('image') || '';
		} catch {}
		drafts.set(userId, {
			guildId,
			event,
			title,
			content,
			image,
			color: 0x5865f2,
			mention: '@everyone',
			channelId: null
		});
		const channelMenu = new ChannelSelectMenuBuilder().setCustomId(`eb_channel:${userId}`).setPlaceholder('Post to which channel?').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
		await interaction.reply({
			embeds: [makeEmbed({
				title: ' Announcement draft',
				description: `**${title}**\n\n${content.slice(0, 300)}${content.length > 300 ? '' : ''}`,
				color: 'info'
			})],
			components: [
				row(channelMenu),
				row(new ButtonBuilder().setCustomId(`eb_mention:${userId}`).setLabel('@everyone: ON').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId(`eb_now:${userId}`).setLabel('Post now').setStyle(ButtonStyle.Success).setDisabled(true), new ButtonBuilder().setCustomId(`eb_sched:${userId}`).setLabel('Schedule').setStyle(ButtonStyle.Primary).setDisabled(true)),
				row(new ButtonBuilder().setCustomId(`ed:home:${userId}`).setLabel(' Desk').setStyle(ButtonStyle.Secondary)),
			],
			ephemeral: true,
		});
		return true;
	}
	if (id.startsWith('eb_channel:')) {
		const d = drafts.get(userId);
		if (!d) {
			await interaction.reply({
				content: 'Draft expired.',
				ephemeral: true
			});
			return true;
		}
		d.channelId = interaction.values[0];
		drafts.set(userId, d);
		await interaction.update({
			embeds: [makeEmbed({
				title: ' Announcement draft',
				description: `**${d.title}** <#${d.channelId}>\n\n${d.content.slice(0, 300)}`,
				color: 'info'
			})],
			components: [
				row(new ChannelSelectMenuBuilder().setCustomId(`eb_channel:${userId}`).setPlaceholder('Change channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
				row(new ButtonBuilder().setCustomId(`eb_mention:${userId}`).setLabel(d.mention === '@everyone' ? '@everyone: ON' : '@everyone: OFF').setStyle(d.mention === '@everyone' ? ButtonStyle.Danger : ButtonStyle.Secondary), new ButtonBuilder().setCustomId(`eb_now:${userId}`).setLabel('Post now').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`eb_sched:${userId}`).setLabel('Schedule').setStyle(ButtonStyle.Primary)),
				row(new ButtonBuilder().setCustomId(`ed:home:${userId}`).setLabel(' Desk').setStyle(ButtonStyle.Secondary)),
			],
		});
		return true;
	}
	if (id.startsWith('eb_mention:')) {
		const d = drafts.get(userId);
		if (!d) {
			await interaction.reply({
				content: 'Draft expired.',
				ephemeral: true
			});
			return true;
		}
		d.mention = d.mention === '@everyone' ? '' : '@everyone';
		drafts.set(userId, d);
		await interaction.reply({
			content: d.mention ? 'Will mention **@everyone**' : 'No mention.',
			ephemeral: true
		});
		return true;
	}
	if (id.startsWith('eb_now:')) {
		const d = drafts.get(userId);
		if (!d?.channelId) {
			await interaction.reply({
				content: 'Pick a channel first.',
				ephemeral: true
			});
			return true;
		}
		try {
			const ch = await interaction.client.channels.fetch(d.channelId);
			const embed = blogEmbed({
				title: d.title,
				content: d.content,
				event: d.event,
				color: d.color,
				image: d.image
			});
			if (d.image) {
				try {
					embed.setImage(d.image);
				} catch {}
			}
			if (ch?.isTextBased()) await ch.send({
				content: d.mention || undefined,
				embeds: [embed]
			});
			drafts.delete(userId);
			await interaction.update({
				embeds: [resultEmbed('Posted', `Sent to <#${d.channelId}>`, true)],
				components: [row(new ButtonBuilder().setCustomId(`ed:home:${userId}`).setLabel('Event Desk').setStyle(ButtonStyle.Primary))],
			});
		} catch (e) {
			await interaction.reply({
				embeds: [errorEmbed('Failed', e.message)],
				ephemeral: true
			});
		}
		return true;
	}
	if (id.startsWith('eb_sched:')) {
		const d = drafts.get(userId);
		if (!d?.channelId) {
			await interaction.reply({
				content: 'Pick a channel first.',
				ephemeral: true
			});
			return true;
		}
		const modal = new ModalBuilder().setCustomId(`eb_sched_modal:${userId}`).setTitle('Schedule (UTC)');
		modal.addComponents(input('date', 'Date YYYY-MM-DD', {
			placeholder: '2026-11-25'
		}), input('hour', 'Hour UTC (0-23)', {
			placeholder: '14',
			max: 2
		}), input('minute', 'Minute (0-59)', {
			placeholder: '0',
			max: 2
		}));
		await interaction.showModal(modal);
		return true;
	}
	if (id.startsWith('eb_sched_modal:')) {
		const d = drafts.get(userId);
		if (!d?.channelId) {
			await interaction.reply({
				content: 'Draft expired.',
				ephemeral: true
			});
			return true;
		}
		const date = interaction.fields.getTextInputValue('date');
		const hour = parseInt(interaction.fields.getTextInputValue('hour'), 10);
		const minute = parseInt(interaction.fields.getTextInputValue('minute'), 10);
		if (!date || isNaN(hour) || isNaN(minute)) {
			await interaction.reply({
				content: 'Invalid schedule.',
				ephemeral: true
			});
			return true;
		}
		const blog = createBlog({
			guildId,
			event: d.event,
			title: d.title,
			content: d.content,
			image: d.image || '',
			color: d.color,
			channelId: d.channelId,
			mention: d.mention || '',
			type: 'once',
			date,
			hour,
			minute,
			createdBy: userId,
		});
		drafts.delete(userId);
		const when = `${date} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} UTC`;
		await interaction.reply({
			embeds: [resultEmbed('Scheduled', `**${d.title}** <#${d.channelId}>\nWhen: ${when}\nID: \`${blog.id}\``, true)],
			ephemeral: true,
		});
		return true;
	}
	if (id.startsWith('ed:quick:')) {
		const menu = new StringSelectMenuBuilder().setCustomId(`eb_quick_event:${userId}`).setPlaceholder('Which event is LIVE?').addOptions(PRESET_EVENTS.filter((e) => e !== 'Custom').slice(0, 25).map((e) => ({
			label: e,
			value: e
		})));
		await interaction.update({
			embeds: [makeEmbed({
				title: ' Quick LIVE',
				description: 'Pick the event, then a channel.',
				color: 'error'
			})],
			components: [
				row(menu),
				row(new ButtonBuilder().setCustomId(`ed:home:${userId}`).setLabel(' Desk').setStyle(ButtonStyle.Secondary)),
			],
		});
		return true;
	}
	if (id.startsWith('eb_quick_event:')) {
		const eventName = interaction.values[0];
		drafts.set(userId, {
			guildId,
			event: eventName,
			title: `${eventName} is LIVE!`,
			content: `**${eventName}** has started!\n\nGet ready, gather your troops, and fight for glory.\nGood luck, Governors! `,
			image: '',
			color: 0xed4245,
			mention: '@everyone',
			channelId: null,
			quick: true,
		});
		const channelMenu = new ChannelSelectMenuBuilder().setCustomId(`eb_channel:${userId}`).setPlaceholder('Post LIVE to which channel?').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
		await interaction.update({
			embeds: [makeEmbed({
				title: ` ${eventName} LIVE`,
				description: 'Select channel, then **Post now**.',
				color: 'error'
			})],
			components: [
				row(channelMenu),
				row(new ButtonBuilder().setCustomId(`eb_mention:${userId}`).setLabel('@everyone: ON').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId(`eb_now:${userId}`).setLabel('Post now').setStyle(ButtonStyle.Success).setDisabled(true)),
				row(new ButtonBuilder().setCustomId(`ed:home:${userId}`).setLabel(' Desk').setStyle(ButtonStyle.Secondary)),
			],
		});
		return true;
	}
	if (id.startsWith('ed:list_blog:')) {
		const list = listBlogs(guildId);
		if (!list.length) {
			await interaction.update({
				embeds: [makeEmbed({
					title: ' Announcements',
					description: '_None scheduled. Use **New announcement** on the Event Desk._',
					color: 'info'
				})],
				components: [row(new ButtonBuilder().setCustomId(`ed:home:${userId}`).setLabel(' Desk').setStyle(ButtonStyle.Secondary))],
			});
			return true;
		}
		const lines = list.map((b) => `${b.enabled === false ? '' : ''} **${b.title}** \`${b.id}\`\n${b.event} <#${b.channelId}>`);
		const menu = new StringSelectMenuBuilder().setCustomId(`eb_manage:${userId}`).setPlaceholder('Manage announcement').addOptions(list.slice(0, 25).map((b) => ({
			label: b.title.slice(0, 100),
			description: b.id,
			value: b.id
		})));
		await interaction.update({
			embeds: [makeEmbed({
				title: ` Announcements (${list.length})`,
				description: lines.join('\n\n').slice(0, 4000),
				color: 'info'
			})],
			components: [
				row(menu),
				row(new ButtonBuilder().setCustomId(`ed:home:${userId}`).setLabel(' Desk').setStyle(ButtonStyle.Secondary)),
			],
		});
		return true;
	}
	if (id.startsWith('eb_manage:')) {
		const bid = interaction.values[0];
		const b = getBlog(bid);
		if (!b) {
			await interaction.reply({
				content: 'Not found.',
				ephemeral: true
			});
			return true;
		}
		await interaction.update({
			embeds: [makeEmbed({
				title: b.title,
				description: `Event: **${b.event}**\nChannel: <#${b.channelId}>\nID: \`${b.id}\``,
				color: 'info'
			})],
			components: [
				row(new ButtonBuilder().setCustomId(`eb_del:${userId}:${bid}`).setLabel('Delete').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId(`ed:list_blog:${userId}`).setLabel(' List').setStyle(ButtonStyle.Secondary)),
			],
		});
		return true;
	}
	if (id.startsWith('eb_del:')) {
		const bid = id.split(':')[2];
		const ok = deleteBlog(bid);
		await interaction.update({
			embeds: [resultEmbed(ok ? 'Deleted' : 'Not found', `\`${bid}\``, ok)],
			components: [row(new ButtonBuilder().setCustomId(`ed:list_blog:${userId}`).setLabel(' List').setStyle(ButtonStyle.Secondary))],
		});
		return true;
	}
	return false;
}
module.exports.handleEventUI = handleEventUI;
