import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildSnapshot,
  cacheableMessage,
  canonicalServerUrl,
  parseSnapshot,
  readRoomCache,
  roomCacheKey,
  stableClientKey,
  writeRoomCache,
  type KeyValueStore,
} from './cache.ts';
import type { GroupSummary, MemberView, Message } from './protocol.ts';

function message(patch: Partial<Message> & { clientKey?: string; delivery?: string; pending?: unknown } = {}): Message & {
  clientKey?: string;
  delivery?: string;
  pending?: unknown;
} {
  return {
    id: 'm1',
    groupId: 'g1',
    senderKind: 'user',
    senderId: null,
    senderName: '我',
    content: 'hello',
    rootId: 'm1',
    hop: 0,
    createdAt: 10,
    ...patch,
  };
}

function group(patch: Partial<GroupSummary> = {}): GroupSummary {
  return {
    id: 'g1',
    name: '小绿',
    kind: 'direct',
    createdAt: 1,
    members: [],
    lastMessage: null,
    lastActivityAt: 10,
    relay: null,
    binding: null,
    ...patch,
  };
}

function memory(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
  };
}

describe('room cache', () => {
  it('keeps clientKey and drops sends that have not reached the server', () => {
    const saved = cacheableMessage(message({ id: 'server-1', clientKey: 'local-a', content: 'hi' }));
    assert.equal(saved?.clientKey, 'local-a');
    assert.equal(stableClientKey(message({ id: 'server-1' })), 'server-1');
    assert.equal(cacheableMessage(message({ id: 'local-b', clientKey: 'local-b', delivery: 'sending', pending: { content: 'x', attachmentIds: [] } })), null);
    assert.equal(cacheableMessage(message({ id: 'local-c', clientKey: 'local-c', delivery: 'failed' })), null);
  });

  it('round-trips history for one server and leaves another server alone', async () => {
    const store = memory();
    const groups = [group({ lastMessage: message() })];
    const members: MemberView[] = [];
    const snap = buildSnapshot('https://example.test/', groups, members, {
      g1: [message({ id: 'server-1', clientKey: 'local-a', content: 'cached' }), message({ id: 'local-z', clientKey: 'local-z', delivery: 'sending', content: 'nope' })],
    });
    assert.equal(snap.serverUrl, 'https://example.test');
    assert.deepEqual(
      snap.messages.g1.map((item) => item.clientKey),
      ['local-a'],
    );
    await writeRoomCache(store, snap);

    const loaded = await readRoomCache(store, 'https://example.test');
    assert.equal(loaded?.messages.g1[0].clientKey, 'local-a');
    assert.equal(loaded?.messages.g1[0].content, 'cached');
    assert.equal(await readRoomCache(store, 'https://other.test'), null);
    assert.equal(canonicalServerUrl('https://example.test///'), 'https://example.test');
    assert.ok(roomCacheKey('https://example.test') !== roomCacheKey('https://other.test'));
  });

  it('rejects a corrupt or outdated payload', () => {
    assert.equal(parseSnapshot('not json', 'https://example.test'), null);
    assert.equal(parseSnapshot(JSON.stringify({ version: 0, serverUrl: 'https://example.test', groups: [], members: [], messages: {} }), 'https://example.test'), null);
  });

  it('keeps only the newest messages and only groups still in the list', () => {
    const many = Array.from({ length: 90 }, (_, i) => message({ id: `m${i}`, clientKey: `k${i}`, content: String(i), createdAt: i }));
    const snap = buildSnapshot('https://example.test', [group()], [], { g1: many, gone: [message({ groupId: 'gone' })] });
    assert.equal(snap.messages.g1.length, 80);
    assert.equal(snap.messages.g1[0].id, 'm10');
    assert.equal(snap.messages.gone, undefined);
    assert.equal(snap.messages.g1[10].clientKey, 'k20');
  });
});
