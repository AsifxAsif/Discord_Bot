async function fetchAlliance(kid, slug) {
	const url = `https://mightpulse.com/api/alliances/lookup?kid=${encodeURIComponent(kid)}&slug=${encodeURIComponent(slug)}`;
	const res = await fetch(url, {
 headers: {
 Accept: "application/json",
 "User-Agent": "KingshotGiftcodeBot/1.0"
 }
	});
	if (!res.ok) throw new Error(`Roster sync unavailable (${res.status})`);
	const data = await res.json();
	if (!data.ok && data.ok !== true) {
 if (!Array.isArray(data.members)) throw new Error("Roster sync failed: unexpected data")
	}
	const alliance = data.alliance || {};
	const members = (data.members || []).filter(m => m.fid != null).map(m => ({
 fid: String(m.fid),
 name: String(m.nick_name || m.name || m.fid).replace(/\u00a0/g, " ").trim(),
 kid: Number(m.kid || alliance.kid || kid),
 tc: m.stove_lv ?? m.town_center_level ?? null,
 rank: m.alliance_rank ?? null,
 power: m.power ?? null
	}));
	const map = new Map;
	for (const m of members) map.set(m.fid, m);
	return {
 alliance: {
 name: alliance.name || slug,
 abbr: alliance.abbr || slug,
 kid: Number(alliance.kid || kid),
 aid: alliance.aid || null,
 count: map.size
 },
 members: Array.from(map.values()).sort((a, b) => (b.power || 0) - (a.power || 0))
	}
}
module.exports = {
	fetchAlliance
};
