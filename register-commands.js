require('dotenv').config();
const {
	REST,
	Routes
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const commands = [];
const dir = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
	const command = require(path.join(dir, file));
	if (command.data) {
		commands.push(command.data.toJSON());
		console.log(`Prepared /${command.data.name}`);
	}
}
const rest = new REST({
	version: '10'
}).setToken(process.env.DISCORDTOKEN);
(async () => {
	try {
		if (!process.env.DISCORDTOKEN || !process.env.CLIENTID) {
			throw new Error('Need DISCORDTOKEN and CLIENTID in .env');
		}
		// Activities have one global PRIMARY_ENTRY_POINT command. Reuse Discord's
		// auto-created Launch command when present, so we do not create a duplicate.
		let current = [];
		try {
			current = await rest.get(Routes.applicationCommands(process.env.CLIENTID));
		} catch (error) {
			console.warn('[activity] Could not read existing commands before registration:', error.message);
		}
		const existingEntry = current.find((command) => command.type === 4);
		const entryPoint = existingEntry ? {
			name: 'kingshot-arcade',
			description: 'Launch the Kingshot Arcade Activity',
			type: 4,
			handler: 2,
			integration_types: existingEntry.integration_types || [0, 1],
			contexts: existingEntry.contexts || [0, 1, 2],
		} : {
			name: 'kingshot-arcade',
			description: 'Launch the Kingshot Arcade Activity',
			type: 4,
			handler: 2,
			integration_types: [0, 1],
			contexts: [0, 1, 2],
		};
		const body = [...commands, entryPoint];
		console.log(`Registering ${commands.length} chat command(s) + Kingshot Arcade entry point...`);
		const data = await rest.put(Routes.applicationCommands(process.env.CLIENTID), {
			body
		});
		console.log(`Registered ${data.length} application command(s).`);
		console.log('[OK] Open Discord App Launcher -> Kingshot Arcade to launch the graphical Activity.');
	} catch (error) {
		console.error('[X] Failed to register Discord commands:', error);
		process.exitCode = 1;
	}
})();
