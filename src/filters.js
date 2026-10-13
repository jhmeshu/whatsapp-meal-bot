'use strict';

// Explicit user-message types keep system notices out even with media enabled.
const USER_TYPES = new Set([
    'chat', 'audio', 'ptt', 'image', 'album', 'video', 'document', 'sticker',
    'location', 'vcard', 'multi_vcard', 'poll_creation', 'list_response',
    'buttons_response', 'template_button_reply', 'scheduled_event_creation',
]);

function shouldIgnore(msg, chat, config) {
    if (!config.enabled || msg.fromMe || msg.id?.fromMe) return true;
    if (msg.isStatus || msg.broadcast || msg.from === 'status@broadcast') return true;
    if (!chat?.isGroup || !config.allowedGroups.includes(chat.id?._serialized)) return true;
    if (msg.from !== chat.id._serialized) return true;
    if (!USER_TYPES.has(msg.type)) return true;
    if (config.ignoreNonText && msg.type !== 'chat') return true;
    if (config.ignoreEphemeral && msg.isEphemeral) return true;
    if (config.ignoreEmpty && !(msg.body || '').trim()) return true;
    return false;
}

module.exports = { shouldIgnore };
