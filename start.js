const {
	spawnSync
} = require('child_process');
console.log('ðŸ”„ Registering Discord slash commands before bot startup...');
const result = spawnSync(process.execPath, ['register-commands.js'], {
	cwd: __dirname,
	stdio: 'inherit',
});
if (result.error) {
	console.error('âš ï¸ Could not run slash-command registration:', result.error.message);
	console.error('Starting bot anywayâ€¦');
} else if (result.status !== 0) {
	console.error('âš ï¸ Slash-command registration failed (rate limit?). Starting bot anywayâ€¦');
} else {
	console.log('âœ… Slash commands registered.');
}
console.log('Starting bot...');
require('./index.js');
