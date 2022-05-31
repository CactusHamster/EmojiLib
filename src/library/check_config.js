const { red, yellow } = require("colors")
const fs = require("fs")
const path = require("path")
let error = (msg) => {
    console.error(red(msg))
    process.exit(1)
}
let warn = (msg) => console.warn(yellow(msg))

function checkConf (config, index) {
    if (!config["name"]) config["name"] = `Unnamed config [${index}]`

    // Login:
    if (!config["Login"]) error("No login information.")
    if (!(config["Login"] instanceof Array)) {
        config["Login"] = [{
            username: config["Login"].email ?? config["Login"].login ?? config["Login"].username ?? config["Login"].user,
            password: config["Login"].password ?? (config["Login"].password_base64 ? Buffer.from(config["Login"].password_base64, "base64").toString() : null)
        }]
        if (!config["Login"][0].password && !config["Login"][0].username) error("No email/pasword combination found in configured login object.")
    } else {
        if (config["Login"].length <= 0) error("No credentials specified in configuration for login.")
        config["Login"] = config["Login"].map(credential => {
            if (credential instanceof Array && credential.length >= 2) return {username: credential[0], password: credential[1]}
            else {
                if (credential.token) return credential.token
                let keys = Object.keys(credential)
                if (keys.includes("login") || keys.includes("email") || keys.includes("username") || keys.includes("user")) {
                    if (keys.includes("password") || keys.includes("password_base64")) return {username: credential.email ?? credential.login ?? credential.username ?? credential.user, password: credential.password ?? Buffer.from(credential.password_base64, "base64").toString()}
                    else return error("No password found.")
                }
                else error("No username or token found.")
            }
        });
    }

    // Emojis and Stickers:
    (["Emojis", "Stickers"]).forEach((key,i) => {    
        if (config[key] == undefined) {
            warn(`No ${key} configuration specified. Disabling ${key} handling.`);
            config[key] = { enabled: false };
        } else {
            config[key].enabled = config[key].enabled ?? true;
            config[key]["size"] = +config[key]["size"];
            if (isNaN(config[key]["size"]) || config[key].size < 0) error("Invalid emoji size in config.");
            (["discord", "local"]).forEach(subkey => {
                if (config[key][subkey].enabled == undefined) config[key][subkey].enabled = true
                if (typeof config[key][subkey].match != "string") return error(`Invalid value for matching ${subkey} ${key}. Expected a string, got a(n) ${typeof config[key][subkey]}.`)
            })
            if (!config[key]["local"].path) error("No path specified for local "+key+".")
            if (!fs.existsSync(config[key]["local"].path)) error(`Path for local ${key} in config could not be read. Maybe you ran this from the wrong dir?`)
            else if (!fs.statSync(config[key]["local"].path).isDirectory()) error(`Path for local ${key} is not a directory. Maybe you ran this from the wrong dir?`)
        }
    })

    // Activation Commands:
    if (!config["Activation Commands"]) config["Activation Commands"] = {};
    if (config["Activation Commands"]["enabled"] == undefined) config["Activation Commands"]["enabled"] = false;
    if (typeof config["Activation Commands"]["enable"] != "string") config["Activation Commands"]["enabled"] = false;
    if (typeof config["Activation Commands"]["disable"] != "string") config["Activation Commands"]["enabled"] = false;

}

module.exports = (configArray) => {
    if (!(configArray instanceof Object)) error("Config is not an object. Maybe you seriously messed something up?")
    if (!(configArray instanceof Array)) configArray = [configArray]
    configArray.forEach((config, i) => {
        checkConf(config, i)
    })
    return configArray;
}