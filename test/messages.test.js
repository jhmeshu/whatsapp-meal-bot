'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');
const { shouldIgnore } = require('../src/filters');
const { buildReply, loadTemplates } = require('../src/reply');
const { RateLimiter, LIMITS } = require('../src/ratelimit');
const { attachMessageHandlers } = require('../src/events');

const groupId = '123456789@g.us';
const otherGroupId = '987654321@g.us';
const config = {
    enabled: true, allowedGroups: [groupId],
    ignoreNonText: true, ignoreEphemeral: true, ignoreEmpty: true,
};
const chat = { isGroup: true, name: 'Meals', id: { _serialized: groupId } };

function message(id = 'one', overrides = {}) {
    return {
        id: { _serialized: id, fromMe: false },
        from: groupId, fromMe: false, type: 'chat', body: `Message ${id}`,
        author: '15551234567@c.us', timestamp: 1700000000,
        getChat: async () => chat,
        getContact: async () => ({ pushname: 'Sam' }),
        ...overrides,
    };
}

function directory(t) {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'meal-bot-messages-'));
    t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
    return folder;
}

function fixture(t, settings = {}) {
    let clock = 1700000000000;
    const statePath = path.join(directory(t), 'state.json');
    const now = () => clock;
    const limiter = new RateLimiter(statePath, now);
    const client = new EventEmitter();
    const sends = [];
    const delays = [];
    const errors = [];
    const warnings = [];
    client.getChats = async () => [chat];
    client.sendMessage = async (...args) => {
        sends.push({ args, at: now() });
        return { id: { _serialized: `reply-${sends.length}` } };
    };
    const handlers = attachMessageHandlers(client, { ...config, ...settings.config }, {
        logger: {
            info() {}, debug() {},
            error: (...args) => errors.push(args), warn: (...args) => warnings.push(args),
        },
        limiter, now, random: () => 0,
        sleep: async (ms) => { delays.push(ms); clock += ms; },
        buildReply: async (msg) => ({ text: `Received: ${msg.body}`, name: 'test' }),
        ...settings.options,
    });
    t.after(() => handlers.stop());
    client.emit('ready');
    return {
        client, handlers, sends, delays, errors, warnings, limiter, statePath, now,
        advance: (ms) => { clock += ms; },
        receive: (msg) => client.emit('message', msg),
    };
}

test('only eligible messages in explicitly allowed groups pass the filters', () => {
    assert.equal(shouldIgnore(message(), chat, config), false);
    const ignored = [
        { fromMe: true }, { id: { fromMe: true } },
        { isStatus: true }, { broadcast: true }, { from: 'status@broadcast' },
        { type: 'notify' }, { type: 'gp2' }, { type: 'group_notification' },
        { type: 'ciphertext' }, { type: 'reaction' }, { type: 'revoked' },
        { type: 'image', body: 'caption' }, { type: 'poll_creation' },
        { isEphemeral: true }, { body: '' }, { body: ' \n ' },
    ];
    for (const overrides of ignored) {
        assert.equal(shouldIgnore(message('one', overrides), chat, config), true,
            JSON.stringify(overrides));
    }
    assert.equal(shouldIgnore(message(), { ...chat, isGroup: false }, config), true);
    assert.equal(shouldIgnore(message(), chat, { ...config, allowedGroups: [] }), true);
    assert.equal(shouldIgnore(message(), chat, { ...config, enabled: false }), true);
    const mediaConfig = { ...config, ignoreNonText: false, ignoreEmpty: false, ignoreEphemeral: false };
    assert.equal(shouldIgnore(message('one', { type: 'image', body: '', isEphemeral: true }),
        chat, mediaConfig), false);
    assert.equal(shouldIgnore(message('one', { type: 'notify' }), chat, mediaConfig), true);
});

test('templates rotate, expand in one pass, and reload saved edits without restart', async (t) => {
    const filename = path.join(directory(t), 'messages.json');
    const write = (templates) => fs.writeFileSync(filename, JSON.stringify({ templates }));
    write([
        { name: 'first', text: '{author}|{group}|{body}|{time}' },
        { name: 'second', text: 'Second: {body}' },
    ]);
    const msg = message('one', { body: 'Literal {author} and $&' });
    const first = await buildReply(msg, chat, 0, filename);
    assert.match(first.text, /^Sam\|Meals\|Literal \{author\} and \$&\|\d{2}:\d{2}:\d{2}$/);
    assert.equal((await buildReply(msg, chat, 1, filename)).name, 'second');
    assert.equal((await buildReply(msg, chat, 2, filename)).name, 'first');
    write([{ name: 'edited', text: 'New reply: {body}' }]);
    assert.equal((await buildReply(msg, chat, 2, filename)).text, 'New reply: Literal {author} and $&');
    write([{ name: 'fallback', text: 'Hello {author}' }]);
    msg.getContact = async () => { throw new Error('contact unavailable'); };
    assert.equal((await buildReply(msg, chat, 0, filename)).text, 'Hello 15551234567');
});

test('invalid or empty templates fail without sending', async (t) => {
    const filename = path.join(directory(t), 'messages.json');
    for (const value of ['{', '{}', '{"templates":[]}', '{"templates":[{"name":"x","text":" "}]}',
        '{"templates":[{"name":"x","text":"a"},{"name":"x","text":"b"}]}']) {
        fs.writeFileSync(filename, value);
        assert.throws(() => loadTemplates(filename));
    }
    const f = fixture(t, { options: { buildReply: async () => loadTemplates(filename) } });
    f.receive(message());
    await f.handlers.whenIdle();
    assert.equal(f.sends.length, 0);
    assert.equal(f.errors.length, 1);
});

test('concurrent incoming messages send serially as plain text with global cooldown', async (t) => {
    const f = fixture(t, { config: { allowedGroups: [groupId, otherGroupId] } });
    const secondChat = { ...chat, id: { _serialized: otherGroupId } };
    f.receive(message('one'));
    f.receive(message('two', { from: otherGroupId, getChat: async () => secondChat }));
    f.receive(message('three'));
    await f.handlers.whenIdle();
    assert.deepEqual(f.delays, [2000, 8000, 8000]);
    assert.deepEqual(f.sends.map(({ args }) => args), [
        [groupId, 'Received: Message one', { sendSeen: false }],
        [otherGroupId, 'Received: Message two', { sendSeen: false }],
        [groupId, 'Received: Message three', { sendSeen: false }],
    ]);
    assert.ok(f.sends.slice(1).every((send, i) => send.at - f.sends[i].at >= LIMITS.cooldownMs));
});

test('duplicate IDs, normalized duplicate bodies, echoed replies, and own messages are suppressed', async (t) => {
    const f = fixture(t);
    f.receive(message('one'));
    f.receive(message('one'));
    f.receive(message('duplicate-body', { body: '  MESSAGE   one  ' }));
    f.receive(message('echo', { body: 'Received: Message one' }));
    f.receive(message('own', { fromMe: true }));
    await f.handlers.whenIdle();
    assert.equal(f.sends.length, 1);
    f.advance(LIMITS.duplicateWindowMs + 1);
    f.receive(message('later', { body: 'Message one', timestamp: f.now() / 1000 }));
    await f.handlers.whenIdle();
    assert.equal(f.sends.length, 2);
});

test('a group is paused at 20 replies and resumes when the rolling window expires', async (t) => {
    const f = fixture(t);
    for (let i = 0; i < 22; i++) f.receive(message(`unique-${i}`));
    await f.handlers.whenIdle();
    assert.equal(f.sends.length, LIMITS.groupCap);
    assert.ok(f.warnings.some((entry) => entry[0].includes('automatically paused')));
    const restored = new RateLimiter(f.statePath, f.now);
    assert.equal(restored.check(groupId, 'new', 'new').allowed, false);
    f.advance(LIMITS.groupWindowMs + 1);
    f.receive(message('after-pause', { timestamp: f.now() / 1000 }));
    await f.handlers.whenIdle();
    assert.equal(f.sends.length, LIMITS.groupCap + 1);
});

test('rate budgets, deduplication, and template position survive process restarts', (t) => {
    const f = fixture(t);
    f.limiter.reserve(groupId, 'message-one', 'hello', 'acknowledged');
    const restored = new RateLimiter(f.statePath, f.now);
    assert.equal(restored.check(groupId, 'message-one', 'different').allowed, false);
    assert.equal(restored.check(groupId, 'another-id', 'hello').allowed, false);
    assert.equal(restored.check(groupId, 'echo', 'acknowledged').allowed, false);
    assert.equal(restored.delay(() => 0), 8000);
    assert.equal(restored.templateIndex(groupId), 1);
    assert.equal(restored.state.groups[groupId].sent.length, 1);
    assert.deepEqual(fs.readdirSync(path.dirname(f.statePath)), ['state.json']);
    assert.ok(!fs.readFileSync(f.statePath, 'utf8').includes('hello'));
});

test('uncertain send failures consume budget and are never automatically retried', async (t) => {
    const f = fixture(t);
    let attempts = 0;
    f.client.sendMessage = async () => { attempts++; throw new Error('network timeout after send'); };
    f.receive(message('one'));
    f.receive(message('one'));
    await f.handlers.whenIdle();
    assert.equal(attempts, 1);
    assert.equal(f.errors.length, 1);
    const restored = new RateLimiter(f.statePath, f.now);
    assert.equal(restored.check(groupId, 'one', 'Message one').allowed, false);
});

test('corrupt persisted state fails closed', (t) => {
    const filename = path.join(directory(t), 'state.json');
    for (const content of ['{', '{}', '{"version":1,"lastSentAt":0,"groups":{"x@g.us":{}}}']) {
        fs.writeFileSync(filename, content);
        assert.throws(() => new RateLimiter(filename), /Repair the state before restarting/);
    }
});

test('state write failure prevents the network send', async (t) => {
    const f = fixture(t);
    fs.mkdirSync(f.statePath);
    f.receive(message());
    await f.handlers.whenIdle();
    assert.equal(f.sends.length, 0);
    assert.equal(f.errors.length, 1);
});

test('disabled or empty allowlists never read chats or send messages', async (t) => {
    for (const settings of [{ enabled: false }, { allowedGroups: [] }]) {
        const f = fixture(t, { config: settings });
        f.receive(message('one', { getChat() { throw new Error('must not be read'); } }));
        await f.handlers.whenIdle();
        assert.equal(f.sends.length, 0);
        assert.equal(f.errors.length, 0);
    }
});

test('messages received before ready and historical sync messages are ignored', async (t) => {
    const f = fixture(t);
    f.receive(message('history', { timestamp: 1699999999 }));
    f.receive(message('future', { timestamp: 1700000061 }));
    f.client.emit('disconnected', 'TIMEOUT');
    f.receive(message('offline'));
    f.advance(10000);
    f.client.emit('ready');
    f.receive(message('synced-old'));
    f.receive(message('new', { timestamp: f.now() / 1000 }));
    await f.handlers.whenIdle();
    assert.equal(f.sends.length, 1);
    assert.equal(f.sends[0].args[1], 'Received: Message new');
});

test('disconnect and fatal states invalidate queued replies, including after reconnect', async (t) => {
    for (const event of [['disconnected', 'TIMEOUT'], ['change_state', 'TOS_BLOCK'], ['auth_failure', 'bad']]) {
        let release;
        const f = fixture(t, { options: { sleep: () => new Promise((resolve) => { release = resolve; }) } });
        f.receive(message('one'));
        f.receive(message('two'));
        await new Promise(setImmediate);
        f.client.emit(...event);
        f.client.emit('ready');
        release();
        await f.handlers.whenIdle();
        assert.equal(f.sends.length, 0);
    }
});

test('shutdown aborts an active wait and detaches message listeners', async (t) => {
    const f = fixture(t, { options: { sleep: undefined } });
    f.receive(message());
    await new Promise(setImmediate);
    f.handlers.stop();
    await f.handlers.whenIdle();
    assert.equal(f.sends.length, 0);
    assert.equal(f.client.listenerCount('message'), 0);
    assert.equal(f.errors.length, 0);
});

test('floods cannot create an unbounded reply queue', async (t) => {
    const f = fixture(t);
    for (let i = 0; i < LIMITS.maxQueue + 10; i++) f.receive(message(`flood-${i}`));
    await f.handlers.whenIdle();
    assert.equal(f.warnings.filter((entry) => entry[0].includes('queue is full')).length, 10);
    assert.equal(f.sends.length, LIMITS.groupCap);
});

test('one paused group does not stop another allowed group', async (t) => {
    const f = fixture(t, { config: { allowedGroups: [groupId, otherGroupId] } });
    for (let i = 0; i < LIMITS.groupCap + 1; i++) f.receive(message(`first-group-${i}`));
    const secondChat = { ...chat, id: { _serialized: otherGroupId } };
    f.receive(message('second-group', { from: otherGroupId, getChat: async () => secondChat }));
    await f.handlers.whenIdle();
    assert.equal(f.sends.length, LIMITS.groupCap + 1);
    assert.equal(f.sends.at(-1).args[0], otherGroupId);
});

test('a failed chat lookup does not poison the serialized queue', async (t) => {
    const f = fixture(t);
    f.receive(message('bad', { getChat: async () => { throw new Error('chat unavailable'); } }));
    f.receive(message('good'));
    await f.handlers.whenIdle();
    assert.equal(f.errors.length, 1);
    assert.equal(f.sends.length, 1);
    assert.equal(f.sends[0].args[1], 'Received: Message good');
});

test('duplicate queued IDs cannot post again after a long backlog', async (t) => {
    let release;
    const f = fixture(t, { options: { sleep: () => new Promise((resolve) => { release = resolve; }) } });
    f.receive(message('one'));
    await new Promise(setImmediate);
    f.advance(LIMITS.groupWindowMs + 1);
    f.receive(message('one'));
    release();
    await f.handlers.whenIdle();
    assert.equal(f.sends.length, 1);
});
