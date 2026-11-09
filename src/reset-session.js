'use strict';

require('dotenv').config();

const fs = require('fs');
const { config } = require('../config');
const { resolveSessionPath } = require('./session');

const sessionPath = resolveSessionPath(config.dataPath);

// Safety guard: a bad DATA_PATH (e.g. "/") must not point the recursive
// delete at a system directory. Only `session-meal-bot` under the configured
// data directory is ever removed, and never from a filesystem root.
const root = require('path').parse(sessionPath).root;
if (sessionPath === root || sessionPath.endsWith(`session-${require('./session').SESSION_CLIENT_ID}`) === false) {
    console.error(`Refusing to delete unexpected session path: ${sessionPath}`);
    process.exit(1);
}

try {
    if (fs.existsSync(sessionPath)) {
        console.log(`Deleting session: ${sessionPath}`);
        fs.rmSync(sessionPath, { recursive: true, force: true });
        console.log('Session cleared. Run START-HERE.bat to link again.');
    } else {
        console.log(`No session found at ${sessionPath}. Nothing to reset.`);
    }
} catch (err) {
    console.error(`Could not delete the session: ${err.message}`);
    console.error('Stop the bot with Ctrl+C first, then run RESET-SESSION.bat again.');
    process.exitCode = 1;
}
