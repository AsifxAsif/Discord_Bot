/** Delete a message by id, ignoring errors (already deleted, missing perms, â€¦). */
async function deleteMessage(client, channelId, messageId) {
	try {
		const ch = await client.channels.fetch(channelId);
		if (ch?.messages) await ch.messages.delete(messageId);
	} catch {
		/* ignore */
	}
}
/** Safe text-input getter for modals ('' when the field isn't in the modal). */
function fieldGetter(interaction) {
	return (id) => {
		try {
			return interaction.fields.getTextInputValue(id) || '';
		} catch {
			return '';
		}
	};
}
module.exports = {
	deleteMessage,
	fieldGetter
};
