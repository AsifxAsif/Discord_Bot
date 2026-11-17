/**
 * 1v1 games: Tic-Tac-Toe, Connect Four, Rock-Paper-Scissors (best of 3), Reaction Duel (best of 3).
 * customId format: g:<key>:<sessionId>:<action>[:arg]
 */
const {
	ButtonStyle
} = require('discord.js');
const core = require('./core');
const stats = require('../lib/gamestats');
const {
	embed,
	btn,
	row,
	mention,
	ts,
	EPH
} = core;
const TURN_MS = 90 * 1000;
const INVITE_MS = 60 * 1000;
/* ---------- shared lifecycle ---------- */
const rematchBtn = (s) => btn(`g:${s.type}:${s.id}:rematch`, `🔁 Rematch (${s.rematch.size}/2)`, ButtonStyle.Primary);

function inviteView(s, g) {
	const [a, b] = s.players;
	return {
		content: mention(b),
		embeds: [
			embed({
				title: `${g.icon} ${g.label} — challenge!`,
				description: `${mention(a)} challenges ${mention(b)}!\n\n${g.rules}\n\n⏳ Invite expires <t:${ts(Date.now() + INVITE_MS)}:R>`,
				color: 'warn',
			}),
		],
		components: [
			row(btn(`g:${s.type}:${s.id}:accept`, 'Accept', ButtonStyle.Success, {
				emoji: '✅'
			}), btn(`g:${s.type}:${s.id}:decline`, 'Decline', ButtonStyle.Danger, {
				emoji: '✖️'
			}), btn(`g:${s.type}:${s.id}:cancel`, 'Cancel', ButtonStyle.Secondary)),
		],
	};
}
async function challenge(interaction, key) {
	const g = GAMES[key];
	const opp = interaction.options.getUser('opponent', true);
	if (opp.bot || opp.id === interaction.user.id) {
		return interaction.reply({
			embeds: [embed({
				title: '❌ Invalid opponent',
				description: 'Pick a real member — not yourself or a bot.',
				color: 'danger'
			})],
			flags: EPH,
		});
	}
	const s = core.createSession(key, {
		players: [interaction.user.id, opp.id],
		phase: 'invite',
		rematch: new Set(),
		winner: null,
		reason: null
	});
	await interaction.reply(inviteView(s, g));
	s.message = await interaction.fetchReply();
	core.setTimer(s, 'invite', INVITE_MS, async () => {
		if (s.phase !== 'invite') return;
		core.endSession(s.id);
		await s.message.edit({
			content: null,
			embeds: [embed({
				title: `${g.icon} ${g.label}`,
				description: '⌛ Challenge expired — nobody answered.',
				color: 'neutral'
			})],
			components: []
		}).catch(() => {});
	});
}
/** Mark game as over, record stats, keep session briefly for rematch. */
function finish(s, {
	winner = null,
	reason = null
} = {}) {
	s.phase = 'over';
	s.winner = winner;
	s.reason = reason;
	core.clearTimers(s);
	const [a, b] = s.players;
	if (winner) {
		const loser = winner === a ? b : a;
		stats.record(winner, s.type, 'win', 5);
		stats.record(loser, s.type, 'loss', 1);
	} else {
		stats.record(a, s.type, 'draw', 2);
		stats.record(b, s.type, 'draw', 2);
	}
	core.setTimer(s, 'cleanup', 5 * 60 * 1000, () => core.endSession(s.id));
}

function armTurn(s, onTimeout) {
	core.setTimer(s, 'turn', TURN_MS, async () => {
		if (s.phase !== 'play') return;
		onTimeout();
		await s.message.edit(GAMES[s.type].view(s)).catch(() => {});
	});
}
const resultLine = (s) => {
	if (s.winner) return `🏆 ${mention(s.winner)} wins!${s.reason === 'timeout' ? ' _(opponent timed out)_' : s.reason === 'forfeit' ? ' _(opponent forfeited)_' : ''}`;
	return '🤝 **It\'s a draw!**';
};
const other = (s, uid) => (uid === s.players[0] ? s.players[1] : s.players[0]);
/* =====================================================================
 * TIC-TAC-TOE
 * ===================================================================== */
const T_LINES = [
	[0, 1, 2],
	[3, 4, 5],
	[6, 7, 8],
	[0, 3, 6],
	[1, 4, 7],
	[2, 5, 8],
	[0, 4, 8],
	[2, 4, 6]
];
const tttWinner = (b) => {
	for (const l of T_LINES)
		if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) return {
			mark: b[l[0]],
			line: l
		};
	return null;
};

function tttReset(s) {
	s.board = Array(9).fill(null);
	s.turn = 0;
	s.winLine = null;
	s.phase = 'play';
	s.winner = null;
	s.reason = null;
}

function tttBegin(s, interaction) {
	tttReset(s);
	armTurn(s, () => finish(s, {
		winner: other(s, s.players[s.turn]),
		reason: 'timeout'
	}));
	return interaction.update(tttView(s));
}

function tttView(s) {
	const [a, b] = s.players;
	const over = s.phase === 'over';
	const status = over ? resultLine(s) : `🎯 ${mention(s.players[s.turn])}'s turn (${s.turn === 0 ? '❌' : '⭕'})\n⏳ Move <t:${ts(Date.now() + TURN_MS)}:R>`;
	const rows = [];
	for (let r = 0; r < 3; r++) {
		const comps = [];
		for (let c = 0; c < 3; c++) {
			const i = r * 3 + c;
			const cell = s.board[i];
			const win = s.winLine && s.winLine.includes(i);
			comps.push(btn(`g:ttt:${s.id}:move:${i}`, null, win ? ButtonStyle.Success : cell === 'X' ? ButtonStyle.Danger : cell === 'O' ? ButtonStyle.Primary : ButtonStyle.Secondary, {
				emoji: cell === 'X' ? '❌' : cell === 'O' ? '⭕' : '⬜',
				disabled: over || !!cell,
			}));
		}
		rows.push(row(...comps));
	}
	rows.push(row(over ? rematchBtn(s) : btn(`g:ttt:${s.id}:forfeit`, '🏳️ Forfeit', ButtonStyle.Secondary)));
	return {
		content: null,
		embeds: [embed({
			title: '⭕ Tic-Tac-Toe',
			description: `❌ ${mention(a)}  vs  ⭕ ${mention(b)}\n\n${status}`,
			color: over ? (s.winner ? 'success' : 'neutral') : s.turn === 0 ? 'danger' : 'info'
		})],
		components: rows,
	};
}
async function tttAction(s, interaction, action, arg) {
	const uid = interaction.user.id;
	if (s.phase !== 'play') return interaction.deferUpdate();
	if (action === 'forfeit') {
		finish(s, {
			winner: other(s, uid),
			reason: 'forfeit'
		});
		return interaction.update(tttView(s));
	}
	if (action !== 'move') return;
	if (uid !== s.players[s.turn]) return interaction.reply({
		content: '⏳ Not your turn.',
		flags: EPH
	});
	const i = Number(arg);
	if (s.board[i]) return interaction.reply({
		content: 'That cell is taken.',
		flags: EPH
	});
	s.board[i] = s.turn === 0 ? 'X' : 'O';
	const w = tttWinner(s.board);
	if (w) {
		s.winLine = w.line;
		finish(s, {
			winner: uid
		});
	} else if (s.board.every(Boolean)) finish(s, {});
	else {
		s.turn = 1 - s.turn;
		armTurn(s, () => finish(s, {
			winner: other(s, s.players[s.turn]),
			reason: 'timeout'
		}));
	}
	return interaction.update(tttView(s));
}
/* =====================================================================
 * CONNECT FOUR
 * ===================================================================== */
const C4_ROWS = 6;
const C4_COLS = 7;

function c4Drop(board, col, piece) {
	for (let r = C4_ROWS - 1; r >= 0; r--) {
		if (!board[r][col]) {
			board[r][col] = piece;
			return r;
		}
	}
	return -1;
}

function c4Win(board, row0, col0, piece) {
	for (const [dr, dc] of [
			[0, 1],
			[1, 0],
			[1, 1],
			[1, -1]
		]) {
		const cells = [
			[row0, col0]
		];
		for (const sign of [1, -1]) {
			let r = row0 + dr * sign;
			let c = col0 + dc * sign;
			while (r >= 0 && r < C4_ROWS && c >= 0 && c < C4_COLS && board[r][c] === piece) {
				cells.push([r, c]);
				r += dr * sign;
				c += dc * sign;
			}
		}
		if (cells.length >= 4) return cells;
	}
	return null;
}

function c4Reset(s) {
	s.board = Array.from({
		length: C4_ROWS
	}, () => Array(C4_COLS).fill(null));
	s.turn = 0;
	s.winCells = null;
	s.last = null;
	s.phase = 'play';
	s.winner = null;
	s.reason = null;
}

function c4Begin(s, interaction) {
	c4Reset(s);
	armTurn(s, () => finish(s, {
		winner: other(s, s.players[s.turn]),
		reason: 'timeout'
	}));
	return interaction.update(c4View(s));
}

function c4Render(s) {
	const win = new Set((s.winCells || []).map(([r, c]) => `${r},${c}`));
	const sym = (cell, r, c) => (cell === 'R' ? (win.has(`${r},${c}`) ? '🟥' : '🔴') : cell === 'Y' ? (win.has(`${r},${c}`) ? '🟨' : '🟡') : '⚫');
	return s.board.map((line, r) => line.map((cell, c) => sym(cell, r, c)).join('')).join('\n') + '\n1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣';
}

function c4View(s) {
	const [a, b] = s.players;
	const over = s.phase === 'over';
	const status = over ? resultLine(s) : `🎯 ${mention(s.players[s.turn])}'s turn (${s.turn === 0 ? '🔴' : '🟡'})\n⏳ Move <t:${ts(Date.now() + TURN_MS)}:R>`;
	const style = s.turn === 0 ? ButtonStyle.Danger : ButtonStyle.Primary;
	const col = (c) => btn(`g:c4:${s.id}:drop:${c}`, String(c + 1), style, {
		disabled: over || !!s.board[0][c]
	});
	const r1 = row(col(0), col(1), col(2), col(3), col(4));
	const r2 = row(col(5), col(6), over ? rematchBtn(s) : btn(`g:c4:${s.id}:forfeit`, '🏳️ Forfeit', ButtonStyle.Secondary));
	return {
		content: null,
		embeds: [embed({
			title: '🔴 Connect Four',
			description: `🔴 ${mention(a)}  vs  🟡 ${mention(b)}\n\n${c4Render(s)}\n\n${status}`,
			color: over ? (s.winner ? 'success' : 'neutral') : s.turn === 0 ? 'danger' : 'warn'
		})],
		components: [r1, r2],
	};
}
async function c4Action(s, interaction, action, arg) {
	const uid = interaction.user.id;
	if (s.phase !== 'play') return interaction.deferUpdate();
	if (action === 'forfeit') {
		finish(s, {
			winner: other(s, uid),
			reason: 'forfeit'
		});
		return interaction.update(c4View(s));
	}
	if (action !== 'drop') return;
	if (uid !== s.players[s.turn]) return interaction.reply({
		content: '⏳ Not your turn.',
		flags: EPH
	});
	const col = Number(arg);
	const piece = s.turn === 0 ? 'R' : 'Y';
	const r = c4Drop(s.board, col, piece);
	if (r < 0) return interaction.reply({
		content: 'That column is full.',
		flags: EPH
	});
	const win = c4Win(s.board, r, col, piece);
	if (win) {
		s.winCells = win;
		finish(s, {
			winner: uid
		});
	} else if (s.board[0].every(Boolean)) finish(s, {});
	else {
		s.turn = 1 - s.turn;
		armTurn(s, () => finish(s, {
			winner: other(s, s.players[s.turn]),
			reason: 'timeout'
		}));
	}
	return interaction.update(c4View(s));
}
/* =====================================================================
 * ROCK PAPER SCISSORS — first to 2 round wins, picks stay hidden
 * ===================================================================== */
const RPS = {
	rock: {
		e: '🪨',
		beats: 'scissors'
	},
	paper: {
		e: '📄',
		beats: 'rock'
	},
	scissors: {
		e: '✂️',
		beats: 'paper'
	}
};
const RPS_TARGET = 2;
const RPS_MAX_ROUNDS = 7;

function rpsBegin(s, interaction) {
	s.scores = [0, 0];
	s.round = 1;
	s.picks = {};
	s.history = [];
	s.phase = 'play';
	s.winner = null;
	s.reason = null;
	rpsArm(s);
	return interaction.update(rpsView(s));
}

function rpsArm(s) {
	armTurn(s, () => {
		const [a, b] = s.players;
		const pa = s.picks[a];
		const pb = s.picks[b];
		if (pa && !pb) finish(s, {
			winner: a,
			reason: 'timeout'
		});
		else if (pb && !pa) finish(s, {
			winner: b,
			reason: 'timeout'
		});
		else finish(s, {});
	});
}

function rpsView(s) {
	const [a, b] = s.players;
	const over = s.phase === 'over';
	const lock = (uid) => (s.picks[uid] ? '✅ locked in' : '⏳ choosing…');
	const hist = s.history.slice(-4).join('\n');
	const status = over ? `${resultLine(s)}\nFinal score: **${s.scores[0]} – ${s.scores[1]}**` : `**Round ${s.round}** — ${mention(a)} ${lock(a)} · ${mention(b)} ${lock(b)}\n⏳ Pick <t:${ts(Date.now() + TURN_MS)}:R>`;
	const comps = over ? [row(rematchBtn(s))] : [
		row(btn(`g:rps:${s.id}:pick:rock`, 'Rock', ButtonStyle.Primary, {
			emoji: RPS.rock.e
		}), btn(`g:rps:${s.id}:pick:paper`, 'Paper', ButtonStyle.Primary, {
			emoji: RPS.paper.e
		}), btn(`g:rps:${s.id}:pick:scissors`, 'Scissors', ButtonStyle.Primary, {
			emoji: RPS.scissors.e
		}), btn(`g:rps:${s.id}:forfeit`, '🏳️', ButtonStyle.Secondary)),
	];
	return {
		content: null,
		embeds: [
			embed({
				title: '🪨📄✂️ Rock Paper Scissors — first to 2',
				description: `${mention(a)}  **${s.scores[0]}**  ━  **${s.scores[1]}**  ${mention(b)}\n\n${status}${hist ? `\n\n${hist}` : ''}`,
				color: over ? (s.winner ? 'success' : 'neutral') : 'info',
			}),
		],
		components: comps,
	};
}
async function rpsAction(s, interaction, action, arg) {
	const uid = interaction.user.id;
	if (s.phase !== 'play') return interaction.deferUpdate();
	if (action === 'forfeit') {
		finish(s, {
			winner: other(s, uid),
			reason: 'forfeit'
		});
		return interaction.update(rpsView(s));
	}
	if (action !== 'pick' || !RPS[arg]) return;
	if (s.picks[uid]) return interaction.reply({
		content: 'You already locked in this round.',
		flags: EPH
	});
	s.picks[uid] = arg;
	const [a, b] = s.players;
	if (!(s.picks[a] && s.picks[b])) {
		await interaction.update(rpsView(s));
		return interaction.followUp({
			content: `You locked in ${RPS[arg].e} **${arg}**. Waiting for your opponent…`,
			flags: EPH
		}).catch(() => {});
	}
	const pa = s.picks[a];
	const pb = s.picks[b];
	let line;
	if (pa === pb) line = `**R${s.round}** ${RPS[pa].e} vs ${RPS[pb].e} — draw`;
	else if (RPS[pa].beats === pb) {
		s.scores[0]++;
		line = `**R${s.round}** ${RPS[pa].e} vs ${RPS[pb].e} — ${mention(a)} wins`;
	} else {
		s.scores[1]++;
		line = `**R${s.round}** ${RPS[pa].e} vs ${RPS[pb].e} — ${mention(b)} wins`;
	}
	s.history.push(line);
	s.picks = {};
	s.round++;
	if (s.scores[0] >= RPS_TARGET) finish(s, {
		winner: a
	});
	else if (s.scores[1] >= RPS_TARGET) finish(s, {
		winner: b
	});
	else if (s.round > RPS_MAX_ROUNDS) finish(s, {});
	else rpsArm(s);
	return interaction.update(rpsView(s));
}
/* =====================================================================
 * REACTION DUEL — first to 2, false-start penalty, millisecond timing
 * ===================================================================== */
const REACT_TARGET = 2;
const REACT_MAX_ROUNDS = 6;

function reactBegin(s, interaction) {
	s.scores = [0, 0];
	s.round = 1;
	s.stage = 'wait'; // wait | arming | go | result
	s.rid = 0;
	s.goAt = null;
	s.roundText = '';
	s.phase = 'play';
	s.winner = null;
	s.reason = null;
	const p = interaction.update(reactView(s));
	reactArm(s);
	return p;
}

function reactArm(s) {
	const rid = ++s.rid;
	core.setTimer(s, 'go', 2000 + Math.random() * 4000, async () => {
		if (s.rid !== rid || s.stage !== 'wait') return;
		s.stage = 'arming';
		const m = await s.message.edit(reactView({
			...s,
			stage: 'go'
		})).catch(() => null);
		if (s.rid !== rid || s.stage !== 'arming') return;
		s.goAt = (m && m.editedTimestamp) || Date.now();
		s.stage = 'go';
		core.setTimer(s, 'nogo', 8000, async () => {
			if (s.rid !== rid || s.stage !== 'go') return;
			s.roundText = '😴 Nobody clicked — round skipped.';
			await reactEndRound(s, null, null);
		});
	});
}
async function reactEndRound(s, winnerId, interaction) {
	core.clearTimers(s);
	s.stage = 'result';
	const [a, b] = s.players;
	if (winnerId === a) s.scores[0]++;
	if (winnerId === b) s.scores[1]++;
	const rid = s.rid;
	if (s.scores[0] >= REACT_TARGET) finish(s, {
		winner: a
	});
	else if (s.scores[1] >= REACT_TARGET) finish(s, {
		winner: b
	});
	else if (s.round >= REACT_MAX_ROUNDS) finish(s, {});
	else {
		core.setTimer(s, 'next', 3000, async () => {
			if (s.rid !== rid || s.phase !== 'play') return;
			s.round++;
			s.stage = 'wait';
			s.roundText = '';
			await s.message.edit(reactView(s)).catch(() => {});
			reactArm(s);
		});
	}
	if (interaction) return interaction.update(reactView(s));
	return s.message.edit(reactView(s)).catch(() => {});
}

function reactView(s) {
	const [a, b] = s.players;
	const over = s.phase === 'over';
	let head;
	let color = 'info';
	let button;
	if (over) {
		head = `${resultLine(s)}\nFinal score: **${s.scores[0]} – ${s.scores[1]}**`;
		color = s.winner ? 'success' : 'neutral';
		button = rematchBtn(s);
	} else if (s.stage === 'wait' || s.stage === 'arming') {
		head = '🔴 **Get ready… wait for GREEN!**\nClicking early = you lose the round.';
		color = 'danger';
		button = btn(`g:react:${s.id}:click`, '⏳ Wait for it…', ButtonStyle.Danger);
	} else if (s.stage === 'go') {
		head = '🟢 **CLICK NOW!**';
		color = 'success';
		button = btn(`g:react:${s.id}:click`, '⚡ CLICK!', ButtonStyle.Success);
	} else {
		head = s.roundText;
		button = btn(`g:react:${s.id}:click`, 'Next round incoming…', ButtonStyle.Secondary, {
			disabled: true
		});
	}
	return {
		content: null,
		embeds: [
			embed({
				title: '⚡ Reaction Duel — first to 2',
				description: `${mention(a)}  **${s.scores[0]}**  ━  **${s.scores[1]}**  ${mention(b)}\nRound **${s.round}**\n\n${head}${over && s.roundText ? `\n\n${s.roundText}` : ''}`,
				color,
			}),
		],
		components: [row(button)],
	};
}
async function reactAction(s, interaction, action) {
	const uid = interaction.user.id;
	if (s.phase !== 'play' || action !== 'click') return interaction.deferUpdate();
	if (s.stage === 'wait' || s.stage === 'arming') {
		s.roundText = `🚫 ${mention(uid)} clicked too early!`;
		return reactEndRound(s, other(s, uid), interaction);
	}
	if (s.stage === 'go') {
		const ms = Math.max(0, interaction.createdTimestamp - (s.goAt || interaction.createdTimestamp));
		s.roundText = `⚡ ${mention(uid)} reacted in **${ms} ms**!`;
		return reactEndRound(s, uid, interaction);
	}
	return interaction.reply({
		content: 'This round is already decided.',
		flags: EPH
	});
}
/* =====================================================================
 * Registry + router
 * ===================================================================== */
const GAMES = {
	ttt: {
		label: 'Tic-Tac-Toe',
		icon: '⭕',
		rules: 'Get **three in a row**. 90s per move.',
		begin: tttBegin,
		view: tttView,
		onAction: tttAction
	},
	c4: {
		label: 'Connect Four',
		icon: '🔴',
		rules: 'Connect **four** discs in any direction. 90s per move.',
		begin: c4Begin,
		view: c4View,
		onAction: c4Action
	},
	rps: {
		label: 'Rock Paper Scissors',
		icon: '✊',
		rules: 'First to **2 round wins**. Picks stay hidden until both lock in.',
		begin: rpsBegin,
		view: rpsView,
		onAction: rpsAction
	},
	react: {
		label: 'Reaction Duel',
		icon: '⚡',
		rules: 'First to **2 round wins**. Click when the button turns **green** — early clicks lose the round!',
		begin: reactBegin,
		view: reactView,
		onAction: reactAction
	},
};
const KEYS = new Set(Object.keys(GAMES));
const SUB_TO_KEY = {
	rps: 'rps',
	tictactoe: 'ttt',
	connect4: 'c4',
	reaction: 'react'
};
async function handle(interaction, parts) {
	const [, key, gid, action, arg] = parts;
	const g = GAMES[key];
	const s = core.getSession(gid);
	if (!s || s.type !== key) return core.expired(interaction);
	const uid = interaction.user.id;
	const [p1, p2] = s.players;
	if (s.phase === 'invite') {
		if (action === 'accept') {
			if (uid !== p2) return interaction.reply({
				content: '🚫 This challenge is not for you.',
				flags: EPH
			});
			core.clearTimers(s);
			return g.begin(s, interaction);
		}
		if (action === 'decline') {
			if (uid !== p2) return interaction.reply({
				content: '🚫 This challenge is not for you.',
				flags: EPH
			});
			core.endSession(s.id);
			return interaction.update({
				content: null,
				embeds: [embed({
					title: `${g.icon} ${g.label}`,
					description: `❌ ${mention(p2)} declined the challenge.`,
					color: 'neutral'
				})],
				components: []
			});
		}
		if (action === 'cancel') {
			if (uid !== p1) return interaction.reply({
				content: '🚫 Only the challenger can cancel.',
				flags: EPH
			});
			core.endSession(s.id);
			return interaction.update({
				content: null,
				embeds: [embed({
					title: `${g.icon} ${g.label}`,
					description: '🚫 Challenge cancelled.',
					color: 'neutral'
				})],
				components: []
			});
		}
		return interaction.deferUpdate();
	}
	if (!s.players.includes(uid)) return interaction.reply({
		content: '🚫 You are not part of this game.',
		flags: EPH
	});
	if (action === 'rematch') {
		if (s.phase !== 'over') return interaction.deferUpdate();
		s.rematch.add(uid);
		if (s.rematch.size < 2) return interaction.update(g.view(s));
		s.rematch.clear();
		s.players = [s.players[1], s.players[0]]; // loser-ish starts: swap who goes first
		core.clearTimers(s);
		return g.begin(s, interaction);
	}
	return g.onAction(s, interaction, action, arg);
}
module.exports = {
	KEYS,
	SUB_TO_KEY,
	challenge,
	handle,
	_t: {
		GAMES,
		tttWinner,
		c4Drop,
		c4Win,
		c4Render
	},
};
