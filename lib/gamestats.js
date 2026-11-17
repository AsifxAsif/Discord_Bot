/**
 * Persistent game stats: points, W/L/D, streaks, daily-challenge progress.
 */
const fs = require('fs');
const path = require('path');

const dataDir = process.env.DATADIR || path.join(__dirname, '..', 'data');
const file = path.join(dataDir, 'game_stats.json');

function load() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(file)) return { users: {} };
  try {
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    d.users = d.users || {};
    return d;
  } catch {
    return { users: {} };
  }
}
function save(data) {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function user(data, id) {
  const k = String(id);
  if (!data.users[k]) {
    data.users[k] = {
      points: 0, played: 0, wins: 0, losses: 0, draws: 0, streak: 0, bestStreak: 0,
      games: {},
      daily: { streak: 0, best: 0, lastSolved: null, progress: null, result: null },
    };
  }
  return data.users[k];
}

/** result: 'win' | 'loss' | 'draw' */
function record(userId, game, result, points = 0) {
  const data = load();
  const u = user(data, userId);
  u.played++;
  u.points += points;
  if (result === 'win') {
    u.wins++;
    u.streak++;
    u.bestStreak = Math.max(u.bestStreak, u.streak);
  } else if (result === 'loss') {
    u.losses++;
    u.streak = 0;
  } else u.draws++;
  const g = (u.games[game] = u.games[game] || { played: 0, wins: 0 });
  g.played++;
  if (result === 'win') g.wins++;
  save(data);
}

function addPoints(userId, points) {
  if (!points) return;
  const data = load();
  user(data, userId).points += points;
  save(data);
}

function getStats(userId) {
  return user(load(), userId);
}

function leaderboard(limit = 10) {
  const data = load();
  return Object.entries(data.users)
    .map(([id, u]) => ({ id, ...u }))
    .filter((u) => u.points > 0 || u.played > 0)
    .sort((a, b) => b.points - a.points || b.wins - a.wins)
    .slice(0, limit);
}

/* ----- daily challenge ----- */
const todayStr = () => new Date().toISOString().slice(0, 10);

function getDaily(userId) {
  return user(load(), userId).daily;
}

function saveDailyProgress(userId, date, guesses) {
  const data = load();
  user(data, userId).daily.progress = { date, guesses };
  save(data);
}

function finishDaily(userId, date, { solved, tries, points }) {
  const data = load();
  const u = user(data, userId);
  const d = u.daily;
  const yesterday = new Date(new Date(`${date}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
  if (solved) {
    d.streak = d.lastSolved === yesterday ? d.streak + 1 : 1;
    d.best = Math.max(d.best, d.streak);
    d.lastSolved = date;
  } else {
    d.streak = 0;
  }
  d.result = { date, solved, tries };
  d.progress = null;
  u.points += points || 0;
  u.played++;
  if (solved) {
    u.wins++;
  } else u.losses++;
  save(data);
  return d;
}

/* ----- "already seen" tracking (no repeats until the pool is used up) ----- */
function getSeen(userId, kind) {
  const u = user(load(), userId);
  return (u.seen && u.seen[kind]) || [];
}
function markSeen(userId, kind, ids) {
  const data = load();
  const u = user(data, userId);
  u.seen = u.seen || {};
  const set = new Set(u.seen[kind] || []);
  ids.forEach((id) => set.add(id));
  u.seen[kind] = [...set].slice(-2000);
  save(data);
}
function forgetSeen(userId, kind, idSet) {
  const data = load();
  const u = user(data, userId);
  u.seen = u.seen || {};
  u.seen[kind] = (u.seen[kind] || []).filter((id) => !idSet.has(id));
  save(data);
}

module.exports = { getSeen, markSeen, forgetSeen, record, addPoints, getStats, leaderboard, getDaily, saveDailyProgress, finishDaily, todayStr };
