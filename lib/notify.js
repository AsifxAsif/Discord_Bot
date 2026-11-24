/**
 * Channel = public status only (new codes + redeem results)
 * Admin user DM = boot, errors, backend updates
 */
async function notifyChannel(client, channelId, content, embeds) {
	if (!client || !channelId) return;
	try {
		const ch = await client.channels.fetch(channelId);
		if (ch && ch.isTextBased()) {
			await ch.send({
				content: content || undefined,
				embeds: embeds || undefined,
			});
		}
	} catch (e) {
		console.error('Notify channel failed:', e.message);
	}
}
async function notifyAdmin(client, content, embeds) {
	if (!client) return;
	const userId = process.env.ERRORADMINUSERID || '';
	if (!userId) {
		console.warn('ERRORADMINUSERID not set â€” admin DM skipped');
		return;
	}
	try {
		const user = await client.users.fetch(userId);
		await user.send({
			content: content || undefined,
			embeds: embeds || undefined,
		});
	} catch (e) {
		console.error('Admin DM failed (allow DMs from server members):', e.message);
	}
}
async function notifyAdminError(client, message) {
	const text = typeof message === 'string' ? message : String(message);
	await notifyAdmin(client, `âš ï¸ **Bot notice**\n${text}`.slice(0, 1900));
}
module.exports = {
	notifyChannel,
	notifyAdmin,
	notifyAdminError,
};
