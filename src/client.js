'use strict';

const { Client, LocalAuth } = require('whatsapp-web.js');

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
            args: ['--start-maximized'],
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
