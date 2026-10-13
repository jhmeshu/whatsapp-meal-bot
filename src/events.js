'use strict';

const { setTimeout: wait } = require('timers/promises');
const { shouldIgnore } = require('./filters');
const { buildReply } = require('./reply');
const { RateLimiter, LIMITS } = require('./ratelimit');
const { FATAL_STATES } = require('./auth');
const defaultLogger = require('./logger');

function attachMessageHandlers(client, config, options = {}) {
    const logger = options.logger || defaultLogger;
    const limiter = options.limiter || new RateLimiter();
    const now = options.now || Date.now;
    const sleep = options.sleep || ((ms, signal) => wait(ms, undefined, { signal }));
    const makeReply = options.buildReply || buildReply;
    let queue = Promise.resolve();
    let pending = 0;
    let active = false;
    let readySince = 0;
    let generation = 0;
    let controller = new AbortController();
    let stopped = false;
    const queuedIds = new Set();

    function deactivate() {
        active = false;
        generation++;
        controller.abort();
    }

    function isCurrent(epoch) {
        return !stopped && active && epoch === generation;
    }

    async function handle(msg, epoch, signal) {
        if (!isCurrent(epoch)) return;
        const chat = await msg.getChat();
        if (!isCurrent(epoch) || shouldIgnore(msg, chat, config)) return;
        const groupId = chat.id._serialized;
        const messageId = msg.id._serialized;
        const body = msg.body || '';
        const allowed = () => {
            const result = limiter.check(groupId, messageId, body);
            if (!result.allowed) {
                const log = result.reason.includes('cap reached') ? logger.warn : logger.debug;
                log(`Skipped ${groupId}: ${result.reason}`);
            }
            return result.allowed;
        };
        if (!allowed()) return;
        await sleep(limiter.delay(options.random), signal);
        if (!isCurrent(epoch)) return;
        const reply = await makeReply(msg, chat, limiter.templateIndex(groupId));
        if (!isCurrent(epoch) || !allowed()) return;
        limiter.reserve(groupId, messageId, body, reply.text);
        const sent = await client.sendMessage(groupId, reply.text, { sendSeen: false });
        if (!sent) throw new Error('WhatsApp did not confirm the send');
        logger.info(`Sent template "${reply.name}" to ${chat.name || groupId}`);
    }

    function onMessage(msg) {
        if (stopped || !active || !config.enabled || !config.allowedGroups.length ||
            msg.fromMe || msg.id?.fromMe || msg.isStatus || msg.broadcast ||
            !config.allowedGroups.includes(msg.from) || !msg.id?._serialized ||
            queuedIds.has(msg.id._serialized)) return;
        // Reconnect/login sync must never trigger a backlog of historical replies.
        if (!Number.isFinite(msg.timestamp) || msg.timestamp < readySince ||
            msg.timestamp * 1000 > now() + 60000) return;
        if (pending >= LIMITS.maxQueue) {
            logger.warn('Reply queue is full. Dropping incoming message.');
            return;
        }
        pending++;
        const messageId = msg.id._serialized;
        queuedIds.add(messageId);
        const epoch = generation;
        const signal = controller.signal;
        queue = queue.then(() => handle(msg, epoch, signal)).catch((err) => {
            if (err.name !== 'AbortError') logger.error('Message processing failed:', err.message);
        }).finally(() => {
            pending--;
            queuedIds.delete(messageId);
        });
    }

    function onReady() {
        if (stopped) return;
        deactivate();
        controller = new AbortController();
        readySince = Math.floor(now() / 1000);
        active = true;
        if (!config.enabled) logger.info('Auto-replies are disabled in config/bot.json.');
        else if (!config.allowedGroups.length) {
            logger.info('No groups enabled. Add group IDs to allowedGroups in config/bot.json and restart.');
        } else logger.info(`Auto-replies enabled for ${config.allowedGroups.length} group(s).`);
        // Discovery is read-only; no welcome messages are sent on startup.
        Promise.resolve().then(() => client.getChats()).then((chats) => {
            for (const chat of chats.filter((item) => item.isGroup)) {
                logger.info(`Group: ${chat.name} | ${chat.id._serialized}`);
            }
        }).catch((err) => logger.warn('Could not list groups:', err.message));
    }

    function onState(state) {
        if (FATAL_STATES.has(state)) deactivate();
    }

    client.on('message', onMessage);
    client.on('ready', onReady);
    client.on('disconnected', deactivate);
    client.on('change_state', onState);
    client.on('auth_failure', deactivate);

    return {
        whenIdle: () => queue,
        stop() {
            stopped = true;
            deactivate();
            client.removeListener('message', onMessage);
            client.removeListener('ready', onReady);
            client.removeListener('disconnected', deactivate);
            client.removeListener('change_state', onState);
            client.removeListener('auth_failure', deactivate);
        },
    };
}

module.exports = { attachMessageHandlers };
