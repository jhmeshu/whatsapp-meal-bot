'use strict';

const bot = require('./bot.json');

function bool(value, fallback) {
    if (value === undefined || value === '') return fallback;
    return /^(1|true|yes|on)$/i.test(String(value));
}

const config = {
    deviceName: process.env.DEVICE_NAME || bot.deviceName,
    browserName: process.env.BROWSER_NAME || bot.browserName,
    dataPath: process.env.DATA_PATH || bot.dataPath,
    headless: bool(process.env.HEADLESS, bot.headless),
    enabled: bot.enabled ?? true,
    allowedGroups: bot.allowedGroups ?? [],
    ignoreNonText: bot.ignoreNonText ?? true,
    ignoreEphemeral: bot.ignoreEphemeral ?? true,
    ignoreEmpty: bot.ignoreEmpty ?? true,

    /**
     * WhatsApp Web version to pin. `null` means "whatever is currently live".
     *
     * Once the bot is running reliably, set this to the version reported by
     * client.getWWebVersion() so a WhatsApp-side release cannot silently break
     * the injected selectors.
     */
    webVersion: bot.webVersion || null,
};

const VALID_BROWSERS = ['Chrome', 'Firefox', 'IE', 'Opera', 'Safari', 'Edge'];

function validate() {
    const problems = [];

    if (!VALID_BROWSERS.includes(config.browserName)) {
        problems.push(
            `browserName "${config.browserName}" is not one of: ${VALID_BROWSERS.join(', ')}`
        );
    }
    if (typeof config.deviceName !== 'string' || !config.deviceName.trim()) {
        problems.push('deviceName must not be empty');
    }

    for (const key of ['enabled', 'ignoreNonText', 'ignoreEphemeral', 'ignoreEmpty']) {
        if (typeof config[key] !== 'boolean') problems.push(`${key} must be true or false`);
    }
    if (!Array.isArray(config.allowedGroups) ||
        config.allowedGroups.some((id) => typeof id !== 'string' || !/^\d+(?:-\d+)?@g\.us$/.test(id))) {
        problems.push('allowedGroups must be an array of group IDs ending in @g.us');
    }

    if (problems.length) {
        throw new Error(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
    }
}

module.exports = { config, validate };
