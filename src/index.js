'use strict';

require('dotenv').config();

const { config, validate } = require('../config');
const { createClient } = require('./client');
const { attachAuthHandlers } = require('./auth');
const { attachMessageHandlers } = require('./events');
const { loadTemplates } = require('./reply');
const { acquireLock } = require('./lock');
const logger = require('./logger');

async function main() {
    validate();
    loadTemplates();

    const lock = acquireLock(config.dataPath);

    const client = createClient(config);

    const messages = attachMessageHandlers(client, config);
    const stopReconnecting = attachAuthHandlers(client);

    client.initialize().catch(async (err) => {
        logger.error('Failed to initialise client:', err.message);
        process.exitCode = 1;
        stopReconnecting();
        messages.stop();
        try {
            await client.destroy();
        } catch (cleanupError) {
            logger.error('Error cleaning up failed startup:', cleanupError.message);
        } finally {
            lock.release();
        }
        // If destroy() hangs (zombie Chrome), don't hang forever.
        // unref lets a clean exit happen naturally before the timer fires.
        if (typeof setTimeout === 'function') {
            const t = setTimeout(() => process.exit(1), 10000);
            if (t.unref) t.unref();
        }
    });

    let shuttingDown = false;
    const shutdown = async (signal) => {
        if (shuttingDown) {
            logger.warn('Second shutdown signal, forcing exit.');
            process.exit(1);
            return;
        }
        shuttingDown = true;
        logger.info(`Received ${signal}, shutting down...`);
        const force = typeof setTimeout === 'function' ? setTimeout(() => {
            logger.error('Shutdown timed out, forcing exit.');
            lock.release();
            process.exit(1);
        }, 10000) : null;
        if (force && force.unref) force.unref();
        stopReconnecting();
        messages.stop();
        try {
            await client.destroy();
        } catch (err) {
            logger.error('Error during shutdown:', err.message);
        } finally {
            lock.release();
        }
        if (force && typeof clearTimeout === 'function') clearTimeout(force);
        process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('uncaughtException', (err) => {
        logger.error('Uncaught exception:', err.message);
        logger.error('Shutting down to avoid a zombie Chrome process.');
        shutdown('uncaughtException');
    });
    process.on('unhandledRejection', (err) => {
        logger.error('Unhandled rejection:', err && err.message ? err.message : err);
    });
}

main().catch((err) => {
    logger.error('Fatal:', err.message);
    process.exit(1);
});
