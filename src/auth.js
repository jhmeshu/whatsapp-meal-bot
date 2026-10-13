'use strict';

const qrcode = require('qrcode-terminal');

const logger = require('./logger');

/** Max automatic re-initialisations before we stop and demand a human. */
const MAX_RESTARTS = 5;
const BASE_BACKOFF_MS = 5000;

/** WhatsApp states that mean "stop trying, a human has to intervene". */
const FATAL_STATES = new Set([
    'TOS_BLOCK',
    'SMB_TOS_BLOCK',
    'DEPRECATED_VERSION',
    'UNPAIRED',
    'UNPAIRED_IDLE',
]);

const RESTART_STATES = new Set(['CONFLICT', 'TIMEOUT', 'OPENING', 'UNLAUNCHED']);

/**
 * Wires the authentication and lifecycle events.
 *
 * @param {import('whatsapp-web.js').Client} client
 * @param {{ onReady?: Function }} [hooks]
 * @returns {Function} stops automatic reconnection and cancels pending retries
 */
function attachAuthHandlers(client, hooks = {}) {
    let restarts = 0;
    let restarting = false;
    let stopped = false;
    let restartTimer;

    function stopReconnecting() {
        stopped = true;
        clearTimeout(restartTimer);
    }

    function scheduleRestart() {
        if (stopped || restarting) return;
        if (restarts >= MAX_RESTARTS) {
            logger.error(`Already restarted ${MAX_RESTARTS} times. Giving up.`);
            return;
        }

        restarting = true;
        restarts += 1;
        const delay = BASE_BACKOFF_MS * restarts;
        logger.warn(`Restarting in ${delay / 1000}s (attempt ${restarts}/${MAX_RESTARTS})...`);

        restartTimer = setTimeout(async () => {
            let failed = false;
            try {
                await client.destroy();
                if (stopped) return;
                await client.initialize();
                logger.info('Re-initialised.');
            } catch (err) {
                failed = true;
                logger.error('Restart failed:', err.message);
            } finally {
                restarting = false;
            }
            if (failed) scheduleRestart();
        }, delay);
    }

    client.on('loading_screen', (percent, message) => {
        logger.debug(`Loading ${percent}% - ${message}`);
    });

    client.on('qr', (qr) => {
        console.log('\n=== Scan this QR code in WhatsApp ===');
        console.log('Phone > Settings > Linked devices > Link a device\n');
        qrcode.generate(qr, { small: true });
        console.log('');
    });

    client.on('code', (code) => {
        // Fires instead of `qr` when the client is configured to pair by phone
        // number rather than by QR scan.
        console.log(`\n=== Pairing code: ${code} ===`);
        console.log('Phone > Settings > Linked devices > Link a device\n');
    });

    client.on('authenticated', () => {
        logger.info('Authenticated with WhatsApp.');
    });

    client.on('auth_failure', (msg) => {
        logger.error('Authentication failed. The saved session may have been revoked.');
        logger.error(`Reason: ${msg}`);
        logger.error('Delete the session directory and restart to scan a fresh QR code.');
    });

    client.on('ready', async () => {
        restarts = 0;
        const info = client.info;
        logger.info('Client is ready.');
        logger.info(`Connected as ${info.pushname} (${info.wid.user})`);

        try {
            const version = await client.getWWebVersion();
            logger.info(`WhatsApp Web version: ${version}`);
            logger.info(
                `Tip: pin this in config/bot.json -> "webVersion": "${version}" ` +
                    'to stop a WhatsApp-side release from breaking the bot.'
            );
        } catch (err) {
            logger.warn(`Could not read WhatsApp Web version: ${err.message}`);
        }

        if (hooks.onReady) await hooks.onReady(client);
    });

    client.on('change_state', (state) => {
        if (FATAL_STATES.has(state)) {
            stopReconnecting();
            logger.error(`WhatsApp state: ${state} - this needs manual attention.`);
            logger.error('Check the phone for a "linked device" warning, then re-scan.');
            return;
        }
        logger.info(`WhatsApp state: ${state}`);
    });

    client.on('disconnected', (reason) => {
        logger.warn(`Disconnected: ${reason}`);

        if (FATAL_STATES.has(reason)) {
            stopReconnecting();
            logger.error(`WhatsApp state: ${reason} - this needs manual attention.`);
            return;
        }

        // An intentional logout is not a fault. Restarting here would immediately
        // re-prompt for a QR scan in a loop.
        if (reason === 'LOGOUT') {
            stopReconnecting();
            logger.warn('Logged out deliberately. Not restarting automatically.');
            logger.warn('Restart the bot and scan a QR code to link again.');
            return;
        }

        scheduleRestart();
    });

    return stopReconnecting;
}

module.exports = { attachAuthHandlers, FATAL_STATES, RESTART_STATES };
