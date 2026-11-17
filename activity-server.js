
const fs = require('fs');
const path = require('path');
const { WebSocket, WebSocketServer } = require('ws');
const gameData = require('./games/data');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'activity', 'dist');
const rooms = new Map();
const MAX_ROOM_PLAYERS = 2;
const MAX_MESSAGE_BYTES = 2048;
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon'};
const GAME_LIST = [
  {key:'ttt',name:'Tic-Tac-Toe',category:'duel',description:'Connect three symbols in a row.',icon:'⭕'},
  {key:'c4',name:'Connect Four',category:'duel',description:'Connect four discs in any direction.',icon:'🔴'},
  {key:'rps',name:'Rock Paper Scissors',category:'duel',description:'First to two round wins.',icon:'✊'},
  {key:'react',name:'Reaction Duel',category:'duel',description:'Click only when the signal turns green.',icon:'⚡'},
  {key:'trivia',name:'Kingshot Trivia',category:'party',description:'Answer five Kingshot questions.',icon:'🧠'},
  {key:'guess',name:'Guess the Number',category:'party',description:'Narrow the secret number range.',icon:'🎯'},
  {key:'hang',name:'Hangman',category:'party',description:'Reveal the hidden Kingshot word.',icon:'🪝'},
  {key:'scr',name:'Word Scramble',category:'party',description:'Unscramble a Kingshot term.',icon:'🔤'},
  {key:'daily',name:'Daily Challenge',category:'party',description:'Solve today’s shared number puzzle.',icon:'📅'},
];
const send=(ws,data)=>{if(ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(data));};
const safeUser=p=>({id:p.id,username:p.username,avatar:p.avatar});
function publicGame(r){
 const g=r.game?JSON.parse(JSON.stringify(r.game)):null;
 if(g&&g.status==='playing'){
  delete g.secret;
  if(g.key==='hang'||g.key==='scr')delete g.word;
  if(g.key==='trivia')g.questions=g.questions.map(q=>{const {correct,...safe}=q;return safe;});
 }
 return {players:r.players.map(safeUser),selected:r.selected,game:g,notice:r.notice,gameList:GAME_LIST};
}
function broadcast(r){const msg={type:'state',game:publicGame(r)};r.players.forEach(p=>send(p.ws,msg));}
function makeRoom(instanceId){return {instanceId,players:[],selected:null,game:null,notice:'Choose a game to get started.',createdAt:Date.now()};}
async function getDiscordUser(token){const r=await fetch('https://discord.com/api/users/@me',{headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw Error('Discord authentication failed. Relaunch the Activity.');return r.json();}
async function verifyActivityParticipant(instanceId,userId){
 const id=process.env.CLIENTID,token=process.env.DISCORDTOKEN;if(!id||!token)throw Error('Missing CLIENTID or DISCORDTOKEN.');
 const r=await fetch(`https://discord.com/api/v10/applications/${encodeURIComponent(id)}/activity-instances/${encodeURIComponent(instanceId)}`,{headers:{Authorization:`Bot ${token}`}});
 if(!r.ok)throw Error('Discord could not verify this Activity session.');
 const a=await r.json();if(a.application_id!==id||a.instance_id!==instanceId||!Array.isArray(a.users)||!a.users.includes(userId))throw Error('Your account is not an active participant in this Activity.');
}
async function exchangeCode(code){
 const id=process.env.CLIENTID,secret=process.env.DISCORD_CLIENT_SECRET;if(!id||!secret)throw Error('Missing CLIENTID or DISCORD_CLIENT_SECRET.');
 const body=new URLSearchParams({client_id:id,client_secret:secret,grant_type:'authorization_code',code});
 const r=await fetch('https://discord.com/api/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
 const d=await r.json().catch(()=>({}));if(!r.ok||!d.access_token)throw Error(d.error_description||d.error||'OAuth exchange failed.');return d;
}
const shuffle=a=>[...a].sort(()=>Math.random()-.5);
const rand=(min,max)=>Math.floor(Math.random()*(max-min+1))+min;
function newGame(key){
 const g={key,status:'playing',turn:0,round:1,score:[0,0],log:[],notice:'Game started.'};
 if(key==='ttt')g.board=Array(9).fill(null);
 if(key==='c4')g.board=Array.from({length:6},()=>Array(7).fill(null));
 if(key==='rps'){g.picks=[null,null];g.target=2;}
 if(key==='react'){g.stage='wait';g.goAt=0;g.deadline=Date.now()+rand(1800,4500);}
 if(key==='trivia'){g.questions=shuffle(gameData.TRIVIA).slice(0,5).map(q=>{const opts=shuffle([q.a,...q.w]);return {q:q.q,cat:q.cat,opts,correct:opts.indexOf(q.a)};});g.qi=0;g.answers=[null,null];}
 if(key==='guess'||key==='daily'){g.secret=key==='daily'?((new Date().toISOString().slice(0,10).split('-').join('').split('').reduce((a,c)=>a*31+Number(c),7)%100)+1):rand(1,100);g.lo=1;g.hi=100;g.tries=0;g.maxTries=key==='daily'?6:8;}
 if(key==='hang'){g.word=shuffle(gameData.WORDS)[0];g.guessed=[];g.lives=6;}
 if(key==='scr'){g.word=shuffle(gameData.WORDS)[0];g.scramble=shuffle(g.word.split('')).join('');g.attempts=0;}
 return g;
}
function endCheckTtt(g){const lines=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];const line=lines.find(([a,b,c])=>g.board[a]&&g.board[a]===g.board[b]&&g.board[a]===g.board[c]);if(line){g.status='won';g.winner=g.turn;g.winningLine=line;}else if(g.board.every(Boolean))g.status='draw';else g.turn=1-g.turn;}
function c4Drop(g,col){for(let row=5;row>=0;row--)if(!g.board[row][col]){g.board[row][col]=g.turn===0?'R':'Y';return [row,col];}return null;}
function c4Win(g,r,c){const p=g.board[r][c];for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]){let cells=[[r,c]];for(const sign of [1,-1]){let y=r+dr*sign,x=c+dc*sign;while(y>=0&&y<6&&x>=0&&x<7&&g.board[y][x]===p){cells.push([y,x]);y+=dr*sign;x+=dc*sign;}}if(cells.length>=4)return cells;}return null;}
function action(room,player,m){
 const g=room.game;if(!g)return;
 const i=room.players.findIndex(p=>p.id===player.id);if(i<0)return;
 if(m.type==='select'){if(!GAME_LIST.some(x=>x.key===m.key))return;room.selected=m.key;room.game=newGame(m.key);room.notice=`${GAME_LIST.find(x=>x.key===m.key).name} started.`;broadcast(room);return;}
 if(m.type==='menu'){room.selected=null;room.game=null;room.notice='Choose a game to get started.';broadcast(room);return;}
 if(m.type==='rematch'){if(g.status==='playing')return;room.game=newGame(g.key);room.notice='New round started.';broadcast(room);return;}
 if(g.status!=='playing')return;
 if(!['rps','trivia'].includes(g.key)&&i!==g.turn)return;
 if(g.key==='ttt'&&m.type==='move'){const n=Number(m.index);if(!Number.isInteger(n)||n<0||n>8||g.board[n])return;g.board[n]=g.turn===0?'X':'O';endCheckTtt(g);}
 else if(g.key==='c4'&&m.type==='drop'){const c=Number(m.col);if(!Number.isInteger(c)||c<0||c>6)return;const pos=c4Drop(g,c);if(!pos)return;const line=c4Win(g,...pos);if(line){g.status='won';g.winner=g.turn;g.winningLine=line;}else if(g.board[0].every(Boolean))g.status='draw';else g.turn=1-g.turn;}
 else if(g.key==='rps'&&m.type==='pick'){if(!['rock','paper','scissors'].includes(m.pick)||g.picks[i])return;g.picks[i]=m.pick;if(g.picks.every(Boolean)){const [a,b]=g.picks;if(a!==b){const wins={rock:'scissors',paper:'rock',scissors:'paper'};g.score[wins[a]===b?0:1]++;}g.log.push(`${a} vs ${b}`);if(g.score.some(x=>x>=2)){g.status='won';g.winner=g.score[0]>g.score[1]?0:1;}else{g.round++;g.picks=[null,null];g.turn=0;}}}
 else if(g.key==='react'&&m.type==='react'){const early=Date.now()<g.deadline;if(early){g.score[1-i]++;g.notice='False start! Your opponent takes the round.';}else{g.score[i]++;g.notice=`${player.username} wins the round!`;}if(g.score.some(x=>x>=2)||g.round>=3){g.status=g.score[0]===g.score[1]?'draw':'won';g.winner=g.score[0]===g.score[1]?null:g.score[0]>g.score[1]?0:1;}else{g.round++;g.deadline=Date.now()+rand(1800,4500);}}
 else if(g.key==='trivia'&&m.type==='answer'){const q=g.questions[g.qi],n=Number(m.answer);if(!Number.isInteger(n)||n<0||n>3||g.answers[i]!=null)return;g.answers[i]=n;if(g.answers.every(x=>x!=null)){for(let k=0;k<2;k++)if(g.answers[k]===q.correct)g.score[k]++;g.log.push({q:q.q,correct:q.opts[q.correct],answers:[...g.answers]});g.qi++;if(g.qi>=g.questions.length){g.status=g.score[0]===g.score[1]?'draw':'won';g.winner=g.score[0]===g.score[1]?null:g.score[0]>g.score[1]?0:1;}else{g.answers=[null,null];g.turn=0;}}}
 else if((g.key==='guess'||g.key==='daily')&&m.type==='guess'){const n=Number(m.value);if(!Number.isInteger(n)||n<g.lo||n>g.hi)return;g.tries++;if(n===g.secret){g.status='won';g.winner=i;g.notice=`${player.username} found the number in ${g.tries} tries.`;}else{if(n<g.secret)g.lo=n+1;else g.hi=n-1;g.log.push(`${player.username}: ${n} — ${n<g.secret?'higher':'lower'}`);if(g.tries>=g.maxTries){g.status='draw';g.notice=`The number was ${g.secret}.`;}else g.turn=1-g.turn;}}
 else if(g.key==='hang'&&m.type==='letter'){const l=String(m.letter||'').toUpperCase();if(!/^[A-Z]$/.test(l)||g.guessed.includes(l))return;g.guessed.push(l);if(!g.word.includes(l))g.lives--;if(g.word.split('').every(x=>g.guessed.includes(x))){g.status='won';g.winner=i;}else if(g.lives<=0){g.status='draw';g.notice=`The word was ${g.word}.`;}else g.turn=1-g.turn;}
 else if(g.key==='scr'&&m.type==='solve'){const value=String(m.value||'').trim().toUpperCase();g.attempts++;if(value===g.word){g.status='won';g.winner=i;}else if(g.attempts>=8){g.status='draw';g.notice=`The word was ${g.word}.`;}else g.turn=1-g.turn;}
 if(g.status==='won'&&g.winner!=null)g.notice=`${room.players[g.winner]?.username||'Player'} wins!`;
 broadcast(room);
}
function contentType(file){return MIME[path.extname(file).toLowerCase()]||'application/octet-stream';}
function serveStatic(req,res){if(!fs.existsSync(path.join(DIST,'index.html'))){res.writeHead(503,{'Content-Type':'text/plain'});res.end('Build Activity first: npm run build');return;}let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end('Bad request');return;}const rel=pathname==='/'?'index.html':pathname.replace(/^\/+/,'');let file=path.resolve(DIST,rel);if(!file.startsWith(`${path.resolve(DIST)}${path.sep}`)&&file!==path.join(DIST,'index.html')){res.writeHead(403);res.end('Forbidden');return;}if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(DIST,'index.html');res.writeHead(200,{'Content-Type':contentType(file),'Cache-Control':file.endsWith('index.html')?'no-cache':'public,max-age=3600'});fs.createReadStream(file).pipe(res);}
function attachActivityServer(server){
 const wss=new WebSocketServer({noServer:true,maxPayload:MAX_MESSAGE_BYTES});
 server.on('request',async(req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/health'){res.writeHead(200);res.end('OK');return;}if(url.pathname==='/api/activity/token'&&req.method==='POST'){let raw='';req.on('data',c=>{raw+=c;if(raw.length>10000)req.destroy();});req.on('end',async()=>{try{const p=JSON.parse(raw||'{}');if(typeof p.code!=='string'||p.code.length>4096)throw Error('Invalid authorization code.');const t=await exchangeCode(p.code);res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({access_token:t.access_token}));}catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}});return;}if(req.method==='GET')return serveStatic(req,res);res.writeHead(404);res.end('Not found');});
 server.on('upgrade',(req,socket,head)=>{if(new URL(req.url,'http://localhost').pathname!=='/ws'){socket.destroy();return;}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));});
 wss.on('connection',ws=>{ws.on('message',async raw=>{let m;try{m=JSON.parse(raw.toString());}catch{return send(ws,{type:'error',message:'Invalid message.'});}
  if(!ws.player){if(m.type!=='auth'||typeof m.accessToken!=='string'||typeof m.instanceId!=='string')return ws.close(1008,'Authentication required');try{const u=await getDiscordUser(m.accessToken);await verifyActivityParticipant(m.instanceId,u.id);let room=rooms.get(m.instanceId);if(!room){room=makeRoom(m.instanceId);rooms.set(m.instanceId,room);}let p=room.players.find(x=>x.id===u.id);if(!p){if(room.players.length>=MAX_ROOM_PLAYERS){send(ws,{type:'error',message:'This Activity supports two players per room.'});return ws.close(1008,'Room full');}p={id:u.id,username:u.global_name||u.username,avatar:u.avatar,ws};room.players.push(p);}else{p.ws?.close(4001,'Reconnected');p.ws=ws;}ws.player=p;ws.room=room;send(ws,{type:'ready'});broadcast(room);}catch(e){send(ws,{type:'error',message:e.message});ws.close(1008,'Auth failed');}return;}
  const room=ws.room;if(!room||ws.player.ws!==ws)return;action(room,ws.player,m);
 });
 ws.on('close',()=>{const r=ws.room;if(!r||!ws.player)return;if(ws.player.ws===ws)ws.player.ws=null;if(r.players.every(p=>!p.ws))r.disconnectAt=Date.now();});});
 const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(ws.readyState!==WebSocket.OPEN)continue;ws.ping();}const now=Date.now();for(const[id,r]of rooms)if((r.disconnectAt&&now-r.disconnectAt>600000)||now-r.createdAt>43200000)rooms.delete(id);},30000);heartbeat.unref();return{wss,rooms};
}
module.exports={attachActivityServer};
