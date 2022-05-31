const fs = require("fs")
module.exports = class File {
	constructor (name, buffer) {
		if (!name && !buffer) {
			name = "unknown.txt"
			buffer = Buffer.from("")
		}
		if (name && !buffer) {
			buffer = name
			name = path.parse(buffer).base
		}
		if (typeof buffer === "string") {
			buffer = fs.readFileSync(buffer)
		}
		this.name = name
		this.buffer = buffer
	}
}