function filterActive(items) {
	const now = Date.now();
	const map = new Map;
	for (const item of items) {
		const code = String(item.code || item.cdk || item.name || "").trim();
		if (!code) continue;
		const exp = item.expiresAt || item.expires || item.expire_at || item.expire || null;
		if (exp) {
			const t = new Date(exp).getTime();
			if (!Number.isNaN(t) && t < now) continue
		}
		if (!map.has(code)) {
			map.set(code, {
				code,
				expiresAt: exp,
				createdAt: item.createdAt || item.created_at || item.date || null,
				id: item.id || null
			})
		}
	}
	return Array.from(map.values())
}

function parseKingshotNet(data) {
	let list = [];
	if (data?.data?.giftCodes && Array.isArray(data.data.giftCodes)) list = data.data.giftCodes;
	else if (Array.isArray(data?.giftCodes)) list = data.giftCodes;
	else if (Array.isArray(data?.data)) list = data.data;
	return list
}

function parseMastery(data) {
	if (Array.isArray(data?.codes)) return data.codes;
	if (Array.isArray(data)) return data;
	return []
}
const PRIMARY = {
	url: "https://kingshot.net/api/gift-codes",
	parse: parseKingshotNet
};
const BACKUPS = [{
	url: "https://kingshotmastery.com/api/gift-codes",
	parse: parseMastery
}];
async function fetchFromSource(source) {
	const res = await fetch(source.url, {
		headers: {
			Accept: "application/json",
			"User-Agent": "Mozilla/5.0 (compatible; GiftCodeBot/1.3)"
		}
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const data = await res.json();
	return filterActive(source.parse(data))
}
async function fetchActiveCodes() {
	try {
		const primary = await fetchFromSource(PRIMARY);
		if (primary.length > 0) {
			console.log(`[codes] primary OK - ${primary.length} code(s)`);
			return primary
		}
		console.log("[codes] primary returned no valid codes - trying backups")
	} catch (e) {
		console.error("[codes] primary failed - trying backups:", e.message)
	}
	let lastErr = null;
	for (const source of BACKUPS) {
		try {
			const codes = await fetchFromSource(source);
			if (codes.length > 0) {
				console.log(`[codes] backup OK - ${codes.length} code(s)`);
				return codes
			}
		} catch (e) {
			lastErr = e.message;
			console.error("[codes] backup failed:", e.message)
		}
	}
	throw new Error(`Code list unavailable${lastErr?` (${lastErr})`:""}`)
}
module.exports = {
	fetchActiveCodes
};
