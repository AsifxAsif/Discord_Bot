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
}).setToken(process.env.DISCORD_TOKEN);
(async () => {
	try {
		if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
			console.error("Need DISCORD_TOKEN and CLIENT_ID in .env");
			process.exit(1)
		}
		console.log(`Registering ${commands.length} commands…`);
		const data = await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
			body: commands
		});
		console.log(`✅ Registered ${data.length} command(s)`)
	} catch (e) {
		console.error("❌ Failed to register Discord slash commands:", e);
		process.exitCode = 1
	}
})();
