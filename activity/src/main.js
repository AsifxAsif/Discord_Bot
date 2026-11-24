import {
	connectDiscord
} from './discord.js';
import './style.css';
const app = document.querySelector('#app');
const GAMES = [{
	id: 'ttt',
	name: 'Tic-Tac-Toe',
	icon: '',
	desc: 'Connect three symbols in a row.',
	tag: 'Classic'
}, {
	id: 'connect4',
	name: 'Connect Four',
	icon: '',
	desc: 'Drop four discs into a row.',
	tag: 'Strategy'
}, {
	id: 'rps',
	name: 'Rock Paper Scissors',
	icon: '',
	desc: 'Best of three. Outsmart your rival.',
	tag: 'Quick duel'
}, {
	id: 'reaction',
	name: 'Reaction Duel',
	icon: '[!]',
	desc: 'Wait for GO and tap faster.',
	tag: 'Reflex'
}, {
	id: 'trivia',
	name: 'Kingshot Trivia',
	icon: '',
	desc: 'Five questions about Kingshot.',
	tag: 'Knowledge'
}, {
	id: 'guess',
	name: 'Guess the Number',
	icon: '',
	desc: 'Find the hidden number first.',
	tag: 'Puzzle'
}, {
	id: 'hangman',
	name: 'Hangman',
	icon: ' hangman',
	desc: 'Reveal the hidden Kingshot word.',
	tag: 'Word game'
}, {
	id: 'scramble',
	name: 'Word Scramble',
	icon: '',
	desc: 'Race to unscramble five terms.',
	tag: 'Word race'
}, {
	id: 'daily',
	name: 'Daily Challenge',
	icon: '',
	desc: 'A shared daily five-question challenge.',
	tag: 'Daily'
}, ];
const EVENT_ACTIONS = ['post', 'quick', 'list', 'delete', 'toggle'];
let socket = null;
let session = null;
let state = null;
let connected = false;
let errorText = '';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
} [c]));
const send = o => {
	if (socket?.readyState === WebSocket.OPEN) {
 socket.send(JSON.stringify(o));
	}
};
const me = () => state?.players?.findIndex(p => p.id === session?.user?.id) ?? -1;
const myName = () => session?.user?.global_name || session?.user?.username || 'Player';

function avatar(p) {
	return `<div class="avatar">${esc((p?.username || '?').slice(0, 1).toUpperCase())}</div>`;
}

function playerCard(p, i, g) {
	const active = (g?.turn === i && g?.status === 'playing') || (g?.id === 'reaction' && g?.phase === 'go');
	return `
 <div class="player ${active ? 'active' : ''}">
 ${avatar(p)}
 <div class="player-copy">
 <strong>${esc(p?.username || 'Waiting for player')}</strong>
 <span>${p ? (i === 0 ? 'Player 1' : 'Player 2') : 'Open the same Activity to join'}</span>
 </div>
 <b class="seat">${p ? (i === 0 ? 'P1' : 'P2') : ' - '}</b>
 </div>
 `;
}

function header() {
	return `
 <header class="topbar">
 <div class="brand">
 <div class="brand-icon"></div>
 <div>
 <div class="eyebrow">PXD ALLIANCE | KINGDOM ARCADE</div>
 <h1>PXD <span>Kingshot</span></h1>
 </div>
 </div>
 <div class="connection ${connected ? 'online' : ''}">
 <i></i>${connected ? 'Connected' : 'Connecting'}
 </div>
 </header>
 `;
}

function shell(content) {
	app.innerHTML = `
 ${header()}
 <main class="content">
 ${errorText ? `<div class="error">${esc(errorText)}</div>` : ''}
 ${content}
 <footer class="footer">
 ${esc(myName())}
 <span> | </span>
 PXD | For the glory of the kingdom
 </footer>
 </main>
 `;
	wireCommon();
}

function wireCommon() {
	app.querySelectorAll('[data-game]').forEach(b => {
 b.addEventListener('click', () => send({
 type: 'select_game',
 gameId: b.dataset.game
 }));
	});
	app.querySelectorAll('[data-action]').forEach(b => {
 b.addEventListener('click', () => {
 let payload = {};
 if (b.dataset.payload) {
 try {
 payload = JSON.parse(b.dataset.payload);
 } catch (e) {
 console.error('Invalid button payload:', e);
 return;
 }
 }
 send({
 type: b.dataset.action,
 ...payload
 });
 });
	});
	app.querySelector('#back-menu')?.addEventListener('click', () => send({
 type: 'menu'
	}));
	app.querySelector('#rematch')?.addEventListener('click', () => send({
 type: 'rematch'
	}));
}
/* =====================================================================
 * LEADERBOARD PANEL
 * ===================================================================== */
async function showLeaderboard() {
	const detail = document.getElementById('event-detail');
	if (!detail) return;
	detail.innerHTML = '<p>Loading leaderboard...</p>';
	try {
 const res = await fetch('/api/leaderboard', {
 headers: {
 'Content-Type': 'application/json'
 },
 method: 'POST',
 body: JSON.stringify({
 accessToken: session?.accessToken,
 guildId: session?.guildId
 }),
 });
 const data = await res.json();
 if (!data.ok) throw new Error(data.error || 'Failed to load leaderboard');
 const players = data.leaderboard || [];
 if (!players.length) {
 detail.innerHTML = '<p>No players have competed yet.</p>';
 return;
 }
 const medals = ['', '', ''];
 detail.innerHTML = `
 <div class="leaderboard">
 <h3> Kingshot Leaderboard</h3>
 ${players.map((p, i) => `
 <div class="lb-row">
 <span class="lb-rank">${medals[i] || `${i + 1}.`}</span>
 <span class="lb-name">${esc(p.username || 'Unknown')}</span>
 <span class="lb-points">${p.points} pts</span>
 <span class="lb-wins">${p.wins}W</span>
 </div>
 `).join('')}
 </div>
 `;
	} catch (e) {
 detail.innerHTML = `<p class="error">${esc(e.message)}</p>`;
	}
}
/* =====================================================================
 * INVITE SYSTEM
 * ===================================================================== */
function showInvitePanel() {
	const detail = document.getElementById('event-detail');
	if (!detail) return;
	detail.innerHTML = `
 <div class="invite-panel">
 <h3> Invite to Play</h3>
 <label>Game</label>
 <select id="invite-game">
 ${GAMES.map(g => `<option value="${g.id}">${g.icon} ${g.name}</option>`).join('')}
 </select>
 <label>Target</label>
 <div class="invite-targets">
 <button class="primary-button" id="invite-player-btn">Invite a Player</button>
 <button class="ghost-button" id="invite-channel-btn">Post to Channel</button>
 </div>
 <div id="invite-detail"></div>
 </div>
 `;
	document.getElementById('invite-player-btn')?.addEventListener('click', async () => {
 const game = document.getElementById('invite-game')?.value || 'ttt';
 const user = prompt('Enter the Discord User ID of the player you want to invite:');
 if (!user) return;
 send({
 type: 'event',
 sub: 'invite',
 game,
 target: user,
 targetType: 'player'
 });
 document.getElementById('invite-detail').innerHTML = `<p>[OK] Invite sent to player <code>${esc(user)}</code> for <strong>${esc(game)}</strong>!</p>`;
	});
	document.getElementById('invite-channel-btn')?.addEventListener('click', async () => {
 const game = document.getElementById('invite-game')?.value || 'ttt';
 const channel = prompt('Enter the Discord Channel ID to post the invite:');
 if (!channel) return;
 send({
 type: 'event',
 sub: 'invite',
 game,
 target: channel,
 targetType: 'channel'
 });
 document.getElementById('invite-detail').innerHTML = `<p>[OK] Invite posted to channel <code>${esc(channel)}</code> for <strong>${esc(game)}</strong>!</p>`;
	});
}
/* =====================================================================
 * EVENT DESK
 * ===================================================================== */
function renderEventDesk() {
	shell(`
 <section class="intro game-intro">
 <button class="back-button" id="back-menu"><- All games</button>
 <div class="eyebrow">KINGSHOT ARCADE</div>
 <h2>Event Desk</h2>
 <p>Reminders, announcements, and LIVE posts for your guild (admin).</p>
 </section>

 <section class="match-card">
 <div class="action-row" style="flex-wrap:wrap;gap:8px;">
 <button class="primary-button" data-action="event:post">Post announcement</button>
 <button class="primary-button" data-action="event:quick">Quick LIVE post</button>
 <button class="ghost-button" data-action="event:list">Scheduled</button>
 <button class="ghost-button" data-action="event:leaderboard"> Leaderboard</button>
 <button class="ghost-button" data-action="event:invite"> Invite</button>
 </div>
 <div id="event-detail" style="margin-top:18px;"></div>
 </section>
 `);
	app.querySelector('[data-action="event:post"]')?.addEventListener('click', () => {
 send({
 type: 'event',
 sub: 'post'
 });
 showEventForm('post');
	});
	app.querySelector('[data-action="event:quick"]')?.addEventListener('click', () => {
 send({
 type: 'event',
 sub: 'quick'
 });
 quickEvent();
	});
	app.querySelector('[data-action="event:list"]')?.addEventListener('click', () => {
 send({
 type: 'event',
 sub: 'list'
 });
 listEvents();
	});
	app.querySelector('[data-action="event:leaderboard"]')?.addEventListener('click', () => {
 send({
 type: 'event',
 sub: 'leaderboard'
 });
 showLeaderboard();
	});
	app.querySelector('[data-action="event:invite"]')?.addEventListener('click', () => {
 send({
 type: 'event',
 sub: 'invite'
 });
 showInvitePanel();
	});
}

function showEventForm(mode) {
	const detail = document.getElementById('event-detail');
	if (!detail) return;
	detail.innerHTML = `
 <div class="event-form">
 <h3>${mode === 'post' ? 'Post announcement' : 'Quick LIVE post'}</h3>
 <label>Event name</label>
 <input id="ev-event" type="text" placeholder="Bear Trap / Arena / KVK..." maxlength="60" />
 <label>Title</label>
 <input id="ev-title" type="text" placeholder="Weekend Bear Trap schedule" maxlength="200" />
 <label>Content</label>
 <textarea id="ev-content" rows="4" placeholder="Write the announcement..." maxlength="2000"></textarea>
 <label>Image URL (optional)</label>
 <input id="ev-image" type="text" placeholder="https://..." maxlength="400" />
 <div class="action-row">
 <button class="primary-button" id="ev-submit">Post now</button>
 <button class="ghost-button" id="ev-cancel">Cancel</button>
 </div>
 </div>
 `;
	detail.querySelector('#ev-cancel')?.addEventListener('click', () => {
 detail.innerHTML = '';
	});
	detail.querySelector('#ev-submit')?.addEventListener('click', async () => {
 const event = detail.querySelector('#ev-event').value.trim();
 const title = detail.querySelector('#ev-title').value.trim();
 const content = detail.querySelector('#ev-content').value.trim();
 const image = detail.querySelector('#ev-image').value.trim();
 if (!event || !title || !content) {
 alert('Please fill in event name, title, and content.');
 return;
 }
 send({
 type: 'event',
 sub: mode,
 event,
 title,
 content,
 image
 });
 detail.innerHTML = '<p>[OK] Submitted! Check Discord for the result.</p>';
	});
}
async function quickEvent() {
	const event = prompt('Event name (e.g. Bear Trap):', 'Bear Trap');
	if (!event) return;
	send({
 type: 'event',
 sub: 'quick',
 event
	});
}
async function listEvents() {
	const detail = document.getElementById('event-detail');
	if (!detail) return;
	detail.innerHTML = '<p>Loading scheduled events...</p>';
	try {
 const res = await fetch('/api/event/list', {
 headers: {
 'Content-Type': 'application/json'
 },
 method: 'POST',
 body: JSON.stringify({
 accessToken: session?.accessToken,
 guildId: session?.guildId
 }),
 });
 const data = await res.json();
 if (!data.ok) throw new Error(data.error || 'Failed to load events');
 const blogs = data.blogs || [];
 if (!blogs.length) {
 detail.innerHTML = '<p>No scheduled events yet.</p>';
 return;
 }
 detail.innerHTML = blogs.map(b => `
 <div class="event-list-item">
 <strong>${esc(b.title)}</strong> <code>${esc(b.id)}</code>
 <div>${esc(b.event)} | ${esc(b.channelId ? `<#${b.channelId}>` : 'no channel')} | ${b.enabled ? 'Enabled' : 'Disabled'}</div>
 <div class="action-row">
 <button class="ghost-button" data-event-delete="${esc(b.id)}">Delete</button>
 <button class="ghost-button" data-event-toggle="${esc(b.id)}" data-enabled="${b.enabled}">${b.enabled ? 'Disable' : 'Enable'}</button>
 </div>
 </div>
 `).join('');
 detail.querySelectorAll('[data-event-delete]').forEach(b => {
 b.addEventListener('click', async () => {
 const id = b.dataset.eventDelete;
 await fetch('/api/event/delete', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json'
 },
 body: JSON.stringify({
 accessToken: session?.accessToken,
 guildId: session?.guildId,
 id
 })
 });
 listEvents();
 });
 });
 detail.querySelectorAll('[data-event-toggle]').forEach(b => {
 b.addEventListener('click', async () => {
 const id = b.dataset.eventToggle;
 const enabled = b.dataset.enabled !== 'true';
 await fetch('/api/event/toggle', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json'
 },
 body: JSON.stringify({
 accessToken: session?.accessToken,
 guildId: session?.guildId,
 id,
 enabled
 })
 });
 listEvents();
 });
 });
	} catch (e) {
 detail.innerHTML = `<p class="error">${esc(e.message)}</p>`;
	}
}
/* =====================================================================
 * GAME RENDERING
 * ===================================================================== */
function statusLine(text) {
	return `
 <div class="game-status">
 <span class="status-dot playing"></span>
 ${esc(text)}
 </div>
 `;
}

function playersPanel(g) {
	return `
 <div class="players">
 ${playerCard(state.players?.[0], 0, g)}
 <div class="versus">VS</div>
 ${playerCard(state.players?.[1], 1, g)}
 </div>
 `;
}

function endControls(g) {
	if (!['won', 'draw', 'finished'].includes(g.status)) return '';
	let result = g.winner === -1 ? "It's a draw!" : g.winner === me() ? 'You win!' : g.winner >= 0 ? `${esc(state.players[g.winner]?.username || 'Opponent')} wins!` : 'Round complete';
	if (g.id === 'guess' && g.answer !== undefined) result += ` | Number: ${g.answer}`;
	if (g.id === 'hangman' && g.revealed) result += ` | Word: ${g.revealed.join('')}`;
	return `
 <div class="end-panel">
 <strong>${result}</strong>
 <div class="action-row">
 <button class="primary-button" id="rematch">Play again</button>
 <button class="ghost-button" id="back-menu">All games</button>
 </div>
 </div>
 `;
}

function boardTtt(g) {
	const win = new Set(g.winningLine || []);
	return `
 <div class="ttt-board">
 ${g.board.map((v, i) => `
 <button
 class="ttt-cell ${v === 'X' ? 'x' : v === 'O' ? 'o' : ''} ${win.has(i) ? 'winning' : ''}"
 data-action="move"
 data-payload='{"index":${i}}'
 ${state.players.length < 2 || g.status !== 'playing' || g.turn !== me() || v ? 'disabled' : ''}
 >
 ${v === 'X' ? '' : v === 'O' ? '' : ''}
 </button>
 `).join('')}
 </div>
 `;
}

function boardConnect(g) {
	const win = new Set(
 (g.winningCells || []).map(([r, c]) => `${r}-${c}`));
	return `
 <div class="c4-board">
 ${Array.from({ length: 7 }, (_, c) => ` < button
	class = "drop-col"
	data - action = "drop"
	data - payload = '{"col":${c}}'
	$ {
 state.players.length < 2 || g.status !== 'playing' || g.turn !== me() ? 'disabled' : ''
	} > < /button>
	`).join('')}

 ${g.board.map((row, r) => row.map((v, c) => `
 <div class="c4-hole ${v === 'R' ? 'red' : v === 'Y' ? 'yellow' : ''} ${win.has(`${r}-${c}`) ? 'winning' : ''}"></div>
 `).join('')).join('')}
 </div>
 `;
}

function renderGame() {
	const g = state.game;
	const info = GAMES.find(x => x.id === g.id) || GAMES[0];
	let body = '';
	let status = '';
	// Show what other players are doing
	const otherPlayers = (state.players || []).filter(p => p.id !== session?.user?.id);
	const otherPlaying = otherPlayers.map(p => {
 // We don't have per-player game state from the server in this view,
 // but we can show who's in the room
 return ` < span class = "player-tag" > $ {
 esc(p.username)
	} < /span>`;
	}).join(' ');
	if (['ttt', 'connect4', 'rps', 'reaction'].includes(g.id) && state.players.length < 2) {
 status = 'Waiting for your opponent to join';
	} else if (g.id === 'ttt') {
 status = g.status === 'playing' ? (g.turn === me() ? 'Your turn' : "Opponent's turn") : g.status === 'draw' ? 'Board is full' : g.winner === me() ? 'You connected three!' : 'Opponent connected three.';
 body = boardTtt(g);
	} else if (g.id === 'connect4') {
 status = g.status === 'playing' ? (g.turn === me() ? 'Your turn - choose a column' : "Opponent's turn") : g.status === 'draw' ? 'The board is full' : g.winner === me() ? 'Four in a row!' : 'Opponent connected four.';
 body = boardConnect(g);
	} else if (g.id === 'rps') {
 status = g.status === 'finished' ? 'Match complete' : g.revealed ? 'Round revealed - continue when ready' : g.picks[me()] ? 'Choice locked - waiting for opponent' : 'Choose your move';
 body = `
 <div class="score-strip">
 <div><small>${esc(state.players[0]?.username || 'P1')}</small><b>${g.wins[0]}</b></div>
 <span>ROUND ${g.round} / 3</span>
 <div><small>${esc(state.players[1]?.username || 'P2')}</small><b>${g.wins[1]}</b></div>
 </div>
 ${g.revealed ? `
 <div class="rps-reveal">
 <div>${g.picks[0] === 'rock' ? '' : g.picks[0] === 'paper' ? '' : ''}<small>${esc(state.players[0]?.username || 'P1')}</small></div>
 <strong>VS</strong>
 <div>${g.picks[1] === 'rock' ? '' : g.picks[1] === 'paper' ? '' : ''}<small>${esc(state.players[1]?.username || 'P2')}</small></div>
 </div>
 ${g.status === 'playing' ? '<button class="primary-button" data-action="next_round">Next round</button>' : ''}
 ` : `
 <div class="choice-row">
 ${[['rock','','Rock'],['paper','','Paper'],['scissors','','Scissors']].map(([v,e,n]) => `
 <button class="choice-button" data-action="pick" data-payload='{"choice":"${v}"}' ${state.players.length < 2 || g.picks[me()] ? 'disabled' : ''}>
 <span>${e}</span>${n}
 </button>
 `).join('')}
 </div>
 `}
 `;
	} else if (g.id === 'reaction') {
 status = g.phase === 'waiting' ? 'Waiting for game start' : g.phase === 'countdown' ? 'Wait for the green signal...' : g.phase === 'go' ? 'GO! TAP NOW!' : g.phase === 'false-start' ? 'False start!' : `Reaction time: ${g.reactionMs || ' - '} ms`;
 body = `
 <div class="reaction-zone ${g.phase === 'go' ? 'go' : ''}">
 <div class="reaction-symbol">${g.phase === 'go' ? '[!]' : g.phase === 'countdown' ? '' : g.phase === 'false-start' ? '' : '[!]'}</div>
 <h3>${g.phase === 'go' ? 'TAP!' : g.phase === 'countdown' ? 'WAIT...' : g.phase === 'false-start' ? 'Too early!' : g.phase === 'done' ? 'Finished' : 'Get ready'}</h3>
 <button class="primary-button reaction-button" data-action="tap" ${g.phase !== 'go' ? 'disabled' : ''}>${g.phase === 'go' ? 'TAP NOW' : 'WAIT FOR GO'}</button>
 </div>
 `;
	} else if (g.id === 'trivia' || g.id === 'daily') {
 const q = g.question;
 status = `Question ${g.index + 1} of 5 | ${g.answers.filter(Boolean).length}/${state.players.length} answered`;
 body = `
 <div class="score-strip">
 <div><small>${esc(state.players[0]?.username || 'P1')}</small><b>${g.scores[0]}</b></div>
 <span>${g.id === 'daily' ? 'DAILY CHALLENGE' : 'TRIVIA'}</span>
 <div><small>${esc(state.players[1]?.username || 'P2')}</small><b>${g.scores[1]}</b></div>
 </div>
 ${q ? `
 <div class="question-card">
 <small>${esc(q.cat || 'KINGSHOT')}</small>
 <h3>${esc(q.q)}</h3>
 <div class="answer-grid">
 ${q.options.map((o, i) => `
 <button class="answer-button" data-action="answer" data-payload='{"index":${i}}' ${g.myAnswer ? 'disabled' : ''}>
 ${String.fromCharCode(65 + i)}. ${esc(o)}
 </button>
 `).join('')}
 </div>
 ${g.myAnswer ? `<p class="answer-feedback">${g.myAnswer.correct ? '[OK] Correct | +10 points' : 'Not quite | keep going'}</p>` : ''}
 ${(state.players.length < 2 || g.answers.every(Boolean)) ? '<button class="primary-button" data-action="next_question">Next question -></button>' : ''}
 </div>
 ` : ''}
 `;
	} else if (g.id === 'guess') {
 status = `Possible range ${g.low}-${g.high} | ${g.myGuesses?.length || 0}/${g.maxGuesses} guesses`;
 body = `
 <div class="score-strip">
 <div><small>${esc(state.players[0]?.username || 'P1')}</small><b>${g.guesses[0].length}/${g.maxGuesses}</b></div>
 <span>FIND THE NUMBER</span>
 <div><small>${esc(state.players[1]?.username || 'P2')}</small><b>${g.guesses[1].length}/${g.maxGuesses}</b></div>
 </div>
 <div class="guess-card">
 <h3>Guess a number between ${g.low} and ${g.high}</h3>
 <form id="guess-form" class="inline-form">
 <input id="guess-value" type="number" min="${g.low}" max="${g.high}" placeholder="Your guess" required>
 <button class="primary-button" type="submit">Guess</button>
 </form>
 <div class="guess-history">
 ${g.guesses.map((arr, i) => `
 <div>
 <b>${esc(state.players[i]?.username || `P${i + 1}`)}</b>
 <span>${arr.map(n => g.answer === n ? '' : `${n} ${g.answer !== undefined ? (n < g.answer ? '' : '') : ' | '}`).join(' | ') || 'No guesses yet'}</span>
 </div>
 `).join('')}
 </div>
 </div>
 `;
	} else if (g.id === 'hangman') {
 const guessed = new Set(g.guessed || []);
 status = `${g.lives} lives remaining | ${(g.guessed || []).length} letters guessed`;
 const revealedLetters = g.revealed || Array.from({
 length: g.wordLength || 8
 }, () => '_');
 body = `
 <div class="hangman-card">
 <div class="hang-word">${revealedLetters.map(x => `<span>${esc(x)}</span>`).join('')}</div>
 <div class="letter-grid">
 ${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(l => `
 <button class="letter-button" data-action="letter" data-payload='{"letter":"${l}"}' ${guessed.has(l) || g.status !== 'playing' ? 'disabled' : ''}>${l}</button>
 `).join('')}
 </div>
 <button class="ghost-button" data-action="hint" ${g.lives <= 1 || g.status !== 'playing' ? 'disabled' : ''}>Reveal a letter | -1 life</button>
 </div>
 `;
	} else if (g.id === 'scramble') {
 status = `Word ${g.index + 1} of 5 | ${g.roundDone ? 'Round solved' : 'Race to solve it first'}`;
 body = `
 <div class="score-strip">
 <div><small>${esc(state.players[0]?.username || 'P1')}</small><b>${g.scores[0]}</b></div>
 <span>WORD SCRAMBLE</span>
 <div><small>${esc(state.players[1]?.username || 'P2')}</small><b>${g.scores[1]}</b></div>
 </div>
 <div class="scramble-card">
 <div class="scrambled">${esc(g.scrambled || '')}</div>
 <form id="scramble-form" class="inline-form">
 <input id="scramble-answer" type="text" maxlength="24" placeholder="Unscramble the word" required ${g.roundDone ? 'disabled' : ''}>
 <button class="primary-button" type="submit" ${g.roundDone ? 'disabled' : ''}>Submit</button>
 </form>
 ${g.roundDone ? `<p class="answer-feedback">${esc(state.players[g.roundWinner]?.username || 'Player')} solved it! +10 points</p><button class="primary-button" data-action="next_word">Next word -></button>` : ''}
 </div>
 `;
	}
	const gameHtml = `
 <section class="intro game-intro">
 <button class="back-button" id="back-menu"><- All games</button>
 <div class="eyebrow">KINGSHOT ARCADE</div>
 <h2>${info.icon} ${info.name}</h2>
 <p>${info.desc}</p>
 </section>
 <section class="match-card">
 ${playersPanel(g)}
 ${statusLine(status)}
 ${body}
 ${endControls(g)}
 <div class="game-footer">${state.players.length < 2 ? 'Invite a friend to this Activity to play together.' : 'Moves are validated by the game server.'}</div>
 </section>
 `;
	shell(gameHtml);
	app.querySelector('#guess-form')?.addEventListener('submit', e => {
 e.preventDefault();
 send({
 type: 'guess',
 value: Number(app.querySelector('#guess-value').value)
 });
	});
	app.querySelector('#scramble-form')?.addEventListener('submit', e => {
 e.preventDefault();
 send({
 type: 'solve',
 answer: app.querySelector('#scramble-answer').value
 });
	});
}

function render() {
	if (!state?.selectedGame || !state?.game) {
 renderMenu();
	} else {
 renderGame();
	}
}

function renderMenu() {
	const players = state?.players || [];
	const gameInfo = state?.gameInfo || {};
	const activeGames = players
 .filter((p) => p && p.isPlaying && p.currentGame)
 .map((p) => ({
 username: p.username || 'Player',
 game: (gameInfo[p.currentGame] && gameInfo[p.currentGame].name) || p.currentGame,
 }));
	shell(`
 <section class="intro">
 <div class="eyebrow">PXD ALLIANCE | THE ROYAL GAME HALL</div>
 <h2>Choose your <span>battle</span></h2>
 <p>Gather your allies, choose a game, and claim victory for PXD.</p>
 </section>
 <section class="match-card lobby">
 <div class="players">
 ${playerCard(players[0], 0, null)}
 <div class="versus">VS</div>
 ${playerCard(players[1], 1, null)}
 </div>
 <div class="lobby-note">${players.length < 2 ? 'Waiting for a second player - Share this Activity with a friend' : 'Both players are in. Choose any game below.'}</div>
 </section>
 ${activeGames.length > 0 ? `
 <section class="match-card" style="margin-top:18px;">
 <h3 style="margin:0 0 10px;color:#e0b65f;"> Players Currently Playing</h3>
 <div class="active-games">
 ${activeGames.map(p => `
 <div class="active-game-item">
 <span class="player-tag">${esc(p.username)}</span>
 <span>is playing</span>
 <strong>${esc(p.game)}</strong>
 </div>
 `).join('')}
 </div>
 </section>
 ` : ''}
 <section class="game-grid">
 ${GAMES.map(g => `
 <button class="game-tile" data-game="${g.id}">
 <span class="game-icon">${g.icon}</span>
 <span class="game-tag">${g.tag}</span>
 <strong>${g.name}</strong>
 <small>${g.desc}</small>
 <span class="tile-arrow">Play -></span>
 </button>
 `).join('')}
 </section>
 <section class="match-card" style="margin-top:18px;">
 <div class="action-row" style="flex-wrap:wrap;gap:8px;">
 <button class="primary-button" data-action="event:desk"> Event Desk</button>
 <button class="ghost-button" data-action="event:leaderboard"> Leaderboard</button>
 <button class="ghost-button" data-action="event:invite"> Invite</button>
 </div>
 </section>
 `);
	// Wire Event Desk button
	app.querySelector('[data-action="event:desk"]')?.addEventListener('click', () => {
 send({
 type: 'event',
 sub: 'desk'
 });
 renderEventDesk();
	});
	app.querySelector('[data-action="event:leaderboard"]')?.addEventListener('click', () => {
 send({
 type: 'event',
 sub: 'leaderboard'
 });
 showLeaderboard();
	});
	app.querySelector('[data-action="event:invite"]')?.addEventListener('click', () => {
 send({
 type: 'event',
 sub: 'invite'
 });
 showInvitePanel();
	});
}

function connectSocket() {
	const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
	socket = new WebSocket(`${protocol}//${location.host}/ws`);
	socket.addEventListener('open', () => {
 socket.send(JSON.stringify({
 type: 'auth',
 accessToken: session.accessToken,
 instanceId: session.instanceId
 }));
	});
	socket.addEventListener('message', e => {
 let m;
 try {
 m = JSON.parse(e.data);
 } catch {
 return;
 }
 if (m.type === 'error') {
 errorText = m.message || 'Game server error';
 render();
 }
 if (m.type === 'ready') {
 connected = true;
 errorText = '';
 render();
 }
 if (m.type === 'state') {
 connected = true;
 errorText = '';
 state = m.state;
 render();
 }
	});
	socket.addEventListener('close', () => {
 connected = false;
 render();
	});
	socket.addEventListener('error', () => {
 errorText = 'Could not connect to the game server.';
 render();
	});
}
async function boot() {
	shell(`
 <section class="intro">
 <div class="eyebrow">PXD ALLIANCE | KINGDOM ARCADE</div>
 <h2>Opening the <span>Royal Game Hall</span>...</h2>
 <p>Connecting to Discord Activity.</p>
 </section>
 `);
	try {
 session = await connectDiscord();
 connectSocket();
	} catch (e) {
 errorText = e?.message || 'Could not start Activity.';
 shell(`
 <section class="intro">
 <h2>Unable to connect</h2>
 <p>${esc(errorText)}</p>
 </section>
 `);
	}
}
window.addEventListener('beforeunload', () => socket?.close());
boot();
