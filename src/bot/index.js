const colors = require("colors"), 
https = require("https"),
fs = require("fs");
const File = require("./file");
const FormData = require('form-data');
const Gateway = require("./gateway.js")
const { WebSocket } = require("ws")
const { EventEmitter } = require("events")
const SetupClient = require("./setupClient")
const messageHandler = require("./onmessage")

const request = (url, method = "GET", options) => {
	return new Promise ((resolve, reject) => {
		let req = https.request(url, {
			method: method,
			headers: options.headers ?? null,
			port: 443,
		}, function (res) {
			let buffers = []
			res.on("data", function (chunk) {
				buffers.push(chunk)
			})
			res.on("end", () => {
				resolve({body: Buffer.concat(buffers), status: res.statusCode})
			})
			res.on("error", () => {
				reject({body: Buffer.concat(buffers), status: res.statusCode})
			})
		})
		if (options.body && method !== "GET") req.write((options.body instanceof Object && !(options.body instanceof Buffer)) ? JSON.stringify(options.body) : options.body)
		req.end()
	})
}

const loginBucket = []
setInterval(async () => {
	if (loginBucket.length <= 0) return;
	const task = loginBucket.shift()
	const { body } = await request(task.url, "POST", {
		body: JSON.stringify({
			"login": task.email,
			"password": task.password,
			"undelete": false,
			"captcha_key": null,
			"login_source": null,
			"gift_code_sku_id": null
		}),
		headers: {
			"content-type": "application/json"
		}
	})
	task.res(body)
}, 1.5 * 1000)

const getToken = async function (baseURL, email, password) {
	let data = await new Promise((res) => {
		loginBucket.push({
			url: `${baseURL}auth/login`,
			email: email,
			password: password,
			res: res
		})
	})
	data = JSON.parse(data)
	if (data.token) return data.token
	else {
		console.error(JSON.stringify(data))
		throw new Error("Login failed. Invalid username/password or captcha code required.")
	}
}

module.exports.Client = class Client extends EventEmitter {
	ready = false;
	emojis = [];
	isBot = false;
	constructor (config, { http, isBot } = { http: {}, isBot: false }) {
		super()
		this.urls = {
			gateway: http.gateway ?? "wss://gateway.discord.gg?v=9&encoding=json",
			api: http.api ?? "https://discord.com/api/v9/"
		}
		this.isBot = isBot
		this.config = config;
		
	}
	async api (path, method = "GET", body, headers, auth = true) {
		let _headers = {}
		if (auth) _headers["authorization"] = this.isBot ? `Bot ${this.token}` : this.token
		if (body instanceof Object) _headers["content-type"] = body instanceof Buffer ? "multipart/form-data" : "application/json"
		if (headers) Object.keys(headers).forEach(key => _headers[key] = headers[key])
		let data = (await request(this.urls.api + "/" + path, method, {body: body, headers: _headers})).body.toString()
		if (!data) return null;
		else return JSON.parse(data)
	}
	async token (token) {
		this.token = token
		this.gateway = Gateway(new WebSocket(this.urls.gateway), this, this.token, this.isBot, false)
		let clientData = await new Promise((res, rej) => {
			let cont = true;
			const timer = setTimeout(() => {
				cont = false
				rej()
			}, 60 * 1000)
			this.once("ready", (clientData) => {
				clearTimeout(timer)
				if (!cont) return;
				res(clientData)
			})
		})
		await SetupClient(this, clientData)
		console.log(`${this.user.username} is ready.`)
		this.on("messageCreate", (msg) => {
			if (this.user.id != msg.author.id) return;
			messageHandler(msg, this, this.config)
		})
	}
	async login (email, password) {
		const token = await getToken(this.urls.api, email, password)
		this.token(token)
	}
	async send (channelid, ...payloads) {
		const form = new FormData()
		let files = payloads.filter(payload => payload instanceof File)
		let text = payloads.find(payload => typeof payload == "string")
		if (text) form.append("payload_json", JSON.stringify({ content: text }))
		files.forEach((file, i) => form.append( `files[${i}]`, file.buffer ?? fs.readFileSync(file.path), { filename: file.name, name: file.name.slice(file.name.lastIndexOf(".")+1) } ))
		return this.api(`channels/${channelid}/messages`, "POST", form.getBuffer(), form.getHeaders())
	}
}