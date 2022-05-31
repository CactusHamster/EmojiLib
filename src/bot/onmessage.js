const fs = require("fs"), PATH = require("path");
const { MessageAttachment } = require("discord.js")
const File = require("./file")
const https = require("https");
//const strDist = require("./levenshteinDistance")
const sharp = require("sharp");
const path = require("path");
const Calipers = require('calipers')('png', 'jpeg', 'webp', "gif", "svg");
let imagetypes = [".png",".jpg",".webp",".gif",".svg"]

let mkdir = (...paths) => paths.forEach(path => !fs.existsSync(path) ? fs.mkdirSync(path) : void(0))
let generateCache = () => mkdir("./cache", "./cache/images/")

let keyword = "match"
let escapeRegex = (t) => t.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')
let generateRegex = (pattern) => new RegExp(`(?<=${escapeRegex(pattern.slice(0, pattern.indexOf(keyword)))})[^/\\:*?\"<>| ]+(?=${escapeRegex(pattern.slice(pattern.indexOf(keyword) + keyword.length))})`, "");
let generateUnmatchingRegex = (pattern) => new RegExp(`${escapeRegex(pattern.slice(0, pattern.indexOf(keyword)))}[^/\\:*?\"<>| ]+${escapeRegex(pattern.slice(pattern.indexOf(keyword) + keyword.length))}`, "");
let getMatches = (pattern, string) => {
    let matches = []
    mpattern = generateRegex(pattern)
    dpattern = generateUnmatchingRegex(pattern)
    while (true) {
        if (!string) break;
        let matched = string.match(mpattern)
        if (!matched) break;
        matched = matched[0]
        matches.push(matched)
        string = string.replace(dpattern, "")
    }
    return matches;
}

let localCache;
try {
    localCache = require(__dirname + "/cache/urls.json")
} catch (e) {
    localCache = {}
}

// Calculates new image size, but keeps aspect ratio, like turning (1080, 540) to [48, 24]
let calculateAspectRatioFit = (srcWidth, srcHeight, maxWidth, maxHeight) => {
    let ratio = Math.min(maxWidth / srcWidth, maxHeight / srcHeight)
    return [srcWidth*ratio, srcHeight*ratio];
}

// could get <BIRB> from ./emojis/birbs/birb.png
function getFileByName (name, dir) {
    if (!name) return null;
    let matched;
    name = String(name)
    let cont = true;
    function ret (val) {
        cont = false;
        matched = val;
    }
    // Tests to run file through for matches, ordered by priority from greatest to least
    let tests = [
        //(path) => `${path.dir}/${path.name}`.endsWith(name),
        (path) => path.name == name || path.base == name, // Exact matches
        (path) => path.base.startsWith(name), // StartsWith() matches
        (path) => path.base.includes(name), // Includes() matches
        (path) => path.name.toLowerCase() == name.toLowerCase(), // lowercase exact matches
        (path) => path.base.toLowerCase().startsWith(name.toLowerCase()), // lowercase startsWith() matches,
        (path) => path.base.toLowerCase().includes(name.toLowerCase())
    ]
    let priority = tests.length - 1
    function recurse (path, matchLevel = 1) {
        if (!cont) return;
        const stats = fs.statSync(path)
        if (stats.isDirectory()) return fs.readdirSync(path).map(file => recurse(path + "/" + file, matchLevel));
        let data = PATH.parse(path)
        data.ext = data.ext.toLowerCase()
        if (!imagetypes.includes(data.ext)) return;
        for (let i = 0; i <= priority; i++) {
            if (!tests[i](data)) continue
            matched = data
            priority = i
            if (i == 0) cont = false
        }
    }
    recurse(dir)
    return matched;
}
let findFileMatch = (str, pattern, path) => getMatches(pattern, str).map(match => getFileByName(match, path))

module.exports = async function (msg, client, config) {
    let delet = false
    // Local file handling:
    let locals = [
        {
            enabled: config?.Emojis?.enabled && config?.Emojis?.local?.enabled,
            pattern: config?.Emojis?.local?.match,
            path: config?.Emojis?.local?.path,
            size: config?.Emojis?.size
        }/*, {
            pattern: config.stickerPattern.local,
            path: config.stickerPath,
            size: config.stickerSize
        }*/
    ]
    .map(opt => opt.enabled ? findFileMatch(msg.content, opt.pattern, opt.path).filter(e => e != undefined).map(file => {file.imgSize = opt.size; return file}) : void(0))
    .filter(e => typeof e != "undefined")
    .flat()

    locals.forEach(async file => {
        delet = true;
        let path = PATH.resolve(`${file.dir}/${file.base}`)
        
        // Cache sent url's
        if (localCache?.[path]?.[file.imgSize]) {
            try {
                client.send(msg.channel_id, localCache[path][file.imgSize]);
                return;
            } catch (e) {
                delete localCache[path][file.imgSize]
            }
        }

        let buffer;
        mkdir(`./cache/images/`, `./cache/images/${file.imgSize}`)
        if (fs.existsSync(`./cache/images/${file.imgSize}/${file.base}`)) buffer = fs.readFileSync(`./cache/images/${file.imgSize}/${file.base}`)
        else {
            const size = Object.values((await Calipers.measure(path)).pages[0])
            buffer = fs.readFileSync(path)
            if (size[0] != file.imgSize && size[1] != file.imgSize) {
                newSize = calculateAspectRatioFit(size[0], size[1], file.imgSize, file.imgSize).map(num => Math.round(num))
                let isGif = file.ext == ".gif"
                buffer = await sharp(buffer, {animated: isGif, pages: isGif ? -1 : 1, limitInputPixels: false})
                .resize(...newSize)
                .toBuffer()
                fs.writeFileSync(`./cache/images/${file.imgSize}/${file.base}`, buffer)
            }
        }
        const attach = new MessageAttachment(buffer, file.base.toString())

        // Cache sent url's
        if (!localCache[path]) localCache[path] = {}
        let sent = await client.send(msg.channel_id, new File(file.base.toString(), buffer))
        let cacheURL = sent.attachments[0].proxy_url ?? sent.attachments[0].url
        if (!cacheURL) return console.log(`Could not send file in msg [${send.id}].`)
        localCache[path][file.imgSize] = cacheURL
    });




    // Discord emoji handling
    let urls = [
        {
            pattern: config.Emojis.discord.match,
            type: "emojis",
            size: config.Emojis.size,
        }/*, {
            pattern: config.Stickers.discord.match,
            type: "stickers",
            size: config.Emojis.size,
        }*/
    ].map(opt => {
        return (msg.content.match(generateRegex(opt.pattern)) || []).map(match => {
            let cont = true;
            let sameGuild = false;
            let matched;
            let tests = [
                //(name, emoji) => (name == match) && msg.guild.id == emoji.guild.id,
                //(name, emoji) => name.startsWith(match) && msg.guild.id == emoji.guild.id,
                (name) => (name == match),
                (name) => name.startsWith(match),
                (name) => name.includes(match),
                (name) => name.toLowerCase() == match.toLowerCase(),
                (name) => name.toLowerCase().startsWith(match.toLowerCase()),
                (name) => name.toLowerCase().includes(match.toLowerCase())
            ]
            let priority = tests.length

            // Loop through emojis
            client[opt.type].forEach(emoji => {
                if (emoji.name == match && emoji.guildId == msg?.guild?.id && !emoji.animated) return sameGuild = true;
                if (!cont) return;
                for (let i = 0; i < priority; i++) {
                    if (!tests[i](emoji.name, emoji)) continue;
                    matched = emoji
                    priority = i
                    if (i == 0) cont = false
                }
            })
            if (!matched || sameGuild) return null;
            delet = true;
            //msg.channel.send(`https://cdn.discordapp.com/${opt.type}/${matched.id}.${matched.animated ? "gif" : "png"}?size=${opt.size}`)
            return `https://cdn.discordapp.com/${opt.type}/${matched.id}.${matched.animated ? "gif" : "png"}?size=${opt.size}`;
        })
    }).flat()
    urls.forEach(url => url ? client.send(msg.channel_id, url) : void(0))

    if (delet) {
        try {
            await client.api(`/channels/${msg.channel_id}/messages/${msg.id}`, "DELETE")
        } catch (e) {
            console.log(e)
        }
    }
}


function onExit (final) {
    console.log(final)
    generateCache()
    fs.writeFileSync("./cache/urls.json", JSON.stringify(localCache, null, "  "))
    process.exit()
}

[`SIGINT`, `SIGUSR1`, `SIGUSR2`, /*`uncaughtException`*/, `SIGTERM`].forEach((eventType) => {
    process.on(eventType, onExit.bind(null, eventType));
})