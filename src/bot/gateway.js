const readline = require("readline")
const colors = require("colors")
let pretty = false;

let prop = (oldNum=5, oldmin=0, oldmax=255, newmin=-2, newmax=2) => ((oldNum - oldmin) / (oldmax - oldmin) ) * (newmax - newmin) + newmin

function progressBar (num, { min, max, label, line, size }) {
    min = min || 0
    max = max || 100
    label = label ?? ""
    line = line ?? 1
    size = size ?? 0.8
    const fullWidth = process.stdout.columns
    const barWidth = (fullWidth * size) - 2
    const labelWidth = (fullWidth * (1 - size))
    let hashWidth = prop(num, min, max, 0, barWidth)
    let barSpaceWidth = barWidth - hashWidth
    let labelSpaceWidth = labelWidth - label.length
    if (labelSpaceWidth < 0) {
        labelSpaceWidth = 0
        label = label.slice(0, Math.floor(labelWidth))
    }
    if (barSpaceWidth < 0) {
        hashWidth = Math.floor(barWidth)
        barSpaceWidth = 0
    }
    readline.cursorTo(process.stdout, 0, line)
    try {
        process.stdout.write([
            label.toString(),
            " ".repeat(labelSpaceWidth),
            "[",
            "#".repeat(Math.floor(hashWidth)),
            " ".repeat(Math.floor(barSpaceWidth)),
            "]",
            "\n"
        ].join(""))
    } catch (e) {
        process.stdout.write("\n\n\n")
        console.log([fullWidth, barWidth, labelWidth, hashWidth, barSpaceWidth, labelWidth - label.length].join("\n"))
        throw e
    }
}

module.exports = (ws = new WebSocket(), client, token, isBot = false, resume = false) => {
    let sequence = null;
    let session = null;
    let lastHeartbeat;
    let heartbeats = 0;

    function checkHeartbeat (interval) {
        if (!lastHeartbeat) return;
        let diff = Date.now() - lastHeartbeat 
        if (diff > (interval * 1.3)) {
            process.stdout.write("\n")
            console.error("Timed out while waiting for heartbeat. Maybe your wifi went out?")
            ws.emit("timeout", {sequence: sequence, session: session})
            client.emit("timeout", {sequence: sequence, session: session})
            ws.close()
        }
        if (!pretty) return;
        progressBar(diff, { line: 4, max: interval, label: `heartbeat <${heartbeats}>` })
    }

    function login (msg) {
        let intent = [
            0,
            3,
            9,
            12,
            15,
        ].map(e => 1 << e).reduce((p, c) => p | c)
        ws.send(JSON.stringify({op: 1, d: sequence}))
        setInterval(() => ws.send(JSON.stringify({op: 1, d: sequence})), msg.d.heartbeat_interval)
        ws.send(JSON.stringify({
            op: 2,
            d: {
                token: token,
                properties: {
                    "$os": "linux",
                    "$browser": "icecat",
                    "$device": "macadamia"
                },
                intents: isBot ?  intent : undefined
            }
        }))
        let heartbeatChecker = setInterval(() => checkHeartbeat(msg.d.heartbeat_interval), /*msg.d.heartbeat_interval / 4*/ 300)
        ws.on("timeout", () => clearInterval(heartbeatChecker))
    }

    ws.on("message", (msg) => {
        msg = JSON.parse(msg)
        //console.log(msg)
        if (msg.s) sequence = msg.s
        //console.log(msg.op)
        switch (msg.op.toString()) {
            case "11":
                heartbeats++
                lastHeartbeat = Date.now()
                break;
            case "10":
                const timeout = msg.d.heartbeat_interval * Math.random()
                setTimeout(() => login(msg), timeout);
                if (!pretty) break;
                let start = Date.now()
                const barInterval = setInterval(() => {
                    if (!pretty || lastHeartbeat || heartbeats > 0) {
                        progressBar(1, { label: "Initial heartbeat.", max: 1, size: 1, line: 4 })
                        return clearInterval(barInterval)
                    }
                    progressBar(Date.now() - start, { label: "Initial heartbeat.", max: timeout, line: 4 })
                }, 100)
                ws.on("timeout", () => clearInterval(barInterval))
                break;
            case "9":
                ws.close()
                throw new Error("Recieved opcode 9.")
                break;
            case "0":
                let eventName = msg.t.toLowerCase()
                if (eventName.includes("_")) {
                    eventName = eventName.split("_")
                    eventName = eventName.map((t,i) => i === 0 ? t : t.slice(0, 1).toUpperCase() + t.slice(1)).join("")
                }
                if (eventName == "ready") session = msg.d.session_id
                //console.log(`Emitting ${eventName}`)
                client.emit(eventName, msg.d)
                break;
        }
    })
    ws.onerror = (e) => {
        console.log(e)
        process.exit(1)
    }

    return ws
}