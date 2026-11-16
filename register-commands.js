require("dotenv").config();
const {
	REST,
	Routes
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const commands = [];
const dir = path.join(__dirname, "commands");
for (const file of fs.readdirSync(dir).filter(f => f.endsWith(".js"))) {
	const cmd = require(path.join(dir, file));
	if (cmd.data) {
		commands.push(cmd.data.toJSON());
		console.log("Prepared /" + cmd.data.name)
	}
}
const rest = new REST({
	version: "10"
}).setToken(process.env.DISCORDTOKEN);
(async () => {
	try {
		if (!process.env.DISCORDTOKEN || !process.env.CLIENTID) {
			console.error("Need DISCORDTOKEN and CLIENTID in .env");
			process.exit(1)
		}
		console.log(`Registering ${commands.length} commands…`);
		const data = await rest.put(Routes.applicationCommands(process.env.CLIENTID), {
			body: commands
		});
		console.log(`✅ Registered ${data.length} command(s)`)
	} catch (e) {
		console.error("❌ Failed to register Discord slash commands:", e);
		process.exitCode = 1
	}
})();
