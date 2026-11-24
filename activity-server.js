const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
	WebSocket,
	WebSocketServer
} = require('ws');
const {
	TRIVIA,
	WORDS
} = require('./games/data');
const ROOT = __dirname;
const DIST = path.join(ROOT, 'activity', 'dist');
const rooms = new Map();
const MAX_ROOM_PLAYERS = 2;
const MAX_MESSAGE_BYTES = 4096;
const WIN_LINES = [
	[0, 1, 2],
	[3, 4, 5],
	[6, 7, 8],
	[0, 3, 4],
	[1, 4, 7],
	[2, 5, 8],
	[0, 4, 8],
	[2, 4, 6]
];
const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
	'.ico': 'image/x-icon'
};
const GAME_IDS = ['ttt', 'connect4', 'rps', 'reaction', 'trivia', 'guess', 'hangman', 'scramble', 'daily'];
const GAME_INFO = {
	ttt: {
		name: 'Tic-Tac-Toe',
		icon: '⭕',
		description: 'Connect three symbols in a row.',
		mode: '2 players'
	},
	connect4: {
		name: 'Connect Four',
		icon: '🔴',
		description: 'Drop four discs into a row.',
		mode: '2 players'
	},
	rps: {
		name: 'Rock Paper Scissors',
		icon: '✊',
		description: 'Best of three rounds.',
		mode: '2 players'
	},
	reaction: {
		name: 'Reaction Duel',
		icon: '⚡',
		description: 'Wait for GO, then tap first.',
		mode: '2 players'
	},
	trivia: {
		name: 'Kingshot Trivia',
		icon: '🧠',
		description: 'Five questions. Highest score wins.',
		mode: '1–2 players'
	},
	guess: {
		name: 'Guess the Number',
		icon: '🎯',
		description: 'Find the hidden number before your rival.',
		mode: '1–2 players'
	},
	hangman: {
		name: 'Hangman',
		icon: '🪝',
		description: 'Work together to reveal a Kingshot term.',
		mode: '1–2 players'
	},
	scramble: {
		name: 'Word Scramble',
		icon: '🔤',
		description: 'Race to unscramble five Kingshot words.',
		mode: '1–2 players'
	},
	daily: {
		name: 'Daily Challenge',
		icon: '📅',
		description: 'The same five-question challenge for everyone today.',
		mode: '1–2 players'
	},
};
const EVENT_IDS = ['post', 'quick', 'list', 'delete', 'toggle'];

function send(ws, data) {
	if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

function shuffle(a) {
	const x = [...a];
	for (let i = x.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[x[i], x[j]] = [x[j], x[i]];
	}
	return x;
}

function pickQuestions(seed, count = 5) {
	let n = seed || Date.now();
	const rand = () => {
		n = (n * 1664525 + 1013904223) >>> 0;
		return n / 4294967296;
	};
	const seededShuffle = (input) => {
		const a = [...input];
		for (let i = a.length - 1; i > 0; i--) {
			const j = Math.floor(rand() * (i + 1));
			[a[i], a[j]] = [a[j], a[i]];
		}
		return a;
	};
	const pool = [...TRIVIA];
	for (let i = pool.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[pool[i], pool[j]] = [pool[j], pool[i]];
	}
	return pool.slice(0, count).map(q => ({
		...q,
		options: seededShuffle([q.a, ...q.w])
	}));
}

function dailySeed() {
	return Number(new Date().toISOString().slice(0, 10).replace(/-/g, ''));
}

function makeGame(id) {
	if (id === 'ttt') return {
		id,
		status: 'playing',
		board: Array(9).fill(null),
		turn: 0,
		winner: null,
		winningLine: []
	};
	if (id === 'connect4') return {
		id,
		status: 'playing',
		board: Array.from({
			length: 6
		}, () => Array(7).fill(null)),
		turn: 0,
		winner: null,
		winningCells: []
	};
	if (id === 'rps') return {
		id,
		status: 'playing',
		round: 1,
		wins: [0, 0],
		picks: [null, null],
		revealed: false,
		winner: null
	};
	if (id === 'reaction') return {
		id,
		status: 'playing',
		phase: 'waiting',
		winner: null,
		falseStart: null
	};
	if (id === 'trivia' || id === 'daily') return {
		id,
		status: 'playing',
		questions: pickQuestions(id === 'daily' ? dailySeed() : Date.now()),
		index: 0,
		answers: [null, null],
		scores: [0, 0],
		winner: null,
		completed: false
	};
	if (id === 'guess') return {
		id,
		status: 'playing',
		secret: 1 + Math.floor(Math.random() * 100),
		guesses: [
			[],
			[]
		],
		low: 1,
		high: 100,
		winner: null,
		maxGuesses: 8
	};
	if (id === 'hangman') {
		const word = WORDS[Math.floor(Math.random() * WORDS.length)];
		return {
			id,
			status: 'playing',
			word,
			guessed: [],
			lives: 6,
			winner: null
		};
	}
	if (id === 'scramble') return makeScramble();
	return null;
}

function makeScramble() {
	const words = shuffle(WORDS).slice(0, 5);
	return {
		id: 'scramble',
		status: 'playing',
		words,
		index: 0,
		answers: [null, null],
		scores: [0, 0],
		winner: null,
		roundDone: false
	};
}

function makeRoom(instanceId) {
	return {
		instanceId,
		players: [],
		selectedGame: null,
		game: null,
		createdAt: Date.now()
	};
}

function connect4Winner(board, row, col, mark) {
	const dirs = [
		[0, 1],
		[1, 0],
		[1, 1],
		[1, -1]
	];
	const cells = [
		[row, col]
	];
	for (const [dr, dc] of dirs) {
		let line = [
			[row, col]
		];
		for (const sign of [-1, 1]) {
			let r = row + dr * sign,
				c = col + dc * sign;
			while (r >= 0 && r < 6 && c >= 0 && c < 7 && board[r][c] === mark) {
				line.push([r, c]);
				r += dr * sign;
				c += dc * sign;
			}
		}
		if (line.length >= 4) return line;
	}
	return null;
}

function startReaction(room) {
	const g = room.game;
	if (!g || g.id !== 'reaction') return;
	if (room.players.length < 2) {
		g.phase = 'waiting';
		broadcast(room);
		return;
	}
	g.phase = 'countdown';
	broadcast(room);
	const delay = 1800 + Math.floor(Math.random() * 3200);
	g.timer = setTimeout(() => {
		if (room.game !== g || g.status !== 'playing') return;
		g.phase = 'go';
		g.goAt = Date.now();
		broadcast(room);
	}, delay);
}

function publicGame(room, userId) {
	const g = room.game ? {
		...room.game
	} : null;
	if (g) delete g.timer;
	if (g?.id === 'rps' && !g.revealed) g.picks = g.picks.map((p, i) => room.players[i]?.id === userId ? p : (p ? 'locked' : null));
	if (g?.id === 'guess') {
		if (g.status !== 'playing') g.answer = g.secret;
		delete g.secret;
		g.myGuesses = g.guesses[room.players.findIndex(p => p.id === userId)] || [];
	}
	if (g?.id === 'hangman') {
		g.wordLength = g.word.length;
		g.revealed = g.status === 'playing' ? g.word.split('').map(c => g.guessed.includes(c) ? c : '_') : g.word.split('');
		delete g.word;
	}
	if (g?.id === 'trivia' || g?.id === 'daily') {
		const q = g.questions[g.index];
		g.question = q ? {
			q: q.q,
			cat: q.cat,
			options: q.options
		} : null;
		delete g.questions;
		g.myAnswer = g.answers[room.players.findIndex(p => p.id === userId)] || null;
	}
	if (g?.id === 'scramble') {
		const word = g.words[g.index];
		if (word) {
			let letters = shuffle(word.split(''));
			while (letters.join('') === word && word.length > 1) letters = shuffle(word.split(''));
			g.scrambled = letters.join('');
		} else g.scrambled = '';
		delete g.words;
	}
	return {
		players: room.players.map(p => ({
			id: p.id,
			username: p.username,
			avatar: p.avatar,
			// Add game info for each player
			currentGame: room.selectedGame,
			isPlaying: room.game !== null && room.game.status === 'playing',
		})),
		selectedGame: room.selectedGame,
		game: g,
		gameInfo: GAME_INFO,
		roomStatus: room.players.length >= 2 ? 'ready' : 'waiting',
		// Add activity summary for the lobby
		activitySummary: {
			totalPlayers: room.players.length,
			gamesInProgress: room.game !== null && room.game.status === 'playing',
			currentGameName: room.selectedGame ? GAME_INFO[room.selectedGame]?.name : null,
		}
	};
}

function broadcast(room) {
	for (const p of room.players) send(p.ws, {
		type: 'state',
		state: publicGame(room, p.id)
	});
}
async function getDiscordUser(token) {
	const r = await fetch('https://discord.com/api/users/@me', {
		headers: {
			Authorization: `Bearer ${token}`
		}
	});
	if (!r.ok) throw new Error('Discord authentication failed. Relaunch the Activity.');
	return r.json();
}
async function verifyActivityParticipant(instanceId, userId) {
	const id = process.env.CLIENTID,
		bot = process.env.DISCORDTOKEN;
	if (!id || !bot) throw new Error('Missing CLIENTID or DISCORDTOKEN in the bot environment.');
	const r = await fetch(`https://discord.com/api/v10/applications/${encodeURIComponent(id)}/activity-instances/${encodeURIComponent(instanceId)}`, {
		headers: {
			Authorization: `Bot ${bot}`
		}
	});
	if (!r.ok) throw new Error('Discord could not verify this Activity session. Close and relaunch it.');
	const d = await r.json();
	if (d.application_id !== id || d.instance_id !== instanceId || !Array.isArray(d.users) || !d.users.includes(userId)) throw new Error('Your Discord account is not an active participant in this Activity.');
}
async function exchangeCode(code) {
	const id = process.env.CLIENTID,
		secret = process.env.DISCORD_CLIENT_SECRET;
	if (!id || !secret) throw new Error('Missing CLIENTID or DISCORD_CLIENT_SECRET in .env.');
	const body = new URLSearchParams({
		client_id: id,
		client_secret: secret,
		grant_type: 'authorization_code',
		code
	});
	const r = await fetch('https://discord.com/api/oauth2/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body
	});
	const d = await r.json().catch(() => ({}));
	if (!r.ok || !d.access_token) throw new Error(d.error_description || d.error || 'Could not exchange Discord authorization code.');
	return d;
}

function serveStatic(req, res) {
	if (!fs.existsSync(path.join(DIST, 'index.html'))) {
		res.writeHead(503, {
			'Content-Type': 'text/plain'
		});
		res.end('Activity is not built. Run npm run build.');
		return;
	}
	let pathname;
	try {
		pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
	} catch {
		res.writeHead(400);
		res.end('Bad request');
		return;
	}
	const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
	let file = path.resolve(DIST, relative);
	if (!file.startsWith(`${path.resolve(DIST)}${path.sep}`) && file !== path.join(DIST, 'index.html')) {
		res.writeHead(403);
		res.end('Forbidden');
		return;
	}
	if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
	res.writeHead(200, {
		'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
		'Cache-Control': file.endsWith('index.html') ? 'no-cache' : 'public,max-age=3600'
	});
	fs.createReadStream(file).pipe(res);
}

function attachActivityServer(server) {
	const wss = new WebSocketServer({
		noServer: true,
		maxPayload: MAX_MESSAGE_BYTES
	});
	server.on('request', (req, res) => {
		const url = new URL(req.url, 'http://localhost');
		if (url.pathname === '/health') {
			res.writeHead(200, {
				'Content-Type': 'text/plain'
			});
			res.end('OK');
			return;
		}
		if (url.pathname === '/api/activity/token' && req.method === 'POST') {
			let raw = '';
			req.on('data', c => {
				raw += c;
				if (raw.length > 10000) req.destroy();
			});
			req.on('end', async () => {
				try {
					const p = JSON.parse(raw || '{}');
					if (typeof p.code !== 'string' || p.code.length > 4096) throw new Error('Invalid authorization code.');
					const t = await exchangeCode(p.code);
					res.writeHead(200, {
						'Content-Type': 'application/json',
						'Cache-Control': 'no-store'
					});
					res.end(JSON.stringify({
						access_token: t.access_token
					}));
				} catch (e) {
					res.writeHead(400, {
						'Content-Type': 'application/json',
						'Cache-Control': 'no-store'
					});
					res.end(JSON.stringify({
						error: e.message
					}));
				}
			});
			return;
		}
		if (req.method === 'GET') return serveStatic(req, res);
		// ===== Leaderboard API =====
		if (url.pathname === '/api/leaderboard' && req.method === 'POST') {
			let raw = '';
			req.on('data', c => {
				raw += c;
				if (raw.length > 10000) req.destroy();
			});
			req.on('end', async () => {
				try {
					const p = JSON.parse(raw || '{}');
					if (typeof p.accessToken !== 'string') throw new Error('Missing access token.');
					const user = await getDiscordUser(p.accessToken);
					const stats = require('./lib/gamestats');
					const leaderboard = stats.leaderboard(20);
					const formatted = leaderboard.map(u => ({
						id: u.id,
						username: u.username || 'Unknown',
						points: u.points,
						wins: u.wins,
						losses: u.losses,
						draws: u.draws,
					}));
					res.writeHead(200, {
						'Content-Type': 'application/json',
						'Cache-Control': 'no-store'
					});
					res.end(JSON.stringify({
						ok: true,
						leaderboard: formatted
					}));
				} catch (e) {
					res.writeHead(403, {
						'Content-Type': 'application/json',
						'Cache-Control': 'no-store'
					});
					res.end(JSON.stringify({
						ok: false,
						error: e.message
					}));
				}
			});
			return;
		}
		// ===== Event List API (for the Activity frontend) =====
		if (url.pathname === '/api/event/list' && req.method === 'POST') {
			let raw = '';
			req.on('data', c => {
				raw += c;
				if (raw.length > 10000) req.destroy();
			});
			req.on('end', async () => {
				try {
					const p = JSON.parse(raw || '{}');
					if (typeof p.accessToken !== 'string' || typeof p.guildId !== 'string') throw new Error('Missing params.');
					const user = await getDiscordUser(p.accessToken);
					const guild = await fetch(`https://discord.com/api/v10/guilds/${encodeURIComponent(p.guildId)}/members/${encodeURIComponent(user.id)}`, {
						headers: {
							Authorization: `Bot ${process.env.DISCORDTOKEN}`
						}
					});
					if (!guild.ok) throw new Error('Not in guild.');
					const member = await guild.json();
					const perms = BigInt(member.permissions || '0');
					const isAdmin = (perms & BigInt(8)) !== BigInt(0) || process.env.OWNER_USER_ID === user.id;
					if (!isAdmin) throw new Error('Admin only.');
					const blogs = require('./lib/blogs');
					const list = blogs.listBlogs(p.guildId);
					res.writeHead(200, {
						'Content-Type': 'application/json',
						'Cache-Control': 'no-store'
					});
					res.end(JSON.stringify({
						ok: true,
						blogs: list
					}));
				} catch (e) {
					res.writeHead(403, {
						'Content-Type': 'application/json',
						'Cache-Control': 'no-store'
					});
					res.end(JSON.stringify({
						ok: false,
						error: e.message
					}));
				}
			});
			return;
		}
		// ===== Event Delete API =====
		if (url.pathname === '/api/event/delete' && req.method === 'POST') {
			let raw = '';
			req.on('data', c => {
				raw += c;
				if (raw.length > 10000) req.destroy();
			});
			req.on('end', async () => {
				try {
					const p = JSON.parse(raw || '{}');
					if (typeof p.accessToken !== 'string' || typeof p.guildId !== 'string' || typeof p.id !== 'string') throw new Error('Missing params.');
					const user = await getDiscordUser(p.accessToken);
					const guild = await fetch(`https://discord.com/api/v10/guilds/${encodeURIComponent(p.guildId)}/members/${encodeURIComponent(user.id)}`, {
						headers: {
							Authorization: `Bot ${process.env.DISCORDTOKEN}`
						}
					});
					if (!guild.ok) throw new Error('Not in guild.');
					const member = await guild.json();
					const perms = BigInt(member.permissions || '0');
					const isAdmin = (perms & BigInt(8)) !== BigInt(0) || process.env.OWNER_USER_ID === user.id;
					if (!isAdmin) throw new Error('Admin only.');
					const blogs = require('./lib/blogs');
					const ok = blogs.deleteBlog(p.id);
					res.writeHead(200, {
						'Content-Type': 'application/json',
						'Cache-Control': 'no-store'
					});
					res.end(JSON.stringify({
						ok
					}));
				} catch (e) {
					res.writeHead(403, {
						'Content-Type': 'application/json',
						'Cache-Control': 'no-store'
					});
					res.end(JSON.stringify({
						ok: false,
						error: e.message
					}));
				}
			});
			return;
		}
		// ===== Event Toggle API =====
		if (url.pathname === '/api/event/toggle' && req.method === 'POST') {
			let raw = '';
			req.on('data', c => {
				raw += c;
				if (raw.length > 10000) req.destroy();
			});
			req.on('end', async () => {
				try {
					const p = JSON.parse(raw || '{}');
					if (typeof p.accessToken !== 'string' || typeof p.guildId !== 'string' || typeof p.id !== 'string' || typeof p.enabled !== 'boolean') throw new Error('Missing params.');
					const user = await getDiscordUser(p.accessToken);
					const guild = await fetch(`https://discord.com/api/v10/guilds/${encodeURIComponent(p.guildId)}/members/${encodeURIComponent(user.id)}`, {
						headers: {
							Authorization: `Bot ${process.env.DISCORDTOKEN}`
						}
					});
					if (!guild.ok) throw new Error('Not in guild.');
					const member = await guild.json();
					const perms = BigInt(member.permissions || '0');
					const isAdmin = (perms & BigInt(8)) !== BigInt(0) || process.env.OWNER_USER_ID === user.id;
					if (!isAdmin) throw new Error('Admin only.');
					const blogs = require('./lib/blogs');
					const ok = blogs.setBlogEnabled(p.id, p.enabled);
					res.writeHead(200, {
						'Content-Type': 'application/json',
						'Cache-Control': 'no-store'
					});
					res.end(JSON.stringify({
						ok
					}));
				} catch (e) {
					res.writeHead(403, {
						'Content-Type': 'application/json',
						'Cache-Control': 'no-store'
					});
					res.end(JSON.stringify({
						ok: false,
						error: e.message
					}));
				}
			});
			return;
		}
		res.writeHead(404);
		res.end('Not found');
	});
	server.on('upgrade', (req, socket, head) => {
		if (new URL(req.url, 'http://localhost').pathname !== '/ws') {
			socket.destroy();
			return;
		}
		wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
	});
	wss.on('connection', ws => {
		ws.isAlive = true;
		ws.on('pong', () => ws.isAlive = true);
		ws.on('message', async raw => {
			let m;
			try {
				m = JSON.parse(raw.toString());
			} catch {
				send(ws, {
					type: 'error',
					message: 'Invalid message.'
				});
				return;
			}
			if (!ws.player) {
				if (m.type !== 'auth' || typeof m.accessToken !== 'string' || typeof m.instanceId !== 'string' || m.instanceId.length > 200) {
					send(ws, {
						type: 'error',
						message: 'Authenticate through Discord before joining.'
					});
					ws.close(1008);
					return;
				}
				try {
					const user = await getDiscordUser(m.accessToken);
					await verifyActivityParticipant(m.instanceId, user.id);
					let room = rooms.get(m.instanceId);
					if (!room) {
						room = makeRoom(m.instanceId);
						rooms.set(m.instanceId, room);
					}
					let p = room.players.find(x => x.id === user.id);
					if (p) {
						if (p.ws && p.ws !== ws) p.ws.close(4001, 'Reconnected');
						p.ws = ws;
					} else {
						if (room.players.length >= MAX_ROOM_PLAYERS) {
							send(ws, {
								type: 'error',
								message: 'This Activity room already has two players.'
							});
							ws.close(1008);
							return;
						}
						p = {
							id: user.id,
							username: user.global_name || user.username,
							avatar: user.avatar,
							ws
						};
						room.players.push(p);
					}
					ws.player = p;
					ws.room = room;
					delete room.disconnectAt;
					if (room.players.length === 2 && room.game?.id === 'reaction' && room.game.phase === 'waiting') startReaction(room);
					send(ws, {
						type: 'ready'
					});
					broadcast(room);
				} catch (e) {
					send(ws, {
						type: 'error',
						message: e.message || 'Authentication failed.'
					});
					ws.close(1008);
				}
				return;
			}
			const room = ws.room;
			if (!room || ws.player.ws !== ws || !room.players.some(p => p.id === ws.player.id)) return;
			const me = room.players.findIndex(p => p.id === ws.player.id);
			const g = room.game;
			if (m.type === 'rematch' && g) {
				if (g.timer) clearTimeout(g.timer);
				room.game = makeGame(g.id);
				if (g.id === 'reaction') startReaction(room);
				else broadcast(room);
				return;
			}
			if (m.type === 'select_game') {
				if (!GAME_IDS.includes(m.gameId)) return;
				if (g?.timer) clearTimeout(g.timer);
				room.selectedGame = m.gameId;
				room.game = makeGame(m.gameId);
				if (m.gameId === 'reaction') startReaction(room);
				else broadcast(room);
				return;
			}
			if (m.type === 'menu') {
				if (g?.timer) clearTimeout(g.timer);
				room.selectedGame = null;
				room.game = null;
				broadcast(room);
				return;
			}
			if (m.type === 'event') {
				if (!m.sub || !EVENT_IDS.includes(m.sub)) return;
				broadcast(room);
				return;
			}
			if (!g || g.status !== 'playing') return;
			if (g.id === 'ttt' && m.type === 'move') {
				const i = Number(m.index);
				if (room.players.length < 2 || !Number.isInteger(i) || i < 0 || i > 8 || g.board[i] || g.turn !== me) return;
				g.board[i] = me === 0 ? 'X' : 'O';
				const line = WIN_LINES.find(([a, b, c]) => g.board[a] && g.board[a] === g.board[b] && g.board[a] === g.board[c]);
				if (line) {
					g.status = 'won';
					g.winner = me;
					g.winningLine = line;
				} else if (g.board.every(Boolean)) g.status = 'draw';
				else g.turn = 1 - me;
				broadcast(room);
				return;
			}
			if (g.id === 'connect4' && m.type === 'drop') {
				const c = Number(m.col);
				if (room.players.length < 2 || !Number.isInteger(c) || c < 0 || c > 6 || g.turn !== me) return;
				let r = -1;
				for (let y = 5; y >= 0; y--)
					if (!g.board[y][c]) {
						r = y;
						break;
					} if (r < 0) return;
				const mark = me === 0 ? 'R' : 'Y';
				g.board[r][c] = mark;
				const cells = connect4Winner(g.board, r, c, mark);
				if (cells) {
					g.status = 'won';
					g.winner = me;
					g.winningCells = cells;
				} else if (g.board[0].every(Boolean)) g.status = 'draw';
				else g.turn = 1 - me;
				broadcast(room);
				return;
			}
			if (g.id === 'rps' && m.type === 'pick') {
				const choice = String(m.choice);
				if (room.players.length < 2 || !['rock', 'paper', 'scissors'].includes(choice) || g.picks[me] || g.status !== 'playing') return;
				g.picks[me] = choice;
				if (g.picks.every(Boolean)) {
					g.revealed = true;
					const [a, b] = g.picks;
					const winner = a === b ? -1 : ({
						rock: 'scissors',
						paper: 'rock',
						scissors: 'paper'
					} [a] === b ? 0 : 1);
					if (winner >= 0) g.wins[winner]++;
					if (g.wins.some(x => x >= 2)) {
						g.status = 'finished';
						g.winner = g.wins[0] > g.wins[1] ? 0 : 1;
					}
				}
				broadcast(room);
				return;
			}
			if (g.id === 'rps' && m.type === 'next_round' && g.revealed && g.status === 'playing') {
				g.round++;
				g.picks = [null, null];
				g.revealed = false;
				broadcast(room);
				return;
			}
			if (g.id === 'reaction' && m.type === 'tap') {
				if (room.players.length < 2) return;
				if (g.phase === 'countdown') {
					g.phase = 'false-start';
					g.falseStart = me;
					g.status = 'finished';
					g.winner = 1 - me;
					if (g.timer) clearTimeout(g.timer);
				} else if (g.phase === 'go') {
					g.phase = 'done';
					g.status = 'finished';
					g.winner = me;
					g.reactionMs = Math.max(0, Date.now() - g.goAt);
				}
				broadcast(room);
				return;
			}
			if ((g.id === 'trivia' || g.id === 'daily') && m.type === 'answer') {
				if (g.answers[me] !== null) return;
				const q = g.questions[g.index],
					idx = Number(m.index);
				if (!Number.isInteger(idx) || idx < 0 || idx >= q.options.length) return;
				const correct = q.options[idx] === q.a;
				g.answers[me] = {
					index: idx,
					correct
				};
				if (correct) g.scores[me] += 10;
				broadcast(room);
				return;
			}
			if ((g.id === 'trivia' || g.id === 'daily') && m.type === 'next_question') {
				if (!g.answers.every((a, i) => room.players[i] ? a !== null : true)) return;
				if (g.index >= g.questions.length - 1) {
					g.status = 'finished';
					g.completed = true;
					g.winner = g.scores[0] === g.scores[1] ? -1 : g.scores[0] > g.scores[1] ? 0 : 1;
				} else {
					g.index++;
					g.answers = [null, null];
				}
				broadcast(room);
				return;
			}
			if (g.id === 'guess' && m.type === 'guess') {
				const n = Number(m.value);
				if (!Number.isInteger(n) || n < g.low || n > g.high || g.guesses[me].length >= g.maxGuesses) return;
				g.guesses[me].push(n);
				if (n === g.secret) {
					g.status = 'won';
					g.winner = me;
				} else {
					if (n < g.secret) g.low = Math.max(g.low, n + 1);
					else g.high = Math.min(g.high, n - 1);
					if (g.guesses.every(a => a.length >= g.maxGuesses)) {
						g.status = 'finished';
						g.winner = -1;
					}
				}
				broadcast(room);
				return;
			}
			if (g.id === 'hangman' && m.type === 'letter') {
				const letter = String(m.letter || '').toUpperCase();
				if (!/^[A-Z]$/.test(letter) || g.guessed.includes(letter)) return;
				g.guessed.push(letter);
				if (!g.word.includes(letter)) g.lives--;
				if (g.word.split('').every(c => g.guessed.includes(c))) {
					g.status = 'won';
					g.winner = me;
				} else if (g.lives <= 0) g.status = 'finished';
				broadcast(room);
				return;
			}
			if (g.id === 'hangman' && m.type === 'hint' && g.lives > 1) {
				const hidden = [...new Set(g.word.split('').filter(c => !g.guessed.includes(c)))];
				if (hidden.length) {
					g.guessed.push(hidden[Math.floor(Math.random() * hidden.length)]);
					g.lives--;
					if (g.word.split('').every(c => g.guessed.includes(c))) {
						g.status = 'won';
						g.winner = me;
					}
					broadcast(room);
				}
				return;
			}
			if (g.id === 'scramble' && m.type === 'solve') {
				if (g.roundDone) return;
				const answer = String(m.answer || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
				const word = g.words[g.index];
				if (answer !== word) return;
				g.scores[me] += 10;
				g.roundDone = true;
				g.roundWinner = me;
				broadcast(room);
				return;
			}
			if (g.id === 'scramble' && m.type === 'next_word' && g.roundDone) {
				if (g.index >= g.words.length - 1) {
					g.status = 'finished';
					g.winner = g.scores[0] === g.scores[1] ? -1 : g.scores[0] > g.scores[1] ? 0 : 1;
				} else {
					g.index++;
					g.roundDone = false;
					g.roundWinner = null;
				}
				broadcast(room);
				return;
			}
			if (url.pathname === '/api/event/verify' && req.method === 'POST') {
				let raw = '';
				req.on('data', c => {
					raw += c;
					if (raw.length > 10000) req.destroy();
				});
				req.on('end', async () => {
					try {
						const p = JSON.parse(raw || '{}');
						if (typeof p.accessToken !== 'string' || typeof p.guildId !== 'string') throw new Error('Missing params.');
						const user = await getDiscordUser(p.accessToken);
						// Check guild membership + admin
						const guild = await fetch(`https://discord.com/api/v10/guilds/${encodeURIComponent(p.guildId)}/members/${encodeURIComponent(user.id)}`, {
							headers: {
								Authorization: `Bot ${process.env.DISCORDTOKEN}`
							}
						});
						if (!guild.ok) throw new Error('Not in guild.');
						const member = await guild.json();
						const perms = BigInt(member.permissions || '0');
						const isAdmin = (perms & BigInt(8)) !== BigInt(0) || process.env.OWNER_USER_ID === user.id;
						res.writeHead(200, {
							'Content-Type': 'application/json',
							'Cache-Control': 'no-store'
						});
						res.end(JSON.stringify({
							ok: true,
							isAdmin,
							userId: user.id,
							username: user.global_name || user.username
						}));
					} catch (e) {
						res.writeHead(403, {
							'Content-Type': 'application/json',
							'Cache-Control': 'no-store'
						});
						res.end(JSON.stringify({
							ok: false,
							error: e.message
						}));
					}
				});
				return;
			}
		});
		ws.on('close', () => {
			const room = ws.room;
			if (!room || !ws.player) return;
			const p = room.players.find(x => x.id === ws.player.id);
			if (p && p.ws === ws) p.ws = null;
			if (room.players.every(x => !x.ws)) room.disconnectAt = Date.now();
		});
	});
	const heartbeat = setInterval(() => {
		for (const ws of wss.clients) {
			if (!ws.isAlive) {
				ws.terminate();
				continue;
			}
			ws.isAlive = false;
			ws.ping();
		}
		const now = Date.now();
		for (const [id, room] of rooms) {
			if ((room.disconnectAt && now - room.disconnectAt > 600000) || now - room.createdAt > 43200000) {
				if (room.game?.timer) clearTimeout(room.game.timer);
				rooms.delete(id);
			}
		}
	}, 30000);
	heartbeat.unref();
	return {
		wss,
		rooms
	};
}
module.exports = {
	attachActivityServer
};
