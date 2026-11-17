const {
	spawnSync
} = require('child_process');
console.log('🔄 Registering Discord slash commands before bot startup...');
const result = spawnSync(process.execPath, ['register-commands.js'], {
	cwd: __dirname,
	stdio: 'inherit',
});
if (result.error) {
	console.error('⚠️ Could not run slash-command registration:', result.error.message);
	console.error('Starting bot anyway…');
} else if (result.status !== 0) {
	console.error('⚠️ Slash-command registration failed (rate limit?). Starting bot anyway…');
} else {
	console.log('✅ Slash commands registered.');
}
console.log('Starting bot...');
require('./index.js');
