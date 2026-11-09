'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const requested = (process.env.LOG_LEVEL || 'info').toLowerCase();
if (!(requested in LEVELS)) {
    console.error(`[WARN] Unknown LOG_LEVEL "${process.env.LOG_LEVEL}", falling back to "info".`);
}
const threshold = LEVELS[requested] ?? LEVELS.info;

// Opt-in file logging for Task Scheduler / background runs where the
// console is invisible. Set LOG_FILE=logs/bot.log in .env to enable.
// Console output is kept either way.
const logFile = (process.env.LOG_FILE || '').trim();
let logFileResolved = null;
let logFileFailed = false;
if (logFile) {
    try {
        logFileResolved = path.resolve(logFile);
        fs.mkdirSync(path.dirname(logFileResolved), { recursive: true });
        console.log(`File logging enabled: ${logFileResolved}`);
    } catch (err) {
        console.error(`[WARN] Could not init LOG_FILE "${logFile}": ${err.message}`);
        logFileResolved = null;
        logFileFailed = true;
    }
}

function stamp() {
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function toFile(level, args) {
    if (!logFileResolved || logFileFailed) return;
    try {
        const line = `[${stamp()}] ${level.toUpperCase().padEnd(5)} ${util.format(...args)}\n`;
        fs.appendFileSync(logFileResolved, line);
    } catch (err) {
        // Don't spam per line; warn once to console only.
        if (!logFileFailed) {
            logFileFailed = true;
            console.error(`[WARN] Log file write failed: ${err.message}`);
        }
    }
}

function emit(level, args) {
    if (LEVELS[level] < threshold) return;
    const line = `[${stamp()}] ${level.toUpperCase().padEnd(5)}`;
    const sink = level === 'error' || level === 'warn' ? console.error : console.log;
    sink(line, ...args);
    toFile(level, args);
}

module.exports = {
    debug: (...a) => emit('debug', a),
    info: (...a) => emit('info', a),
    warn: (...a) => emit('warn', a),
    error: (...a) => emit('error', a),
    _logFile: logFileResolved,
};
