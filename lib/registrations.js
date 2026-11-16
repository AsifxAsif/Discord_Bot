const fs = require("fs");
const path = require("path");
const {
	fetchAlliance
} = require("./mightpulse");
const dataDir = process.env.DATADIR || path.join(__dirname, "..", "data");
const regPath = path.join(dataDir, "registrations.json");
const MAX_PLAYERS = Number(process.env.MAXPLAYERSPERUSER || 5);
const MAX_ALLIANCES = Number(process.env.MAXALLIANCESPERUSER || 3);

function ensure() {
	if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, {
		recursive: true
	});
	if (!fs.existsSync(regPath)) {
		fs.writeFileSync(regPath, JSON.stringify({
			users: {}
		}, null, 2))
	}
}

function load() {
	ensure();
	return JSON.parse(fs.readFileSync(regPath, "utf8"))
}

function save(data) {
	ensure();
	fs.writeFileSync(regPath, JSON.stringify(data, null, 2))
}

function getUser(discordId) {
	const data = load();
	const id = String(discordId);
	if (!data.users[id]) {
		data.users[id] = {
			players: [],
			alliances: []
		};
		save(data)
	}
	return data.users[id]
}

function saveUser(discordId, userData) {
	const data = load();
	data.users[String(discordId)] = userData;
	save(data)
}

function addPlayer(discordId, player) {
	const user = getUser(discordId);
	if (user.players.length >= MAX_PLAYERS) {
		return {
			ok: false,
			error: `Limit reached: max **${MAX_PLAYERS}** solo players per user.`
		}
	}
	if (user.players.some(p => String(p.fid) === String(player.fid))) {
		return {
			ok: false,
			error: `Player \`${player.fid}\` is already registered.`
		}
	}
	user.players.push({
		fid: String(player.fid),
		name: player.name,
		kid: player.kid != null ? Number(player.kid) : null,
		tc: player.tc ?? null,
		registeredAt: (new Date).toISOString()
	});
	saveUser(discordId, user);
	return {
		ok: true,
		user
	}
}

function addAlliance(discordId, alliance) {
	const user = getUser(discordId);
	if (user.alliances.length >= MAX_ALLIANCES) {
		return {
			ok: false,
			error: `Limit reached: max **${MAX_ALLIANCES}** alliances per user.`
		}
	}
	const key = `${alliance.kid}:${alliance.slug}`;
	if (user.alliances.some(a => `${a.kid}:${a.slug}` === key)) {
		return {
			ok: false,
			error: `Alliance **${alliance.name}** [K${alliance.kid}] is already registered.`
		}
	}
	user.alliances.push({
		kid: Number(alliance.kid),
		slug: String(alliance.slug),
		abbr: alliance.abbr || alliance.slug,
		name: alliance.name,
		aid: alliance.aid ?? null,
		registeredAt: (new Date).toISOString()
	});
	saveUser(discordId, user);
	return {
		ok: true,
		user
	}
}

function removePlayer(discordId, fid) {
	const user = getUser(discordId);
	const before = user.players.length;
	user.players = user.players.filter(p => String(p.fid) !== String(fid));
	saveUser(discordId, user);
	return before !== user.players.length
}

function removeAlliance(discordId, kid, slug) {
	const user = getUser(discordId);
	const before = user.alliances.length;
	user.alliances = user.alliances.filter(a => !(Number(a.kid) === Number(kid) && String(a.slug) === String(slug)));
	saveUser(discordId, user);
	return before !== user.alliances.length
}
async function buildAllRedeemTargets() {
	const data = load();
	const map = new Map;
	for (const user of Object.values(data.users || {})) {
		for (const p of user.players || []) {
			if (p.kid == null || !Number.isFinite(Number(p.kid))) {
				console.warn(`[reg] skipping player ${p.fid}: no kingdom/server was saved; re-register this player`);
				continue
			}
			map.set(String(p.fid), {
				fid: String(p.fid),
				name: p.name || p.fid,
				kid: Number(p.kid)
			})
		}
		for (const a of user.alliances || []) {
			try {
				const {
					members
				} = await fetchAlliance(a.kid, a.slug);
				for (const m of members) {
					const memberKid = m.kid != null ? Number(m.kid) : Number(a.kid);
					if (!Number.isFinite(memberKid)) {
						console.warn(`[reg] skipping alliance member ${m.fid}: no kingdom/server available`);
						continue
					}
					map.set(String(m.fid), {
						fid: String(m.fid),
						name: m.name || String(m.fid),
						kid: memberKid
					})
				}
			} catch (e) {
				console.error(`[reg] alliance ${a.kid}/${a.slug} failed:`, e.message)
			}
		}
	}
	return Array.from(map.values())
}

function listUser(discordId) {
	return getUser(discordId)
}


function listAllUsers() {
  const data = load();
  return Object.entries(data.users || {}).map(([discordId, u]) => ({
    discordId,
    players: u.players || [],
    alliances: u.alliances || [],
  }));
}

function stats() {
	const data = load();
	let players = 0;
	let alliances = 0;
	const users = Object.keys(data.users || {}).length;
	for (const u of Object.values(data.users || {})) {
		players += (u.players || []).length;
		alliances += (u.alliances || []).length
	}
	return {
		users,
		players,
		alliances
	}
}
module.exports = {
	MAX_PLAYERS,
	MAX_ALLIANCES,
	addPlayer,
	addAlliance,
	removePlayer,
	removeAlliance,
	listUser,
	listAllUsers,
	buildAllRedeemTargets,
	stats,
	getUser
};
