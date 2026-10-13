'use strict';

require('dotenv').config();

const fs = require('fs');
const { config } = require('../config');
const { resolveSessionPath } = require('./session');

const sessionPath = resolveSessionPath(config.dataPath);

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
