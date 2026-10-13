'use strict';

async function cachedGroups(client) {
    if (!client.pupPage) throw new Error('WhatsApp browser page is unavailable');
    // getChats() enriches every chat, including group participant metadata.
    // Names and IDs can be read without that network-dependent enrichment.
    return client.pupPage.evaluate(() => {
        const models = window.require('WAWebCollections').Chat.getModelsArray();
        return models.filter((chat) => chat.id?._serialized?.endsWith('@g.us'))
            .map((chat) => ({
                id: { _serialized: chat.id._serialized },
                name: chat.formattedTitle || chat.name || chat.id._serialized,
                isGroup: true,
            }));
    });
}

async function listGroups(client) {
    try {
        return await cachedGroups(client);
    } catch {
        // Retain the public API as a fallback if WhatsApp changes its cache API.
        return (await client.getChats()).filter((chat) => chat.isGroup);
    }
}

async function getGroupChat(client, msg) {
    try {
        const chat = await msg.getChat();
        if (chat) return chat;
        throw new Error('Message chat is unavailable');
    } catch (err) {
        try {
            const groups = await cachedGroups(client);
            const group = groups.find((chat) => chat.id._serialized === msg.from);
            if (group) return group;
        } catch {
            // Preserve the original lookup error if neither path works.
        }
        throw err;
    }
}

module.exports = { cachedGroups, listGroups, getGroupChat };
