'use strict';

/**
 * Locates a usable Google Chrome executable.
 *
 * Why this exists: Puppeteer ships its own Chromium build, but that build has no
 * H.264 / AAC support and is a common source of WhatsApp Web breakage. We always
 * drive a real Chrome install instead.
 *
 * Order of resolution:
 *   1. CHROME_PATH env var (explicit override)
 *   2. Well-known install locations for the current OS
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

// The upstream docs list the "(x86)" path as the default, but modern Chrome
// installs to "Program Files". Check both.
const WINDOWS_CANDIDATES = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

const DARWIN_CANDIDATES = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

const LINUX_CANDIDATES = [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
];

function windowsUserLocalCandidates() {
    const base = process.env.LOCALAPPDATA;
    if (!base) return [];
    return [path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe')];
}

function candidatesFor(platform) {
    switch (platform) {
        case 'win32':
            return [...WINDOWS_CANDIDATES, ...windowsUserLocalCandidates()];
        case 'darwin':
            return DARWIN_CANDIDATES;
        default:
            return LINUX_CANDIDATES;
    }
}

function notFoundMessage(platform, searched) {
    return [
        'Could not find a Google Chrome executable.',
        '',
        `Searched (${platform}):`,
        ...searched.map((p) => `  - ${p}`),
        '',
        'Fix this by setting CHROME_PATH in your .env file to the full path of your',
        'Chrome executable, for example:',
        '  CHROME_PATH=C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    ].join('\n');
}

/**
 * @returns {string} absolute path to a Chrome executable
 * @throws  {Error} if none can be found, with actionable guidance
 */
function resolveChromePath(logger) {
    const override = (process.env.CHROME_PATH || '').trim();

    if (override) {
        if (!fs.existsSync(override)) {
            throw new Error(
                `CHROME_PATH is set to "${override}" but no file exists there. ` +
                    'Check the path in your .env file.'
            );
        }
        logger.info(`Chrome path from CHROME_PATH: ${override}`);
        return override;
    }

    const searched = candidatesFor(os.platform());

    for (const candidate of searched) {
        if (fs.existsSync(candidate)) {
            logger.info(`Chrome auto-detected: ${candidate}`);
            return candidate;
        }
    }

    logger.debug(`Searched: ${searched.join(', ')}`);
    throw new Error(notFoundMessage(os.platform(), searched));
}

module.exports = { resolveChromePath };
