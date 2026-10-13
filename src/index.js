'use strict';

require('dotenv').config();

const { config, validate } = require('../config');
const { createClient } = require('./client');
const { attachAuthHandlers } = require('./auth');
const logger = require('./logger');

async function main() {
    validate();

    const client = createClient(config);

    // Message handling arrives in step 3/4 of PLAN.md. For now, log enough to
    // confirm the login path is healthy end to end.
    const stopReconnecting = attachAuthHandlers(client, {
        onReady: async () => {
            logger.info('Login path verified. Ready for step 3 (message listeners).');
        },
    });

    client.initialize().catch(async (err) => {
        logger.error('Failed to initialise client:', err.message);
        process.exitCode = 1;
        stopReconnecting();
        try {
            await client.destroy();
        } catch (cleanupError) {
            logger.error('Error cleaning up failed startup:', cleanupError.message);
        }
    });

    const shutdown = async (signal) => {
        logger.info(`Received ${signal}, shutting down...`);
        stopReconnecting();
        try {
            await client.destroy();
        } catch (err) {
            logger.error('Error during shutdown:', err.message);
        }
        process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
    logger.error('Fatal:', err.message);
    process.exit(1);
});
