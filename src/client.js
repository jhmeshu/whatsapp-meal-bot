'use strict';

const { Client, LocalAuth } = require('whatsapp-web.js');
const os = require('os');

const { resolveChromePath } = require('./chrome');
const { SESSION_CLIENT_ID } = require('./session');
const logger = require('./logger');

/**
 * Builds the WhatsApp Web client.
 *
 * @param {object} config - resolved config from ../config
 * @returns {import('whatsapp-web.js').Client}
 */
function createClient(config) {
    const executablePath = resolveChromePath(logger);

    const client = new Client({
        // Persist the session so we only ever scan a QR code once.
        // LocalAuth also gives us an isolated Chrome profile, which means the bot
        // cannot collide with (or read from) your everyday Chrome profile.
        authStrategy: new LocalAuth({
            clientId: SESSION_CLIENT_ID,
            dataPath: config.dataPath,
            // Recover from remote-logout / session expiry instead of staying
            // in a broken authenticated-but-dead state until a manual reset.
            restartOnAuthFail: true,
        }),

        // Makes this recognisable under Settings > Linked devices, and lets an
        // account owner revoke it by name if it ever misbehaves.
        deviceName: config.deviceName,
        browserName: config.browserName,

        puppeteer: {
            executablePath,
            headless: config.headless,
            // Respect the real window size instead of Puppeteer's 800x600 default.
            defaultViewport: null,
            // src/index.js owns SIGINT/SIGTERM and calls client.destroy().
            // Puppeteer's default SIGINT handler would otherwise race that
            // cleanup and can leave a zombie Chrome process behind.
            handleSIGINT: false,
            args: [
                '--start-maximized',
                '--disable-dev-shm-usage',
                ...(os.platform() === 'linux'
                    ? // Chrome refuses to launch as root without these.
                        ['--no-sandbox', '--disable-setuid-sandbox']
                    : []),
            ],
        },

        // Pinning the web version stops a WhatsApp-side release from silently
        // breaking the injected selectors. null = track the live version.
        webVersion: config.webVersion || undefined,
    });

    logger.info(
        `Client created (device="${config.deviceName}", headless=${config.headless}, ` +
            `session="${config.dataPath}")`
    );

    return client;
}

module.exports = { createClient };
