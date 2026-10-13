'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const defaults = require('../config/bot.json');
const source = fs.readFileSync(path.join(__dirname, '..', 'config', 'index.js'), 'utf8');

function load(overrides) {
    const module = { exports: {} };
    vm.runInNewContext(source, {
        module, process: { env: {} },
        require: () => ({ ...defaults, ...overrides }),
    });
    return module.exports;
}

test('default and legacy configuration both disable replies through an empty allowlist', () => {
    for (const overrides of [{}, { allowedGroups: undefined, enabled: undefined }]) {
        const { config, validate } = load(overrides);
        assert.doesNotThrow(validate);
        assert.equal(config.allowedGroups.length, 0);
    }
});

test('invalid group IDs and non-boolean filter settings are rejected at startup', () => {
    for (const overrides of [
        { allowedGroups: '*' }, { allowedGroups: ['*'] }, { allowedGroups: ['person@c.us'] },
        { allowedGroups: [12] }, { enabled: 'false' }, { ignoreNonText: 'false' },
        { ignoreEphemeral: 0 }, { ignoreEmpty: 'true' }, { deviceName: 42 },
    ]) {
        assert.throws(load(overrides).validate, /Invalid configuration/);
    }
    assert.doesNotThrow(load({ allowedGroups: ['123456789@g.us', '123456789-987654321@g.us'] }).validate);
});
