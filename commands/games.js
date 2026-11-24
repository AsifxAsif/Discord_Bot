const {
	SlashCommandBuilder,
	PermissionFlagsBits,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	StringSelectMenuBuilder,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	ChannelSelectMenuBuilder,
	ChannelType
} = require('discord.js');
const core = require('../games/core');
const stats = require('../lib/gamestats');
const {
	embed
} = core;
const {
	isAdmin
} = require('../lib/admin');
const {
	makeEmbed,
	resultEmbed
} = require('../lib/ui');
async function launchActivity(interaction) {
	const response = await fetch(`https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			type: 12
		}),
	});
	if (!response.ok) {
		const detail = await response.text().catch(() => '');
		console.error('[games] Activity launch failed:', response.status, detail);
		throw new Error('Discord could not launch Kingshot Arcade. Make sure Activities are enabled for this application and try the App Launcher.');
	}
}
async function showStats(interaction) {
	const user = interaction.options.getUser('user') || interaction.user;
	const st = stats.getStats(user.id);
	const rate = st.played ? Math.round((st.wins / st.played) * 100) : 0;
	const per = Object.entries(st.games || {}).map(([k, g]) => `â€¢ **${k}** â€” ${g.wins}/${g.played} wins`).join('\n') || '_No games played yet_';
	return interaction.reply({
		embeds: [embed({
			title: `ðŸŽ® Game stats â€” ${user.username}`,
			color: 'info',
			fields: [{
				name: 'ðŸ† Points',
				value: `**${st.points}**`,
				inline: true
			}, {
				name: 'Played',
				value: String(st.played),
				inline: true
			}, {
				name: 'Win rate',
				value: `${rate}%`,
				inline: true
			}, {
				name: 'W / L / D',
				value: `${st.wins} / ${st.losses} / ${st.draws}`,
				inline: true
			}, {
				name: 'ðŸ… Win streak',
				value: `${st.streak} (best ${st.bestStreak})`,
				inline: true
			}, {
				name: 'ðŸ“… Daily streak',
				value: `${st.daily?.streak || 0} (best ${st.daily?.best || 0})`,
				inline: true
			}, {
				name: 'By game',
				value: per
			}, ],
		})],
		flags: core.EPH,
	});
}
async function showLeaderboard(interaction) {
	const top = stats.leaderboard(10);
	const medals = ['ðŸ¥‡', 'ðŸ¥ˆ', 'ðŸ¥‰'];
	const lines = top.map(
		(u, i) => `${medals[i] || `**${i + 1}.**`} <@${u.id}> â€” **${u.points}** pts Â· ${u.wins}W ${u.losses}L ${u.draws}D`);
	return interaction.reply({
		embeds: [embed({
			title: 'ðŸ† Games leaderboard',
			description: lines.join('\n') || '_No games played yet â€” be the first!_',
			color: 'gold',
			footer: 'Win = 5 pts Â· Draw = 2 Â· Loss = 1 Â· solo games score by performance',
		})],
		allowedMentions: {
			parse: []
		},
	});
}
/* Invite system */
const activeInvites = new Map();
async function handleInvite(interaction) {
	const userId = interaction.user.id;
	const id = interaction.customId || '';
	if (!id.startsWith('invite:')) return false;
	const parts = id.split(':');
	const action = parts[1]; // accept | decline | create
	const invId = parts[2];
	if (action === 'create') {
		// Open modal to create invite
		const modal = new ModalBuilder().setCustomId(`invite_modal:${userId}`).setTitle('Create Game Invite');
		modal.addComponents(new TextInputBuilder().setCustomId('invite_game').setLabel('Game (ttt, connect4, rps, reaction, trivia, guess, hangman, scramble, daily)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('ttt'), new TextInputBuilder().setCustomId('invite_channel').setLabel('Channel ID (optional â€” leave blank for current channel)').setStyle(TextInputStyle.Short).setRequired(false), new TextInputBuilder().setCustomId('invite_message').setLabel('Custom invite message (optional)').setStyle(TextInputStyle.Paragraph).setRequired(false).setPlaceholder('Come challenge me in Kingshot Arcade!'), );
		await interaction.showModal(modal);
		return true;
	}
	if (id.startsWith('invite_modal:')) {
		const get = (fid) => {
			try {
				return interaction.fields.getTextInputValue(fid) || '';
			} catch {
				return '';
			}
		};
		const game = get('invite_game').trim().toLowerCase();
		const channelId = get('invite_channel').trim() || interaction.channelId;
		const message = get('invite_message').trim() || `ðŸŽ® **${game.toUpperCase()}** invite! Come challenge me in Kingshot Arcade!`;
		const invId = `inv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
		activeInvites.set(invId, {
			game,
			channelId,
			creator: userId,
			message,
			createdAt: Date.now()
		});
		// Send invite to target channel
		try {
			const ch = await interaction.client.channels.fetch(channelId);
			if (ch?.isTextBased()) {
				const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`invite:accept:${invId}`).setLabel('ðŸŽ® Accept Invite').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`invite:decline:${invId}`).setLabel('Decline').setStyle(ButtonStyle.Secondary));
				await ch.send({
					content: message,
					components: [row]
				});
			}
		} catch (e) {
			console.error('Invite send failed:', e.message);
		}
		await interaction.reply({
			content: `âœ… Invite sent to <#${channelId}>! Code: \`${invId}\``,
			ephemeral: true
		});
		return true;
	}
	if (action === 'accept') {
		const inv = activeInvites.get(invId);
		if (!inv) {
			await interaction.reply({
				content: 'âš ï¸ This invite has expired.',
				ephemeral: true
			});
			return true;
		}
		if (interaction.user.id === inv.creator) {
			await interaction.reply({
				content: 'âš ï¸ You cannot accept your own invite.',
				ephemeral: true
			});
			return true;
		}
		// Launch activity with game pre-selected
		await interaction.reply({
			content: `ðŸŽ® Accepting invite â€” launching **${inv.game}**! Opening Kingshot Arcadeâ€¦`,
			ephemeral: false
		});
		// Try to launch the activity
		try {
			await launchActivity(interaction);
		} catch (e) {
			console.error('Activity launch error:', e.message);
		}
		activeInvites.delete(invId);
		return true;
	}
	if (action === 'decline') {
		activeInvites.delete(invId);
		await interaction.reply({
			content: 'âŒ Invite declined.',
			ephemeral: true
		});
		return true;
	}
	return false;
}
/* Game activity tracker â€” shows who is playing what */
const playerGames = new Map(); // userId -> { game, instanceId, username }
function getActivePlayers() {
	const list = [];
	for (const [uid, info] of playerGames) {
		list.push({
			id: uid,
			...info
		});
	}
	return list;
}

function updatePlayerGame(userId, username, game, instanceId) {
	if (game && instanceId) {
		playerGames.set(userId, {
			game,
			instanceId,
			username
		});
	} else {
		playerGames.delete(userId);
	}
}
// One command opens the complete Activity
const builder = new SlashCommandBuilder().setName('games').setDescription('Open the PXD Kingshot Arcade game hub');
module.exports = {
	data: builder,
	async execute(interaction) {
		return launchActivity(interaction);
	},
	handleInvite,
	updatePlayerGame,
	getActivePlayers,
};
