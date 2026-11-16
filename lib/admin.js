const { errorEmbed } = require('./ui');

function getOwnerIds() {
  const ids = new Set();
  // Primary hardcoded owner (bot creator)
  ids.add('598531173127422021');
  // Also allow ERRORADMINUSERID from .env
  if (process.env.ERRORADMINUSERID) {
    ids.add(String(process.env.ERRORADMINUSERID).trim());
  }
  if (process.env.OWNER_USER_ID) {
    ids.add(String(process.env.OWNER_USER_ID).trim());
  }
  return ids;
}

function isAdmin(interaction) {
  return getOwnerIds().has(String(interaction.user?.id || ''));
}

async function denyIfNotAdmin(interaction) {
  if (isAdmin(interaction)) return false;
  await interaction.reply({
    embeds: [errorEmbed('Owner-only command', 'This action is restricted to the bot owner.')],
    ephemeral: true,
  });
  return true;
}

module.exports = {
  isAdmin,
  denyIfNotAdmin,
  getOwnerIds,
};
