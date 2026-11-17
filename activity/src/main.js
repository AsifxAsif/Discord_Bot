
import { connectDiscord } from './discord.js';
import './style.css';
const app=document.querySelector('#app');
let socket=null,user=null,state=null,connected=false,error='';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const send=o=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(o));};
const me=()=>state?.players?.findIndex(p=>p.id===user?.id)??-1;
const game=()=>state?.game;
const names={ttt:'Tic-Tac-Toe',c4:'Connect Four',rps:'Rock Paper Scissors',react:'Reaction Duel',trivia:'Kingshot Trivia',guess:'Guess the Number',hang:'Hangman',scr:'Word Scramble',daily:'Daily Challenge'};
function status(g){if(!g)return state?.notice||'Choose a game';if(g.status!=='playing'){if(g.status==='draw')return 'It’s a draw!';return `${state.players[g.winner]?.username||'A player'} wins!`;}if(g.key==='rps')return 'Both players choose simultaneously';if(g.key==='trivia')return 'Both players answer each question';return g.turn===me()?'Your turn':'Waiting for your opponent';}
function playersMarkup(){return (state?.players||[]).map((p,i)=>`<div class="player"><div class="avatar">${esc(p.username?.[0]?.toUpperCase()||'?')}</div><div><b>${esc(p.username)}</b><small>Player ${i+1}</small></div><span class="mark">${i===0?'P1':'P2'}</span></div>`).join('');}
function menuMarkup(){const list=state?.gameList||[];return `<div class="library"><div class="section-head"><div><small>THE ARCADE</small><h2>Choose your game</h2></div><span class="count">${list.length} GAMES</span></div><h3>⚔️ Head-to-head</h3><div class="game-grid">${list.filter(x=>x.category==='duel').map(card).join('')}</div><h3>🎮 Party & solo modes</h3><div class="game-grid">${list.filter(x=>x.category==='party').map(card).join('')}</div></div>`;}
function card(g){return `<button class="game-card" data-select="${g.key}"><span class="game-icon">${g.icon}</span><strong>${esc(g.name)}</strong><small>${esc(g.description)}</small><span class="play-label">PLAY NOW ↗</span></button>`;}
function boardMarkup(g){
 const turn=g.turn===me()&&g.status==='playing';
 if(g.key==='ttt')return `<div class="ttt-board">${g.board.map((x,i)=>`<button class="ttt-cell ${x||''}" data-move="${i}" ${!turn||x?'disabled':''}>${x==='X'?'×':x==='O'?'○':''}</button>`).join('')}</div>`;
 if(g.key==='c4')return `<div class="c4-board">${g.board.map((row,r)=>row.map((x,c)=>`<button class="disc ${x||''}" data-drop="${c}" ${!turn||g.board[0][c]?'disabled':''}>${x==='R'?'●':x==='Y'?'●':''}</button>`).join('')).join('')}</div><div class="column-labels">1　 2　 3　 4　 5　 6　 7</div>`;
 if(g.key==='rps')return `<div class="choice-row">${[['rock','🪨','Rock'],['paper','📄','Paper'],['scissors','✂️','Scissors']].map(([k,e,n])=>`<button class="choice" data-pick="${k}" ${g.picks[me()]?'disabled':''}><span>${e}</span>${n}</button>`).join('')}</div><p class="muted">Your pick: ${g.picks[me()]?'🔒 Locked in':'Not chosen yet'} · Opponent: ${g.picks[1-me()]?'🔒 Locked in':'Choosing'}</p><div class="scoreline">${g.score[0]} <small>ROUND ${g.round}</small> ${g.score[1]}</div>`;
 if(g.key==='react')return `<div class="scoreline">${g.score[0]} <small>ROUND ${g.round}/3</small> ${g.score[1]}</div><div class="reaction-zone ${Date.now()>=g.deadline?'go':''}"><button id="react" class="react-button">${Date.now()>=g.deadline?'CLICK NOW!':'WAIT FOR GREEN'}</button></div><p class="muted">Clicking early loses the round.</p>`;
 if(g.key==='trivia'){const q=g.questions[g.qi];return `<div class="question"><small>${esc(q.cat||'KINGSHOT KNOWLEDGE')} · QUESTION ${g.qi+1}/${g.questions.length}</small><h2>${esc(q.q)}</h2><div class="answer-grid">${q.opts.map((x,i)=>`<button data-answer="${i}" ${g.answers[me()]!=null?'disabled':''}><b>${'ABCD'[i]}</b>${esc(x)}</button>`).join('')}</div><p class="muted">Your answer: ${g.answers[me()]!=null?'Locked in':'Choose one'} · Opponent: ${g.answers[1-me()]!=null?'Locked in':'Choosing'}</p><div class="scoreline">${g.score[0]} <small>SCORE</small> ${g.score[1]}</div></div>`;}
 if(g.key==='guess'||g.key==='daily')return `<div class="puzzle"><small>NUMBER RANGE</small><div class="range">${g.lo} <span>—</span> ${g.hi}</div><p>Attempts: ${g.tries}/${g.maxTries}</p><form id="guess-form"><input name="guess" type="number" min="${g.lo}" max="${g.hi}" placeholder="Enter your guess" required ${!turn?'disabled':''}><button class="primary" ${!turn?'disabled':''}>GUESS</button></form><div class="history">${(g.log||[]).map(esc).join('<br>')}</div></div>`;
 if(g.key==='hang'){const word=g.word.split('').map(c=>g.guessed.includes(c)?c:'_').join(' ');return `<div class="puzzle"><div class="word">${word}</div><p>❤️ ${g.lives} lives left</p><div class="letters">${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(l=>`<button data-letter="${l}" ${!turn||g.guessed.includes(l)?'disabled':''}>${l}</button>`).join('')}</div></div>`;}
 if(g.key==='scr')return `<div class="puzzle"><small>UNSCRAMBLE THIS WORD</small><div class="scramble">${g.scramble.split('').map(c=>`<span>${c}</span>`).join('')}</div><form id="solve-form"><input name="answer" placeholder="Your answer" required ${!turn?'disabled':''}><button class="primary" ${!turn?'disabled':''}>SUBMIT</button></form><p>Attempts: ${g.attempts}/8</p></div>`;
 return '';
}
function render(){
 if(!state){app.innerHTML=`<div class="loading"><div class="brand-icon">⚔</div><h1>Kingshot Arcade</h1><p>${esc(error||'Connecting to Discord…')}</p></div>`;return;}
 const g=game(),my=me();
 app.innerHTML=`<header class="topbar"><div class="brand"><div class="brand-icon">⚔</div><div><small>KINGSHOT COMMUNITY</small><h1>Kingshot <span>Arcade</span></h1></div></div><div class="connection ${connected?'online':''}"><i></i>${connected?'CONNECTED':'CONNECTING'}</div></header><main><section class="hero"><small>THE KINGDOM’S GAME ROOM</small><h1>Play. Compete. <em>Conquer.</em></h1><p>Challenge your alliance and climb the arcade.</p></section>${error?`<div class="error">${esc(error)}</div>`:''}<section class="players">${playersMarkup()}<div class="room-info"><b>${state.players.length}/2</b><small>PLAYERS IN ROOM</small></div></section>${g?`<section class="match"><div class="match-head"><div><small>NOW PLAYING</small><h2>${esc(names[g.key])}</h2></div><button class="back" id="back">← ALL GAMES</button></div><div class="status">${esc(status(g))}</div>${g.status==='playing'?boardMarkup(g):`<div class="result"><div class="trophy">🏆</div><h2>${esc(status(g))}</h2><p>${esc(g.notice||'Round complete')}</p><button class="primary" id="rematch">PLAY AGAIN</button></div>`}<div class="match-foot">${esc(g.notice||'Make your move.')}</div></section>`:menuMarkup()}<footer>PLAY TOGETHER · WIN TOGETHER <span>•</span> KINGSHOT ARCADE</footer></main>`;
 app.querySelectorAll('[data-select]').forEach(b=>b.onclick=()=>send({type:'select',key:b.dataset.select}));
 app.querySelector('#back')?.addEventListener('click',()=>send({type:'menu'}));
 app.querySelector('#rematch')?.addEventListener('click',()=>send({type:'rematch'}));
 app.querySelectorAll('[data-move]').forEach(b=>b.onclick=()=>send({type:'move',index:+b.dataset.move}));
 app.querySelectorAll('[data-drop]').forEach(b=>b.onclick=()=>send({type:'drop',col:+b.dataset.drop}));
 app.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>send({type:'pick',pick:b.dataset.pick}));
 app.querySelectorAll('[data-answer]').forEach(b=>b.onclick=()=>send({type:'answer',answer:+b.dataset.answer}));
 app.querySelectorAll('[data-letter]').forEach(b=>b.onclick=()=>send({type:'letter',letter:b.dataset.letter}));
 app.querySelector('#react')?.addEventListener('click',()=>send({type:'react'}));
 app.querySelector('#guess-form')?.addEventListener('submit',e=>{e.preventDefault();send({type:'guess',value:e.target.guess.value});});
 app.querySelector('#solve-form')?.addEventListener('submit',e=>{e.preventDefault();send({type:'solve',value:e.target.answer.value});});
 if(g?.key==='react'&&g.status==='playing'&&Date.now()<g.deadline)setTimeout(()=>{if(game()?.key==='react'&&game()?.status==='playing')render();},Math.max(0,g.deadline-Date.now()+20));
}
function connect(session){const proto=location.protocol==='https:'?'wss:':'ws:';socket=new WebSocket(`${proto}//${location.host}/ws`);socket.onopen=()=>socket.send(JSON.stringify({type:'auth',accessToken:session.accessToken,instanceId:session.instanceId}));socket.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch{return;}if(m.type==='error'){error=m.message;render();}if(m.type==='ready')connected=true;if(m.type==='state'){state=m.game;error='';connected=true;}render();};socket.onclose=()=>{connected=false;error='Disconnected from game server.';render();};}
async function boot(){render();try{const s=await connectDiscord();user=s.user;connect(s);}catch(e){error=e.message||'Could not start Activity.';render();}}
window.addEventListener('beforeunload',()=>socket?.close());boot();
