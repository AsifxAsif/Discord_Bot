async function searchPlayers(query) {
	const url = `https://mightpulse.com/api/search?q=${encodeURIComponent(query)}&limit=40&live=0`;
	const res = await fetch(url, {
		headers: {
			Accept: "application/json",
			"User-Agent": "GiftCodeBot/2.0"
		}
	});
	if (!res.ok) throw new Error(`Player search unavailable (${res.status})`);
	const data = await res.json();
	const results = Array.isArray(data.results) ? data.results : [];
	const mapped = results.map(r => {
		const fid = r.fid != null ? String(r.fid) : r.uid != null && r.nick_name ? String(r.uid) : null;
		const playerId = r.fid != null ? String(r.fid) : null;
		if (!playerId) return null;
		const name = String(r.nick_name || r.name || playerId).replace(/\u00a0/g, " ").trim();
		return {
			fid: playerId,
			uid: r.uid != null ? String(r.uid) : null,
			name,
			kid: r.kid != null ? Number(r.kid) : null,
			tc: r.stove_lv ?? r.town_center_level ?? null,
			power: r.power ?? null,
			alliance: r.alliance_abbr || r.alliance_name || null,
			allianceName: r.alliance_name || null
		}
	}).filter(Boolean);
	const map = new Map;
	for (const p of mapped) {
		if (!map.has(p.fid)) map.set(p.fid, p)
	}
	return Array.from(map.values())
}
async function searchAlliances(query, kidFilter = null) {
	const url = `https://mightpulse.com/api/search/alliances?q=${encodeURIComponent(query)}&limit=40`;
	const res = await fetch(url, {
		headers: {
			Accept: "application/json",
			"User-Agent": "GiftCodeBot/2.0"
		}
	});
	if (!res.ok) throw new Error(`Alliance search unavailable (${res.status})`);
	const data = await res.json();
	let results = Array.isArray(data.results) ? data.results : [];
	if (kidFilter != null && kidFilter !== "") {
		const kid = Number(kidFilter);
		results = results.filter(r => Number(r.kid) === kid)
	}
	return results.map(r => ({
		aid: r.aid,
		kid: Number(r.kid),
		name: String(r.name || "").replace(/\u00a0/g, " ").trim(),
		abbr: String(r.abbr || r.slug || "").trim(),
		slug: String(r.slug || r.abbr || "").trim(),
		leader: r.leader_name || null,
		members: r.member_count ?? r.count ?? null,
		power: r.power ?? null
	}))
}
module.exports = {
	searchPlayers,
	searchAlliances
};
