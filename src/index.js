const fs = require("fs"),
colors = require("colors"),
process = require("process"),
PATH = require("path"),
Hjson = require('hjson');
const debug = (...text) => true ? process.stdout.write(colors.green(text.join(" ").toString()) + "\n") : void(0)
const { Client } = require("./bot")
let clients = [];

function reloadClients () {
	// Load config:
	// I should probably use a __dirname here....
	// but I also like the idea of running the same program in different folders for different config.
	let configs;
	try {
		debug("Loading configuration JSON.");
		if (process.env.config) configs = Hjson.parse(process.env.config);
		else if (fs.existsSync("./config.hjson")) configs = Hjson.parse(fs.readFileSync("./config.hjson").toString())
		else if (fs.existsSync("./config.json")) configs = Hjson.parse(fs.readFileSync("./config.json").toString())
		else if (fs.existsSync("./config.js")) configs = eval(fs.readFileSync("./config.js").toString())
		else throw "No config.hjson file found."
		debug("Configuration JSON loaded.")
	}
	catch (e) { debug("Error loading JSON."), console.error(colors.red("No parseable configuration file found. Please make sure config.hjson exists and is valid hjson. Maybe this was run from the wrong folder?")), console.error(e), process.exit(1) };
	configs = require("./library/check_config")(configs)
	clients = []
	configs.forEach(config => {
		config.Login.forEach(credential => {
			console.log(`Logging in for configuration \`${config.name}\``)
			let client = new Client(config, {
				http: {
					gateway: "wss://macadamia-web.herokuapp.com/main/ws_/wss://gateway.discord.gg?v=9&encoding=json",
					api: "https://macadamia-web.herokuapp.com/main/https://discord.com/api/v9/"
				},
				isBot: false
			})
			if (typeof credential == "string") client.token(credential)
			else client.login(credential.username, credential.password)
			clients.push(client)
		})
	})
}
reloadClients()

// Evaluate stdin
process.stdin.on("data", function (chunk) {
	let out = chunk.toString().trim();
	if (out == "") return;
	if (out.startsWith("clear")) return console.clear();
	try { out = eval(out) }
	catch (e) { out = e };
	console.log(out);
});