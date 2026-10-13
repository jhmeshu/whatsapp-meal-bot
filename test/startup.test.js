'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const logger = { info() {}, warn() {}, error() {}, debug() {} };

function loadModule(relativePath, mocks = {}, globals = {}) {
    const filename = path.join(root, relativePath);
    const realRequire = createRequire(filename);
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
        module,
        require: (name) => name in mocks ? mocks[name] : realRequire(name),
        console: { log() {}, error() {} },
        process,
        ...globals,
    }, { filename });
    return module.exports;
}

for (const chromePath of [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Users\\Test User\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
    'D:\\Custom Chrome\\chrome.exe',
]) {
    test(`detects Windows Chrome at ${chromePath}`, () => {
        const env = { LOCALAPPDATA: 'C:\\Users\\Test User\\AppData\\Local' };
        if (chromePath.startsWith('D:')) env.CHROME_PATH = chromePath;
        const { resolveChromePath } = loadModule('src/chrome.js', {
            fs: { existsSync: (candidate) => candidate === chromePath },
            os: { platform: () => 'win32' },
            path: path.win32,
        }, { process: { env } });
        assert.equal(resolveChromePath(logger), chromePath);
    });
}

function authFixture() {
    const timers = new Map();
    const delays = [];
    let nextId = 0;
    const client = new EventEmitter();
    client.destroy = async () => {};
    client.initialize = async () => {};
    client.info = { pushname: 'Test', wid: { user: '123' } };
    client.getWWebVersion = async () => 'test';
    const { attachAuthHandlers, FATAL_STATES } = loadModule('src/auth.js', {
        './logger': logger,
        'qrcode-terminal': { generate() {} },
    }, {
        setTimeout(callback, delay) {
            delays.push(delay);
            timers.set(++nextId, callback);
            return nextId;
        },
        clearTimeout(id) { timers.delete(id); },
    });
    const stop = attachAuthHandlers(client);
    return {
        client, timers, delays, stop, FATAL_STATES,
        async runNext() {
            assert.ok(timers.size, 'a reconnect should be scheduled');
            const [id, callback] = timers.entries().next().value;
            timers.delete(id);
            await callback();
        },
    };
}

test('fatal states and logout never reconnect, including after a pending retry', () => {
    const { FATAL_STATES } = authFixture();
    for (const reason of [...FATAL_STATES, 'LOGOUT']) {
        for (const pending of [false, true]) {
            const f = authFixture();
            if (pending) f.client.emit('disconnected', 'CONFLICT');
            f.client.emit('disconnected', reason);
            f.client.emit('disconnected', 'CONFLICT');
            assert.equal(f.timers.size, 0, reason);
        }
    }
});

test('fatal change_state cancels pending retries even before disconnected arrives', () => {
    const f = authFixture();
    f.client.emit('disconnected', 'CONFLICT');
    f.client.emit('change_state', 'TOS_BLOCK');
    assert.equal(f.timers.size, 0);
    f.client.emit('disconnected', 'TOS_BLOCK');
    assert.equal(f.timers.size, 0);
});

test('failed reconnects retry five times with backoff and no duplicate timers', async () => {
    const f = authFixture();
    let attempts = 0;
    let destroys = 0;
    f.client.destroy = async () => { destroys++; };
    f.client.initialize = async () => {
        attempts++;
        // A QR event or repeated disconnect must not defeat the retry budget.
        f.client.emit('qr', 'test');
        f.client.emit('disconnected', 'CONFLICT');
        throw new Error('temporary navigation failure');
    };
    f.client.emit('disconnected', 'CONFLICT');
    f.client.emit('disconnected', 'CONFLICT');
    for (let i = 0; i < 5; i++) {
        assert.equal(f.timers.size, 1);
        await f.runNext();
    }
    assert.equal(attempts, 5);
    assert.equal(destroys, 5);
    assert.deepEqual(f.delays, [5000, 10000, 15000, 20000, 25000]);
    assert.equal(f.timers.size, 0);
    f.client.emit('disconnected', 'CONFLICT');
    assert.equal(f.timers.size, 0);
});

test('a successful ready event restores the retry budget', async () => {
    const f = authFixture();
    let attempts = 0;
    f.client.initialize = async () => {
        if (++attempts === 1) throw new Error('temporary failure');
        f.client.emit('ready');
    };
    f.client.emit('disconnected', 'CONFLICT');
    await f.runNext();
    await f.runNext();
    assert.equal(f.timers.size, 0);
    f.client.emit('disconnected', 'CONFLICT');
    assert.deepEqual(f.delays, [5000, 10000, 5000]);
});

test('stopping reconnection cancels timers and prevents initialize after cleanup', async () => {
    const f = authFixture();
    let attempts = 0;
    f.client.initialize = async () => { attempts++; };
    f.client.destroy = async () => { f.stop(); };
    f.client.emit('disconnected', 'CONFLICT');
    await f.runNext();
    f.client.emit('disconnected', 'CONFLICT');
    assert.equal(attempts, 0);
    assert.equal(f.timers.size, 0);
});

for (const cleanupFails of [false, true]) {
    test(`initial startup failure closes the client (cleanupFails=${cleanupFails})`, async () => {
        const calls = [];
        const fakeProcess = { on() {}, exit(code) { calls.push(`exit:${code}`); } };
        loadModule('src/index.js', {
            dotenv: { config() {} },
            '../config': { config: {}, validate() {} },
            './logger': logger,
            './auth': { attachAuthHandlers: () => () => calls.push('stop retries') },
            './client': { createClient: () => ({
                initialize: async () => { throw new Error('navigation failed'); },
                destroy: async () => {
                    calls.push('destroy');
                    if (cleanupFails) throw new Error('browser already closed');
                },
            }) },
        }, { process: fakeProcess });
        await new Promise(setImmediate);
        assert.equal(fakeProcess.exitCode, 1);
        assert.deepEqual(calls, ['stop retries', 'destroy']);
    });
}

for (const source of ['default', 'json', 'dotenv', 'environment']) {
    test(`session reset follows ${source} configuration and preserves sibling files`, (t) => {
        const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'meal-bot-reset-'));
        t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
        fs.mkdirSync(path.join(fixture, 'src'));
        fs.mkdirSync(path.join(fixture, 'config'));
        for (const file of ['src/reset-session.js', 'src/session.js', 'config/index.js']) {
            fs.copyFileSync(path.join(root, file), path.join(fixture, file));
        }
        const bot = JSON.parse(fs.readFileSync(path.join(root, 'config/bot.json'), 'utf8'));
        bot.dataPath = source === 'default' ? undefined : 'json sessions';
        fs.writeFileSync(path.join(fixture, 'config/bot.json'), JSON.stringify(bot));
        const env = { ...process.env, NODE_PATH: path.join(root, 'node_modules') };
        delete env.DATA_PATH;
        if (source === 'dotenv' || source === 'environment') {
            fs.writeFileSync(path.join(fixture, '.env'), 'DATA_PATH="dotenv sessions"\n');
        }
        if (source === 'environment') env.DATA_PATH = path.join(fixture, 'absolute sessions');
        const base = path.resolve(fixture, {
            default: '.wwebjs_auth', json: 'json sessions', dotenv: 'dotenv sessions',
            environment: env.DATA_PATH,
        }[source]);
        const profile = path.join(base, 'session-meal-bot');
        fs.mkdirSync(profile, { recursive: true });
        fs.writeFileSync(path.join(profile, 'login'), 'test');
        fs.writeFileSync(path.join(base, 'keep.txt'), 'keep');
        const run = () => spawnSync(process.execPath, ['src/reset-session.js'], {
            cwd: fixture, env, encoding: 'utf8',
        });
        const result = run();
        assert.equal(result.status, 0, result.stderr);
        assert.equal(fs.existsSync(profile), false);
        assert.equal(fs.readFileSync(path.join(base, 'keep.txt'), 'utf8'), 'keep');
        const again = run();
        assert.equal(again.status, 0, again.stderr);
        assert.match(again.stdout, /Nothing to reset/);
    });
}
