'use strict';

const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');

const LIMITS = Object.freeze({
    cooldownMs: 8000,
    minDelayMs: 2000,
    maxDelayMs: 6000,
    groupCap: 20,
    groupWindowMs: 10 * 60 * 1000,
    duplicateWindowMs: 5 * 60 * 1000,
    maxQueue: 100,
});

function hash(value) {
    return createHash('sha256').update(value).digest('hex');
}

function bodyKey(body) {
    return hash(body.trim().replace(/\s+/g, ' ').toLowerCase());
}

function validTime(time) {
    return Number.isFinite(time) && time >= 0;
}

function validateState(state) {
    if (!state || state.version !== 1 || !validTime(state.lastSentAt) ||
        !state.groups || typeof state.groups !== 'object' || Array.isArray(state.groups)) {
        throw new Error('Invalid rate-limit state');
    }
    for (const [id, group] of Object.entries(state.groups)) {
        if (!id.endsWith('@g.us') || !group || !Array.isArray(group.sent) ||
            !group.sent.every(validTime) || !validTime(group.pausedUntil) ||
            !Number.isSafeInteger(group.templateIndex) || group.templateIndex < 0 ||
            !Array.isArray(group.recent) || !group.recent.every((item) => item &&
                validTime(item.at) && typeof item.id === 'string' &&
                Array.isArray(item.bodies) && item.bodies.every((body) => /^[a-f0-9]{64}$/.test(body)))) {
            throw new Error(`Invalid rate-limit state for ${id}`);
        }
    }
}

class RateLimiter {
    constructor(filename = path.join(__dirname, '..', 'data', 'state.json'), now = Date.now) {
        this.filename = filename;
        this.now = now;
        this.state = { version: 1, lastSentAt: 0, groups: {} };
        if (fs.existsSync(filename)) {
            try {
                this.state = JSON.parse(fs.readFileSync(filename, 'utf8'));
                validateState(this.state);
            } catch (err) {
                throw new Error(`Cannot load ${filename}: ${err.message}. Repair the state before restarting.`);
            }
        }
    }

    group(id) {
        const group = this.state.groups[id] ??= {
            sent: [], recent: [], pausedUntil: 0, templateIndex: 0,
        };
        const now = this.now();
        group.sent = group.sent.filter((at) => at > now - LIMITS.groupWindowMs);
        group.recent = group.recent.filter((entry) => entry.at > now - LIMITS.groupWindowMs);
        return group;
    }

    check(id, messageId, body) {
        const group = this.group(id);
        const now = this.now();
        if (group.pausedUntil > now) return { allowed: false, reason: 'group paused' };
        if (group.recent.some((entry) => entry.id === messageId)) {
            return { allowed: false, reason: 'duplicate message ID' };
        }
        const key = body.trim() ? bodyKey(body) : null;
        if (key && group.recent.some((entry) => entry.at > now - LIMITS.duplicateWindowMs &&
            entry.bodies.includes(key))) {
            return { allowed: false, reason: 'duplicate body or echoed reply' };
        }
        if (group.sent.length >= LIMITS.groupCap) {
            group.pausedUntil = Math.min(...group.sent) + LIMITS.groupWindowMs;
            this.save();
            return { allowed: false, reason: 'group cap reached; automatically paused' };
        }
        return { allowed: true };
    }

    delay(random = Math.random) {
        const jitter = LIMITS.minDelayMs + Math.floor(random() *
            (LIMITS.maxDelayMs - LIMITS.minDelayMs + 1));
        const cooldown = this.state.lastSentAt ?
            this.state.lastSentAt + LIMITS.cooldownMs - this.now() : 0;
        return Math.max(jitter, cooldown);
    }

    templateIndex(id) {
        return this.group(id).templateIndex;
    }

    reserve(id, messageId, body, replyBody) {
        const group = this.group(id);
        const now = this.now();
        this.state.lastSentAt = now;
        group.sent.push(now);
        group.recent.push({ at: now, id: messageId, bodies: [body, replyBody]
            .filter((text) => text.trim()).map(bodyKey) });
        group.templateIndex++;
        // Persist BEFORE sending. An uncertain network error must not cause a
        // retry that double-posts or resets the budget after a crash.
        this.save();
    }

    save() {
        fs.mkdirSync(path.dirname(this.filename), { recursive: true });
        const temporary = `${this.filename}.${process.pid}.tmp`;
        try {
            fs.writeFileSync(temporary, JSON.stringify(this.state, null, 2) + '\n');
            fs.renameSync(temporary, this.filename);
        } finally {
            if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
        }
    }
}

module.exports = { RateLimiter, LIMITS };
