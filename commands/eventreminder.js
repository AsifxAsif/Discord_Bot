const {
	SlashCommandBuilder,
	PermissionFlagsBits,
	ActionRowBuilder,
	StringSelectMenuBuilder,
	ChannelSelectMenuBuilder,
	ChannelType,
	ButtonBuilder,
	ButtonStyle,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
} = require('discord.js');
const {
	PRESET_EVENTS,
	createReminder,
	listReminders,
	deleteReminder,
	updateReminder,
	setEnabled,
	getNextOccurrence,
	getReminder
} = require('../lib/reminders');
const {
	parseTime,
	parseOffsets,
	parseDetails,
	formatSchedule,
	pad
} = require('../lib/schedule');
const {
	reminderMessage
} = require('../lib/eventembed');
const {
	deleteMessage,
	fieldGetter
} = require('../lib/discordutil');
const {
	isAdmin
} = require('../lib/admin');
const {
	makeEmbed,
	errorEmbed,
	resultEmbed
} = require('../lib/ui');

function canManage(interaction) {
	if (isAdmin(interaction)) return true;
	return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) || false;
}
const wizards = new Map();
module.exports = {
	data: new SlashCommandBuilder().setName('eventreminder').setDescription('Event reminder setup (Admin only)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addSubcommand((s) => s.setName('setup').setDescription('Interactive setup with dropdowns')).addSubcommand((s) => s.setName('list').setDescription('List all reminders')).addSubcommand((s) => s.setName('delete').setDescription('Delete a reminder by ID').addStringOption((o) => o.setName('id').setDescription('Reminder ID').setRequired(true))).addSubcommand((s) => s.setName('edit').setDescription('Edit an existing reminder').addStringOption((o) => o.setName('id').setDescription('Reminder ID').setRequired(true))).addSubcommand((s) => s.setName('toggle').setDescription('Enable or disable a reminder').addStringOption((o) => o.setName('id').setDescription('Reminder ID').setRequired(true)).addBooleanOption((o) => o.setName('enabled').setDescription('Enable?').setRequired(true))).addSubcommand((s) => s.setName('test').setDescription('Send a test message for a reminder').addStringOption((o) => o.setName('id').setDescription('Reminder ID').setRequired(true))),
	async execute(interaction) {
		if (!canManage(interaction)) {
			return interaction.reply({
				embeds: [errorEmbed('Permission denied', 'Admin only.')],
				ephemeral: true
			});
		}
		const sub = interaction.options.getSubcommand();
		const guildId = interaction.guildId;
		const userId = interaction.user.id;
		if (sub === 'list') {
			const list = listReminders(guildId);
			if (!list.length) {
				return interaction.reply({
					embeds: [makeEmbed({
						title: 'ðŸ”” Reminders',
						description: '_None yet. Use `/eventreminder setup`_',
						color: 'info'
					})],
					ephemeral: true
				});
			}
			const lines = list.map((r) => {
				const next = getNextOccurrence(r);
				const nextStr = next ? `<t:${Math.floor(next.getTime() / 1000)}:R>` : 'â€”';
				const note = r.note ? ' Â· ðŸ“ note' : '';
				return `${r.enabled ? 'âœ…' : 'âŒ'} ${r.emoji || 'ðŸ””'} **${r.name}** \`${r.id}\`\n${formatSchedule(r)} Â· Next ${nextStr}${note}`;
			});
			return interaction.reply({
				embeds: [makeEmbed({
					title: `ðŸ”” Reminders (${list.length})`,
					description: lines.join('\n\n').slice(0, 4000),
					color: 'info'
				})],
				ephemeral: true
			});
		}
		if (sub === 'delete') {
			const id = interaction.options.getString('id').trim();
			const r = getReminder(id);
			const ok = r && r.guildId === guildId ? deleteReminder(id) : false;
			if (ok) {
				for (const s of r.sent || []) await deleteMessage(interaction.client, s.channelId, s.messageId);
			}
			return interaction.reply({
				embeds: [resultEmbed(ok ? 'Deleted' : 'Not found', `\`${id}\``, !!ok)],
				ephemeral: true
			});
		}
		if (sub === 'edit') {
			const id = interaction.options.getString('id').trim();
			const r = getReminder(id);
			if (!r || r.guildId !== guildId) {
				return interaction.reply({
					embeds: [errorEmbed('Not found', `No reminder found with ID \`${id}\`.`)],
					ephemeral: true
				});
			}
			const modal = new ModalBuilder().setCustomId(`er_edit_modal:${userId}:${id}`).setTitle('Edit event reminder');
			modal.addComponents(input('name', 'Event name', {
				value: r.name || '',
				max: 60
			}), input('time', 'Event time UTC (HH:MM)', {
				value: `${pad(r.hour)}:${pad(r.minute)}`,
				max: 5
			}), input('offsets', 'Minutes before (e.g. 60,10)', {
				value: (r.offsets || [60, 10]).join(','),
				max: 30
			}), input('emoji', 'Event emoji', {
				value: r.emoji || 'ðŸ””',
				max: 100
			}), input('note', 'Reminder text / rules', {
				style: TextInputStyle.Paragraph,
				required: false,
				value: r.note || '',
				max: 700
			}));
			return interaction.showModal(modal);
		}
		if (sub === 'toggle') {
			const id = interaction.options.getString('id').trim();
			const enabled = interaction.options.getBoolean('enabled');
			const r = getReminder(id);
			const ok = r && r.guildId === guildId ? setEnabled(id, enabled) : false;
			return interaction.reply({
				embeds: [resultEmbed(ok ? (enabled ? 'Enabled' : 'Disabled') : 'Not found', `\`${id}\``, !!ok)],
				ephemeral: true
			});
		}
		if (sub === 'test') {
			const id = interaction.options.getString('id').trim();
			const r = getReminder(id);
			if (!r || r.guildId !== guildId) {
				return interaction.reply({
					embeds: [errorEmbed('Not found', `\`${id}\``)],
					ephemeral: true
				});
			}
			const eventTime = getNextOccurrence(r) || new Date();
			try {
				const ch = await interaction.client.channels.fetch(r.channelId);
				if (ch?.isTextBased()) await ch.send({
					content: reminderMessage(r, eventTime, {
						test: true
					})
				});
				return interaction.reply({
					embeds: [resultEmbed('Test sent', `<#${r.channelId}>`, true)],
					ephemeral: true
				});
			} catch (e) {
				return interaction.reply({
					embeds: [errorEmbed('Failed', e.message)],
					ephemeral: true
				});
			}
		}
		if (sub === 'setup') {
			wizards.delete(userId);
			wizards.set(userId, {
				guildId,
				step: 'event'
			});
			const eventMenu = new StringSelectMenuBuilder().setCustomId(`er_event:${userId}`).setPlaceholder('Select event').addOptions(PRESET_EVENTS.slice(0, 24).map((e) => ({
				label: e,
				value: e
			})));
			await interaction.reply({
				embeds: [makeEmbed({
					title: 'ðŸ”” Event Reminder Setup',
					description: '**Step 1/4** â€” Choose the event',
					color: 'info'
				})],
				components: [new ActionRowBuilder().addComponents(eventMenu)],
				ephemeral: true,
			});
		}
	},
};

function input(id, label, {
	style = TextInputStyle.Short,
	required = true,
	placeholder,
	value,
	max
} = {}) {
	const t = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required);
	if (placeholder) t.setPlaceholder(placeholder);
	if (value) t.setValue(value);
	if (max) t.setMaxLength(max);
	return new ActionRowBuilder().addComponents(t);
}
async function handleEventReminderUI(interaction) {
	const userId = interaction.user.id;
	const id = interaction.customId || '';
	if (!id.startsWith('er_')) return false;
	if (!canManage(interaction)) {
		await interaction.reply({
			content: 'Admin only.',
			ephemeral: true
		}).catch(() => {});
		return true;
	}
	if (id.startsWith('er_edit_modal:')) {
		const [, ownerId, reminderId] = id.split(':');
		if (ownerId !== userId) {
			await interaction.reply({
				content: 'This edit form is not yours.',
				ephemeral: true
			}).catch(() => {});
			return true;
		}
		const existing = getReminder(reminderId);
		if (!existing || existing.guildId !== interaction.guildId) {
			await interaction.reply({
				content: 'That reminder no longer exists.',
				ephemeral: true
			}).catch(() => {});
			return true;
		}
		const get = fieldGetter(interaction);
		const name = get('name').trim();
		const time = parseTime(get('time'));
		const emoji = get('emoji').trim();
		if (!name || !time || !emoji) {
			await interaction.reply({
				content: 'Please provide an event name, valid UTC time (HH:MM), and emoji.',
				ephemeral: true
			});
			return true;
		}
		const updated = updateReminder(reminderId, {
			name,
			hour: time.hour,
			minute: time.minute,
			offsets: parseOffsets(get('offsets')),
			emoji,
			note: get('note').trim()
		});
		await interaction.reply({
			embeds: [resultEmbed('Reminder updated', `**${updated.name}** ${updated.emoji}\n${formatSchedule(updated)}\nID: \`${updated.id}\``, true)],
			ephemeral: true
		});
		return true;
	}
	const parts = id.split(':');
	if (parts.length >= 2 && /^\d{15,}$/.test(parts[1]) && parts[1] !== userId) {
		await interaction.reply({
			content: 'This setup is not yours.',
			ephemeral: true
		}).catch(() => {});
		return true;
	}
	/* Step 1 */
	if (id.startsWith('er_event:')) {
		const eventName = interaction.values[0];
		const wiz = wizards.get(userId) || {
			guildId: interaction.guildId
		};
		wiz.event = eventName;
		wiz.step = 'type';
		wizards.set(userId, wiz);
		const typeMenu = new StringSelectMenuBuilder().setCustomId(`er_type:${userId}`).setPlaceholder('Schedule type').addOptions({
			label: 'Daily',
			value: 'daily',
			description: 'Every day at a fixed UTC time'
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
				title: 'ðŸ”” Event Reminder Setup',
				description: `Event: **${eventName}**${eventName === 'Custom' ? ' _(you\'ll name it in the next form)_' : ''}\n\n**Step 2/4** â€” Choose schedule type`,
				color: 'info'
			})],
			components: [new ActionRowBuilder().addComponents(typeMenu)],
		});
		return true;
	}
	/* Step 2 */
	if (id.startsWith('er_type:')) {
		const type = interaction.values[0];
		const wiz = wizards.get(userId);
		if (!wiz) {
			await interaction.reply({
				content: 'Setup expired. Run `/eventreminder setup` again.',
				ephemeral: true
			});
			return true;
		}
		wiz.type = type;
		wiz.step = 'time';
		wizards.set(userId, wiz);
		const modal = new ModalBuilder().setCustomId(`er_modal_time:${userId}`).setTitle('Reminder details (UTC)');
		const rows = [];
		if (wiz.event === 'Custom') rows.push(input('name', 'Event name', {
			placeholder: 'e.g. Guild Raid',
			max: 60
		}));
		rows.push(input('time', 'Event time UTC (HH:MM)', {
			placeholder: '20:00',
			max: 5
		}));
		if (type === 'once') rows.push(input('date', 'Date YYYY-MM-DD', {
			placeholder: '2026-11-20',
			max: 10
		}));
		if (type === 'every_x_days') rows.push(input('interval', 'Every how many days?', {
			placeholder: '2',
			max: 3
		}));
		if (type === 'weekly') rows.push(input('weekdays', 'Weekdays 0=Sunâ€¦6=Sat (e.g. 1,3,5)', {
			placeholder: '1,3,5',
			max: 20
		}));
		if (type === 'monthly') rows.push(input('monthday', 'Day of month (1-31)', {
			placeholder: '15',
			max: 2
		}));
		rows.push(input('offsets', 'Remind minutes before (e.g. 60,10)', {
			required: false,
			value: '60,10',
			max: 30
		}));
		rows.push(input('note', 'Reminder text / rules (optional)', {
			style: TextInputStyle.Paragraph,
			required: false,
			placeholder: 'This text is the reminder message â€” rules, rally timesâ€¦',
			max: 700
		}));
		modal.addComponents(...rows);
		await interaction.showModal(modal);
		return true;
	}
	/* Step 3 */
	if (id.startsWith('er_modal_time:')) {
		const wiz = wizards.get(userId);
		if (!wiz) {
			await interaction.reply({
				content: 'Setup expired. Run `/eventreminder setup` again.',
				ephemeral: true
			});
			return true;
		}
		const get = fieldGetter(interaction);
		const t = parseTime(get('time'));
		if (!t) {
			await interaction.reply({
				content: 'âš ï¸ Invalid time. Use `HH:MM` in UTC, e.g. `20:00`. Run `/eventreminder setup` again.',
				ephemeral: true
			});
			return true;
		}
		if (wiz.event === 'Custom') {
			const name = get('name').trim();
			if (!name) {
				await interaction.reply({
					content: 'âš ï¸ Please enter an event name. Run `/eventreminder setup` again.',
					ephemeral: true
				});
				return true;
			}
			wiz.name = name;
		} else {
			wiz.name = wiz.event;
		}
		const details = parseDetails(wiz.type, get);
		if (details.error) {
			await interaction.reply({
				content: `âš ï¸ ${details.error} Run \`/eventreminder setup\` again.`,
				ephemeral: true
			});
			return true;
		}
		Object.assign(wiz, {
			hour: t.hour,
			minute: t.minute,
			date: null,
			intervalDays: null,
			weekdays: null,
			monthDay: null
		}, details.data);
		if (wiz.type === 'once' && !getNextOccurrence(wiz)) {
			await interaction.reply({
				content: 'âš ï¸ That date/time is already in the past. Run `/eventreminder setup` again.',
				ephemeral: true
			});
			return true;
		}
		wiz.offsets = parseOffsets(get('offsets'));
		wiz.note = get('note').trim();
		wiz.step = 'channel';
		wizards.set(userId, wiz);
		const channelMenu = new ChannelSelectMenuBuilder().setCustomId(`er_channel:${userId}`).setPlaceholder('Select channel for reminders').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMaxValues(1);
		await interaction.reply({
			embeds: [makeEmbed({
				title: 'ðŸ”” Event Reminder Setup',
				description: `Event: **${wiz.name}**\nSchedule: ${formatSchedule(wiz)}\n\n**Step 3/4** â€” Choose the channel`,
				color: 'info'
			})],
			components: [new ActionRowBuilder().addComponents(channelMenu)],
			ephemeral: true,
		});
		return true;
	}
	/* Step 4 */
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
		wiz.step = 'confirm';
		wizards.set(userId, wiz);
		const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`er_confirm:${userId}`).setLabel('Create reminder').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`er_cancel:${userId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary));
		const previewTime = getNextOccurrence(wiz) || new Date();
		await interaction.update({
			embeds: [
				makeEmbed({
					title: 'ðŸ”” Confirm reminder',
					description: `**${wiz.name}**\nSchedule: ${formatSchedule(wiz)}\nChannel: <#${wiz.channelId}>\nRemind: ${wiz.offsets.map((o) => `${o}m`).join(', ')} before\nMention: @everyone\n\n**Preview** (shows only what you wrote):`,
					color: 'warning'
				}),
				makeEmbed({
					title: 'ðŸ“ Preview',
					description: reminderMessage(wiz, previewTime, {
						test: true
					}).replace('@everyone', '`@everyone`'),
					color: 'neutral'
				}),
			],
			components: [row],
		});
		return true;
	}
	if (id.startsWith('er_cancel:')) {
		wizards.delete(userId);
		await interaction.update({
			embeds: [makeEmbed({
				title: 'Cancelled',
				description: 'Reminder setup cancelled.',
				color: 'neutral'
			})],
			components: []
		});
		return true;
	}
	if (id.startsWith('er_confirm:')) {
		const wiz = wizards.get(userId);
		if (!wiz || !wiz.channelId) {
			await interaction.update({
				content: 'Setup expired.',
				embeds: [],
				components: []
			});
			return true;
		}
		const reminder = createReminder({
			guildId: wiz.guildId || interaction.guildId,
			name: wiz.name || wiz.event,
			note: wiz.note || '',
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
			createdBy: userId,
		});
		wizards.delete(userId);
		const next = getNextOccurrence(reminder);
		const nextStr = next ? `<t:${Math.floor(next.getTime() / 1000)}:F>` : 'â€”';
		await interaction.update({
			embeds: [resultEmbed('Reminder created', `**${reminder.name}**\n${formatSchedule(reminder)}\nNext: ${nextStr}\nID: \`${reminder.id}\``, true)],
			components: []
		});
		return true;
	}
	return false;
}
module.exports.handleEventReminderUI = handleEventReminderUI;
