const fs = require('fs');
const path = require('path');
// Use a project-local data folder by default.
// On Windows, ignore Unix-style DATADIR values such as /tmp/kingshot-bot.
const configuredDataDir = process.env.DATADIR;
const dataDir = configuredDataDir && !(process.platform === 'win32' && configuredDataDir.startsWith('/')) ? path.resolve(configuredDataDir) : path.join(__dirname, '..', 'data');
const membersPath = path.join(dataDir, 'members.json');
const historyPath = path.join(dataDir, 'history.json');
const seenPath = path.join(dataDir, 'seen_codes.json');
const autoPath = path.join(dataDir, 'auto_state.json');
const blacklistPath = path.join(dataDir, 'blacklist.json');
const lastResultsPath = path.join(dataDir, 'last_results.json');
const backupsDir = path.join(dataDir, 'backups');

function ensure() {
	if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, {
 recursive: true
	});
	if (!fs.existsSync(membersPath)) {
 fs.writeFileSync(membersPath, JSON.stringify({
 members: [],
 syncedAt: null
 }, null, 2));
	}
	if (!fs.existsSync(historyPath)) {
 fs.writeFileSync(historyPath, JSON.stringify({
 runs: []
 }, null, 2));
	}
	if (!fs.existsSync(seenPath)) {
 fs.writeFileSync(seenPath, JSON.stringify({
 codes: {}
 }, null, 2));
	}
	if (!fs.existsSync(autoPath)) {
 fs.writeFileSync(autoPath, JSON.stringify({
 enabled: false,
 lastScanAt: null,
 lastRedeemAt: null,
 extraDelayMs: 0,
 lastBackupAt: null,
 }, null, 2));
	}
	if (!fs.existsSync(blacklistPath)) {
 fs.writeFileSync(blacklistPath, JSON.stringify({
 codes: []
 }, null, 2));
	}
	if (!fs.existsSync(lastResultsPath)) {
 fs.writeFileSync(lastResultsPath, JSON.stringify({
 byCode: {}
 }, null, 2));
	}
	if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, {
 recursive: true
	});
}

function loadMembers() {
	ensure();
	return JSON.parse(fs.readFileSync(membersPath, 'utf8'));
}

function saveMembers(data) {
	ensure();
	fs.writeFileSync(membersPath, JSON.stringify(data, null, 2));
}

function loadHistory() {
	ensure();
	return JSON.parse(fs.readFileSync(historyPath, 'utf8'));
}

function pushHistory(entry) {
	const h = loadHistory();
	h.runs.unshift(entry);
	h.runs = h.runs.slice(0, 50);
	fs.writeFileSync(historyPath, JSON.stringify(h, null, 2));
}

function loadSeen() {
	ensure();
	return JSON.parse(fs.readFileSync(seenPath, 'utf8'));
}

function saveSeen(seen) {
	ensure();
	fs.writeFileSync(seenPath, JSON.stringify(seen, null, 2));
}
/** Legacy: whole-code done (old data). Prefer per-fid. */
function isCodeDone(code) {
	const entry = loadSeen().codes?.[code];
	if (!entry) return false;
	if (entry.fids && typeof entry.fids === 'object') {
 return false;
	}
	return true;
}

function getCodeFidStatus(code, fid) {
	const entry = loadSeen().codes?.[code];
	if (!entry?.fids) return null;
	return entry.fids[String(fid)] || null;
}
/**
 * Members who still need this code:
 * - not success / already
 * - rate_limit / error / missing -> include
 */
function getPendingMembers(code, allMembers) {
	const entry = loadSeen().codes?.[code];
	if (!entry) return allMembers;
	const fids = entry.fids && typeof entry.fids === 'object' ? entry.fids : null;
	// Legacy record: code was processed but no per-player map was saved.
	// Do NOT re-redeem the whole roster (avoids spam after restart).
	// New members after this will need a one-time /redeem run or a later cycle
	// once fids exist - prefer migrating by treating legacy as complete.
	if (!fids || Object.keys(fids).length === 0) {
 if (entry.summary || entry.lastSummary || entry.source || entry.at) {
 console.log(`[seen] ${code}: legacy complete record (no fids) - skip full re-run`);
 return [];
 }
 return allMembers;
	}
	// Per-player: new players + rate-limited only.
	// Do not auto-retry hard errors every cycle (avoids channel spam).
	return allMembers.filter((m) => {
 const st = fids[String(m.fid)];
 if (st === 'success' || st === 'already' || st === 'invalid' || st === 'expired') return false;
 if (st === 'error') return false;
 return true;
	});
}

function countFidStatuses(code) {
	const entry = loadSeen().codes?.[code];
	const fids = entry?.fids || {};
	const counts = {
 success: 0,
 already: 0,
 rate_limit: 0,
 error: 0,
 expired: 0,
 invalid: 0,
 other: 0
	};
	for (const st of Object.values(fids)) {
 if (counts[st] != null) counts[st]++;
 else counts.other++;
	}
	return {
 total: Object.keys(fids).length,
 ...counts
	};
}
/** Merge redeem results into per-fid map for this code. */
function recordFidResults(code, results, meta = {}) {
	const seen = loadSeen();
	const prev = seen.codes[code] || {};
	const fids = {
 ...(prev.fids || {})
	};
	for (const r of results) {
 if (r.fid == null) continue;
 fids[String(r.fid)] = r.status || 'error';
	}
	const rateLimitCount = results.filter((r) => r.status === 'rate_limit').length;
	const total = results.length || 1;
	const highRateLimit = rateLimitCount / total > 0.2;
	seen.codes[code] = {
 ...prev,
 ...meta,
 at: new Date().toISOString(),
 fids,
 lastSummary: results.reduce((acc, r) => {
 acc[r.status] = (acc[r.status] || 0) + 1;
 return acc;
 }, {}),
 // Keep processing next cycles if many rate limits or incomplete
 complete: !highRateLimit && results.every((r) => r.status === 'success' || r.status === 'already' || r.status === 'invalid' || r.status === 'expired'),
	};
	saveSeen(seen);
	return seen.codes[code];
}
/** @deprecated prefer recordFidResults - kept for compatibility */
function markCodeDone(code, meta = {}) {
	const seen = loadSeen();
	const prev = seen.codes[code] || {};
	seen.codes[code] = {
 ...prev,
 at: new Date().toISOString(),
 ...meta,
	};
	saveSeen(seen);
}

function loadAutoState() {
	ensure();
	return JSON.parse(fs.readFileSync(autoPath, 'utf8'));
}

function saveAutoState(state) {
	ensure();
	fs.writeFileSync(autoPath, JSON.stringify(state, null, 2));
}

function loadBlacklist() {
	ensure();
	const data = JSON.parse(fs.readFileSync(blacklistPath, 'utf8'));
	return Array.isArray(data.codes) ? data.codes.map(String) : [];
}

function saveBlacklist(codes) {
	ensure();
	const unique = [...new Set(codes.map((c) => String(c).trim()).filter(Boolean))];
	fs.writeFileSync(blacklistPath, JSON.stringify({
 codes: unique
	}, null, 2));
	return unique;
}

function isBlacklisted(code) {
	return loadBlacklist().includes(String(code).trim());
}

function addBlacklist(code) {
	const list = loadBlacklist();
	const c = String(code).trim();
	if (!list.includes(c)) list.push(c);
	return saveBlacklist(list);
}

function removeBlacklist(code) {
	const c = String(code).trim();
	return saveBlacklist(loadBlacklist().filter((x) => x !== c));
}

function loadLastResults() {
	ensure();
	return JSON.parse(fs.readFileSync(lastResultsPath, 'utf8'));
}

function saveLastResults(code, results) {
	ensure();
	const data = loadLastResults();
	const mapList = (status) => results.filter((r) => r.status === status).map((r) => ({
 fid: String(r.fid),
 name: r.name || String(r.fid),
 status: r.status,
 kid: r.kid != null ? r.kid : null,
 message: r.message || null,
	}));
	const failed = [...mapList('rate_limit'), ...mapList('error')];
	data.byCode = data.byCode || {};
	data.byCode[code] = {
 at: new Date().toISOString(),
 total: results.length,
 failed,
 success: mapList('success'),
 already: mapList('already'),
 errors: mapList('error'),
 rate_limit: mapList('rate_limit'),
 summary: results.reduce((acc, r) => {
 acc[r.status] = (acc[r.status] || 0) + 1;
 return acc;
 }, {}),
	};
	fs.writeFileSync(lastResultsPath, JSON.stringify(data, null, 2));
	return failed;
}

function getLastResultLists(code) {
	const data = loadLastResults();
	return data.byCode?.[code] || null;
}

function getRetryMembers(code) {
	const data = loadLastResults();
	const entry = data.byCode?.[code];
	if (!entry || !Array.isArray(entry.failed) || !entry.failed.length) {
 // also pull from seen fids with rate_limit/error
 const seen = loadSeen().codes?.[code];
 if (seen?.fids) {
 const failedFids = Object.entries(seen.fids).filter(([, st]) => st === 'rate_limit' || st === 'error').map(([fid, status]) => ({
 fid,
 status
 }));
 if (!failedFids.length) return [];
 return failedFids.map((f) => ({
 fid: f.fid,
 name: f.fid,
 kid: null,
 }));
 }
 return [];
	}
	return entry.failed.map((f) => ({
 fid: String(f.fid),
 name: f.name || f.fid,
 kid: f.kid != null ? Number(f.kid) : null,
	}));
}

function getEffectiveDelayMs() {
	const base = Number(process.env.REDEEMDELAYMS || 2500);
	const state = loadAutoState();
	const extra = Number(state.extraDelayMs || 0);
	return Math.max(base, base + extra);
}

function bumpDelayIfNeeded(rateLimitCount) {
	const state = loadAutoState();
	const base = Number(process.env.REDEEMDELAYMS || 2500);
	const maxExtra = Number(process.env.MAXEXTRADELAYMS || 15000);
	if (rateLimitCount > 10) {
 state.extraDelayMs = Math.min(maxExtra, Number(state.extraDelayMs || 0) + 1500);
 saveAutoState(state);
 console.log(`[delay] rate_limit=${rateLimitCount} -> extraDelayMs=${state.extraDelayMs} (effective ${base + state.extraDelayMs}ms)`);
 return state.extraDelayMs;
	}
	if (rateLimitCount === 0 && Number(state.extraDelayMs || 0) > 0) {
 state.extraDelayMs = Math.max(0, Number(state.extraDelayMs) - 500);
 saveAutoState(state);
	}
	return state.extraDelayMs || 0;
}

function backupDataFiles() {
	ensure();
	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const dir = path.join(backupsDir, stamp);
	fs.mkdirSync(dir, {
 recursive: true
	});
	for (const name of ['members.json', 'seen_codes.json', 'blacklist.json', 'last_results.json', 'registrations.json', 'reminders.json', 'scheduled_blogs.json', 'game_stats.json', ]) {
 const src = path.join(dataDir, name);
 if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, name));
	}
	const folders = fs.readdirSync(backupsDir).map((n) => ({
 n,
 t: fs.statSync(path.join(backupsDir, n)).mtimeMs
	})).sort((a, b) => b.t - a.t);
	for (const f of folders.slice(20)) {
 try {
 fs.rmSync(path.join(backupsDir, f.n), {
 recursive: true,
 force: true
 });
 } catch {
 /* ignore */
 }
	}
	const state = loadAutoState();
	state.lastBackupAt = new Date().toISOString();
	saveAutoState(state);
	console.log(`[backup] saved ${dir}`);
	return dir;
}

function maybeBackup(force = false) {
	const hours = Number(process.env.BACKUPINTERVALHOURS || 6);
	const state = loadAutoState();
	if (!force && state.lastBackupAt) {
 const age = Date.now() - new Date(state.lastBackupAt).getTime();
 if (age < hours * 3600 * 1000) return null;
	}
	return backupDataFiles();
}

function wasCodeAnnounced(code) {
	const entry = loadSeen().codes?.[code];
	if (!entry) return false;
	if (entry.announcedAt) return true;
	// Any prior processing = already announced (stops repeat "New gift code" spam)
	if (entry.fids && Object.keys(entry.fids).length > 0) return true;
	if (entry.summary || entry.lastSummary || entry.source || entry.at) return true;
	return false;
}

function markCodeAnnounced(code) {
	const seen = loadSeen();
	const prev = seen.codes[code] || {};
	seen.codes[code] = {
 ...prev,
 announcedAt: prev.announcedAt || new Date().toISOString(),
	};
	saveSeen(seen);
}
module.exports = {
	loadMembers,
	saveMembers,
	loadHistory,
	pushHistory,
	loadSeen,
	isCodeDone,
	markCodeDone,
	getCodeFidStatus,
	getPendingMembers,
	countFidStatuses,
	recordFidResults,
	loadAutoState,
	saveAutoState,
	loadBlacklist,
	saveBlacklist,
	isBlacklisted,
	addBlacklist,
	removeBlacklist,
	loadLastResults,
	saveLastResults,
	getLastResultLists,
	getRetryMembers,
	getEffectiveDelayMs,
	bumpDelayIfNeeded,
	backupDataFiles,
	maybeBackup,
	wasCodeAnnounced,
	markCodeAnnounced,
};
