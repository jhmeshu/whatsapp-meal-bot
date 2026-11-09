'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Single-instance lock. Two bots sharing one WhatsApp session cause
 * CONFLICT + double replies, so only one process is allowed at a time.
 *
 * Lock file: <dataPath>/bot.lock with JSON {pid, hostname, startedAt}.
 * If the recorded PID is dead the lock is stale and is taken over.
 * If the PID is alive, acquiring throws so the second instance exits fast.
 *
 * @param {string} dataPath - configured session data directory
 * @returns {{release: Function, file: string}} release removes the lock if owned
 */
function acquireLock(dataPath) {
    const dir = path.resolve(dataPath || './.wwebjs_auth/');
    const file = path.join(dir, 'bot.lock');

    // In test harnesses process.pid/kill may be faked; skip locking there.
    if (typeof process.pid !== 'number' || typeof process.kill !== 'function') {
        return { release() {}, file };
    }

    fs.mkdirSync(dir, { recursive: true });

    const payload = JSON.stringify({
        pid: process.pid,
        hostname: os.hostname(),
        startedAt: new Date().toISOString(),
    }) + '\n';

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            fs.writeFileSync(file, payload, { flag: 'wx' });
            return {
                file,
                release() {
                    try {
                        const current = JSON.parse(fs.readFileSync(file, 'utf8'));
                        if (current.pid === process.pid) fs.unlinkSync(file);
                    } catch {
                        // Lock already gone or unreadable; nothing to release.
                    }
                },
            };
        } catch (err) {
            if (err.code !== 'EEXIST') throw err;
            // Lock exists. Check if owner is still alive.
            let owner = null;
            try {
                owner = JSON.parse(fs.readFileSync(file, 'utf8'));
            } catch {
                owner = null;
            }
            let alive = false;
            if (owner && typeof owner.pid === 'number' && owner.pid !== process.pid) {
                try {
                    process.kill(owner.pid, 0);
                    alive = true; // signal 0 only checks existence
                } catch (killErr) {
                    alive = killErr.code === 'EPERM'; // exists, no permission
                }
            } else if (owner && owner.pid === process.pid) {
                alive = true;
            }
            if (alive) {
                throw new Error(
                    `Another bot instance is already running (PID ${owner.pid}, ` +
                        `host ${owner.hostname || '?'}). Stop it before starting again. ` +
                        `(Lock file: ${file})`
                );
            }
            // Stale lock (dead PID or corrupt). Remove and retry once.
            try {
                fs.unlinkSync(file);
            } catch (unlinkErr) {
                if (unlinkErr.code !== 'ENOENT') throw unlinkErr;
            }
            if (attempt === 1) {
                throw new Error(`Could not acquire bot lock at ${file}`);
            }
        }
    }
    return { release() {}, file };
}

module.exports = { acquireLock };
