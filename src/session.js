'use strict';

const path = require('path');

const SESSION_CLIENT_ID = 'meal-bot';

// Match LocalAuth's default data directory and profile naming.
function resolveSessionPath(dataPath) {
    return path.join(path.resolve(dataPath || './.wwebjs_auth/'), `session-${SESSION_CLIENT_ID}`);
}

module.exports = { SESSION_CLIENT_ID, resolveSessionPath };
