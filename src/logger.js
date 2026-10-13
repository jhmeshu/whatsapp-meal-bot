'use strict';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;

function stamp() {
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function emit(level, args) {
    if (LEVELS[level] < threshold) return;
    const line = `[${stamp()}] ${level.toUpperCase().padEnd(5)}`;
    const sink = level === 'error' || level === 'warn' ? console.error : console.log;
    sink(line, ...args);
}

module.exports = {
    debug: (...a) => emit('debug', a),
    info: (...a) => emit('info', a),
    warn: (...a) => emit('warn', a),
    error: (...a) => emit('error', a),
};