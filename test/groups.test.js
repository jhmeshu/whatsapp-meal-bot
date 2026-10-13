'use strict';

const assert = require('node:assert/strict');
const vm = require('node:vm');
const { test } = require('node:test');
const { cachedGroups, listGroups, getGroupChat } = require('../src/groups');

const groupId = '120363323786436543@g.us';

function browserClient(models) {
    return { pupPage: { async evaluate(callback) {
        const result = await vm.runInNewContext(`(${callback.toString()})()`, {
            window: { require(name) {
                assert.equal(name, 'WAWebCollections');
                return { Chat: { getModelsArray: () => models } };
            } },
        });
        // Puppeteer serializes browser values into the Node process.
        return JSON.parse(JSON.stringify(result));
    } } };
}

test('cached group discovery never serializes chats or requests participant metadata', async () => {
    const model = {
        id: { _serialized: groupId }, formattedTitle: 'Meals',
        serialize() { throw new Error('full chat serialization is broken'); },
        get groupMetadata() { throw new Error('participant metadata unavailable'); },
    };
    const client = browserClient([
        model, { id: { _serialized: 'person@c.us' } },
        { id: { _serialized: 'status@broadcast' } }, {},
    ]);
    client.getChats = async () => { throw new Error('r'); };
    assert.deepEqual(await listGroups(client), [{
        id: { _serialized: groupId }, name: 'Meals', isGroup: true,
    }]);
});

test('public group API is used when the browser cache lookup fails', async () => {
    const group = { id: { _serialized: groupId }, name: 'Meals', isGroup: true };
    const client = {
        pupPage: { evaluate: async () => { throw new Error('cache module changed'); } },
        getChats: async () => [group, { isGroup: false }],
    };
    assert.deepEqual(await listGroups(client), [group]);
});

test('empty group caches are reported without inventing groups', async () => {
    assert.deepEqual(await cachedGroups(browserClient([])), []);
});

test('message chat lookup recovers from a metadata failure using the exact cached group', async () => {
    const client = browserClient([
        { id: { _serialized: groupId }, name: 'Meals' },
        { id: { _serialized: '999@g.us' }, name: 'Other group' },
    ]);
    const chat = await getGroupChat(client, {
        from: groupId, getChat: async () => { throw new Error('r'); },
    });
    assert.equal(chat.id._serialized, groupId);
    assert.equal(chat.name, 'Meals');
    assert.equal(chat.isGroup, true);
});

test('unknown groups fail closed if both message lookups fail', async () => {
    const original = new Error('original chat error');
    await assert.rejects(getGroupChat(browserClient([]), {
        from: groupId, getChat: async () => { throw original; },
    }), (err) => err === original);
});
