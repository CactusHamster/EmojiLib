module.exports = async function (client, data) {
    //console.info(data, "\n" + "_".repeat(process.stdout.columns))
    client.user = data.user // Set the client's user data to the given user data

    client.guilds = new Map();
    client.emojis = new Map(); 
    
    const queue = []; setInterval(async () => { if (queue.length === 0) return; const task = queue.shift(); task.res(await client.api(task.url)) }, 250)
    function getEmojis(guildId) {
        return new Promise((res, rej) => {
            queue.push({
                url: `guilds/${guildId}/emojis`,
                res: res,
                rej: rej
            })
        })
    }
    let addEmoji = (emoji, guild) => {
        let id = guild.id ?? guild
        client.emojis.set(emoji.id, {
            name: emoji.name,
            animated: emoji.animated,
            id: emoji.id,
            guildId: id
        })
    }
    let fetchGuildEmoji = async (guild) => {
        const emojis = await getEmojis(guild.id)
        emojis.forEach(emoji => addEmoji(emoji, guild))
    }

    // If not lazy-loading guilds and emojis
    data.guilds.forEach(guild =>  client.guilds.set(guild.id, { id: guild.id }))
    data.guilds.forEach(async guild => fetchGuildEmoji(guild))

    let addGuild = (guild) => {
        client.guilds.set(guild.id, { id: guild.id })
        if (guild["unavailable"]) {
            fetchGuildEmoji(guild)
        } else {
            guild?.emojis?.forEach(emoji => {
                addEmoji(emoji, guild)
            })
        }
    }
    let removeGuild = (guild) => {
        client.guilds.delete(guild.id)
        client.emojis.forEach((emoji, id) => { if (emoji.guildId == guild.id) client.emojis.delete(id) })
    }
    client.on("guildCreate", guild => {
        addGuild(guild)
    })
    client.on("guildDelete", guild => removeGuild(guild))

    client.on("guildEmojisUpdate", (data) => {
        let guildid = data.guild_id
        const emojis = data.emojis
        client.emojis.forEach((emoji, key) => { if (emoji.guildId == guildid) client.emojis.delete(key) })
        emojis.forEach(emoji => addEmoji(emoji, guildid) )
    })
}