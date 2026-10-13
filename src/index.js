'use strict';

require('dotenv').config();

const { config, validate } = require('../config');
const { createClient } = require('./client');
const { attachAuthHandlers } = require('./auth');
const { attachMessageHandlers } = require('./events');
const { loadTemplates } = require('./reply');
const logger = require('./logger');

async function main() {
    validate();
    loadTemplates();

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
        }
    });

    const shutdown = async (signal) => {
        logger.info(`Received ${signal}, shutting down...`);
        stopReconnecting();
        messages.stop();
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
