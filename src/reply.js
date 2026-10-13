'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_MESSAGES_PATH = path.join(__dirname, '..', 'data', 'messages.json');

function loadTemplates(filename = DEFAULT_MESSAGES_PATH) {
    const { templates } = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (!Array.isArray(templates) || !templates.length) {
        throw new Error('messages.json must contain a nonempty templates array');
    }
    const names = new Set();
    for (const template of templates) {
        if (!template || typeof template.name !== 'string' || !template.name.trim() ||
            names.has(template.name) || typeof template.text !== 'string' || !template.text.trim()) {
            throw new Error('Each reply template needs a unique name and nonempty text');
        }
        names.add(template.name);
    }
    return templates;
}

async function buildReply(msg, chat, index, filename = DEFAULT_MESSAGES_PATH) {
    // Read every time: a saved edit takes effect on the next send, without restart.
    const templates = loadTemplates(filename);
    const template = templates[index % templates.length];
    let author = msg.author?.split('@')[0] || 'there';
    if (template.text.includes('{author}')) {
        try {
            const contact = await msg.getContact();
            author = contact.pushname || contact.name || contact.number || author;
        } catch {
            // A contact lookup failure must not prevent an otherwise valid reply.
        }
    }
    const values = {
        author,
        group: chat.name || chat.id._serialized,
        body: msg.body || '',
        time: new Date(msg.timestamp * 1000).toLocaleTimeString('en-GB', { hour12: false }),
    };
    // Single pass: placeholders in the sender's body are treated as literal text.
    const text = template.text.replace(/\{(author|group|body|time)\}/g, (_, key) => values[key]);
    if (!text.trim()) throw new Error('Rendered reply is empty');
    return { text, name: template.name };
}

module.exports = { buildReply, loadTemplates };
