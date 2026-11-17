const {
	EmbedBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle
} = require('discord.js');
const {
	fetchActiveCodes
} = require('./codes');
const {
	redeemAll,
	summarize
} = require('./redeem');
const {
	notifyChannel,
	notifyAdmin,
	notifyAdminError
} = require('./notify');
const {
	buildAllRedeemTargets,
	stats
} = require('./registrations');
const {
	isBlacklisted,
	getPendingMembers,
	recordFidResults,
	saveLastResults,
	bumpDelayIfNeeded,
	maybeBackup,
	getEffectiveDelayMs,
	loadAutoState,
	saveAutoState,
	pushHistory,
	wasCodeAnnounced,
	markCodeAnnounced,
} = require('./store');
let timer = null;
let running = false;
let clientRef = null;

function getIntervalMs() {
	const min = Number(process.env.AUTOINTERVALMINUTES || 15);
	return Math.max(5, min) * 60 * 1000;
}
async function channelNotify(content, embeds, components) {
	const channelId = process.env.NOTIFYCHANNELID || '';
	if (!clientRef || !channelId) return;
	try {
		const ch = await clientRef.channels.fetch(channelId);
		if (ch && ch.isTextBased()) {
			const msg = await ch.send({
				content: content || undefined,
				embeds: embeds || undefined,
				components: components || undefined,
			});
			// Channel posts cannot be ephemeral; auto-delete so they do not stay forever
			const ttl = Number(process.env.NOTIFYTTLMS || 5 * 60 * 1000);
			if (ttl > 0) {
				setTimeout(() => msg.delete().catch(() => {}), ttl);
			}
		}
	} catch (e) {
		console.error('Notify channel failed:', e.message);
	}
}

function buildSummaryEmbed(code, sum) {
	const rows = [];
	const s = sum.success || 0;
	const a = sum.already || 0;
	const r = sum.rate_limit || 0;
	const e = sum.error || 0;
	const inv = sum.invalid || 0;
	const exp = sum.expired || 0;
	if (s > 0) rows.push(`✅ Redeemed: **${s}**`);
	if (a > 0) rows.push(`ℹ️ Already claimed: **${a}**`);
	if (r > 0) rows.push(`⏳ Please try again later: **${r}**`);
	if (e > 0) rows.push(`⚠️ Couldn’t finish: **${e}**`);
	if (inv > 0) rows.push(`❌ Invalid code: **${inv}**`);
	if (exp > 0) rows.push(`⌛ Expired: **${exp}**`);
	if (!rows.length) rows.push('_No results to show._');
	return new EmbedBuilder().setTitle(`🎁 Gift code — ${code}`).setColor(s + a > 0 ? 0x57f287 : 0xed4245).setDescription('📬 Check your **in-game mail** for rewards.\n\n' + rows.join('\n')).setTimestamp();
}

function detailButtons(code, sum) {
	const row = new ActionRowBuilder();
	const s = sum.success || 0;
	const a = sum.already || 0;
	const e = (sum.error || 0) + (sum.rate_limit || 0);
	// customId max 100 chars; code usually short
	if (s > 0) {
		row.addComponents(new ButtonBuilder().setCustomId(`rdetail:${code}:success`.slice(0, 100)).setLabel(`Redeemed (${s})`).setStyle(ButtonStyle.Success));
	}
	if (a > 0) {
		row.addComponents(new ButtonBuilder().setCustomId(`rdetail:${code}:already`.slice(0, 100)).setLabel(`Already (${a})`).setStyle(ButtonStyle.Secondary));
	}
	if (e > 0) {
		row.addComponents(new ButtonBuilder().setCustomId(`rdetail:${code}:failed`.slice(0, 100)).setLabel(`Issues (${e})`).setStyle(ButtonStyle.Danger));
	}
	return row.components.length ? [row] : [];
}

function buildNewCodesEmbed(codes) {
	const list = codes.map((c, i) => `**${i + 1}.** \`${c}\``).join('\n');
	return new EmbedBuilder().setTitle(codes.length === 1 ? '🆕 New gift code' : '🆕 New gift codes').setColor(0x5865f2).setDescription(list + '\n\nRedeeming for registered players and alliances…\n📬 Rewards will appear in **in-game mail**.').setTimestamp();
}
async function processNewCodes() {
	if (running) {
		console.log('[auto] Scan already running, skip');
		return;
	}
	running = true;
	try {
		maybeBackup(false);
		const state = loadAutoState();
		state.lastScanAt = new Date().toISOString();
		saveAutoState(state);
		const allMembers = await buildAllRedeemTargets();
		console.log(`[auto] Redeem targets (fresh roster): ${allMembers.length} unique players`);
		if (!allMembers.length) {
			console.log('[auto] No registered players/alliances yet');
			return;
		}
		let active = await fetchActiveCodes();
		active = active.filter((c) => !isBlacklisted(c.code));
		console.log(`[auto] Active codes: ${active.map((c) => c.code).join(', ') || '(none)'}`);
		const jobs = [];
		for (const item of active) {
			const pending = getPendingMembers(item.code, allMembers);
			if (pending.length) jobs.push({
				item,
				pending
			});
		}
		if (!jobs.length) {
			console.log('[auto] Nothing pending for current roster');
			return;
		}
		const brandNew = jobs.map((j) => j.item.code).filter((code) => !wasCodeAnnounced(code));
		if (brandNew.length) {
			await channelNotify(null, [buildNewCodesEmbed(brandNew)]);
			for (const code of brandNew) markCodeAnnounced(code);
		} else {
			console.log('[auto] Pending only for known codes — no "new code" channel post');
		}
		for (const {
				item,
				pending
			}
			of jobs) {
			const code = item.code;
			console.log(`[auto] Redeeming ${code} for ${pending.length} pending players…`);
			const results = await redeemAll(pending, code);
			const sum = summarize(results);
			saveLastResults(code, results);
			recordFidResults(code, results, {
				expiresAt: item.expiresAt,
				source: 'auto'
			});
			markCodeAnnounced(code);
			bumpDelayIfNeeded(sum.rate_limit || 0);
			pushHistory({
				code,
				at: new Date().toISOString(),
				by: 'auto',
				summary: sum,
				total: results.length,
			});
			const st = loadAutoState();
			st.lastRedeemAt = new Date().toISOString();
			saveAutoState(st);
			const hasGood = (sum.success || 0) + (sum.already || 0) > 0;
			const hasBad = (sum.error || 0) + (sum.rate_limit || 0) > 0;
			// Public channel: only when someone redeemed or already claimed
			if (hasGood) {
				await channelNotify(null, [buildSummaryEmbed(code, sum)], detailButtons(code, sum));
			}
			// Errors / rate limits → admin DM only (never public channel as error-only spam)
			if (hasBad) {
				await notifyAdminError(clientRef, `Code \`${code}\`\n` + `Redeemed: ${sum.success || 0} · Already: ${sum.already || 0}\n` + `Rate limit: ${sum.rate_limit || 0} · Errors: ${sum.error || 0}\n` + `Pending this run: ${pending.length}`);
			}
			// If nothing good and nothing bad (shouldn't happen), skip channel
			console.log(`[auto] Done ${code}:`, sum);
		}
	} catch (e) {
		console.error('[auto] Error:', e);
		await notifyAdminError(clientRef, `AUTOREDEEM error: ${e.message}`);
	} finally {
		running = false;
	}
}

function startAuto(client) {
	clientRef = client;
	stopAuto();
	const state = loadAutoState();
	state.enabled = true;
	saveAutoState(state);
	const ms = getIntervalMs();
	console.log(`[auto] Started — every ${ms / 60000} min`);
	maybeBackup(true);
	setTimeout(() => processNewCodes().catch(console.error), 5000);
	timer = setInterval(() => processNewCodes().catch(console.error), ms);
}

function stopAuto() {
	if (timer) {
		clearInterval(timer);
		timer = null;
	}
	const state = loadAutoState();
	state.enabled = false;
	saveAutoState(state);
	console.log('[auto] Stopped');
}

function isAutoRunning() {
	return !!timer;
}
async function runOnce() {
	await processNewCodes();
}
async function postBootStatus(client) {
	if (!client) return;
	try {
		const s = stats();
		const members = await buildAllRedeemTargets();
		const embed = new EmbedBuilder().setTitle('🟢 Bot online').setColor(0x57f287).setDescription(`Auto every **${(getIntervalMs() / 60000).toFixed(0)}** min · roster refreshed each cycle`).addFields({
			name: 'Users registered',
			value: String(s.users),
			inline: true
		}, {
			name: 'Solo players',
			value: String(s.players),
			inline: true
		}, {
			name: 'Alliances',
			value: String(s.alliances),
			inline: true
		}, {
			name: 'Unique targets',
			value: String(members.length),
			inline: true
		}, {
			name: 'Delay ms',
			value: String(getEffectiveDelayMs()),
			inline: true
		}).setTimestamp();
		await notifyAdmin(client, null, [embed]);
	} catch (e) {
		console.error('[boot] admin status failed:', e.message);
	}
}
module.exports = {
	startAuto,
	stopAuto,
	isAutoRunning,
	runOnce,
	processNewCodes,
	getIntervalMs,
	postBootStatus,
};
