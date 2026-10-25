import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyGroupSummary,
  connectionBannerVisible,
  historySyncNeeded,
  mergeHistory,
  mergeLiveMessage,
  typingMemberIds,
  type LiveGroup,
  type LiveMessage,
} from './live.ts';

function msg(patch: Partial<LiveMessage> = {}): LiveMessage {
  return {
    id: 'm1',
    createdAt: 10,
    content: 'hello',
    senderKind: 'member',
    ...patch,
  };
}

function liveGroup(patch: Partial<LiveGroup> = {}): LiveGroup {
  return {
    members: [
      { id: 'a', name: '小绿' },
      { id: 'b', name: '阿蓝' },
    ],
    relay: null,
    lastMessage: null,
    ...patch,
  };
}

describe('connection banner', () => {
  it('stays hidden until the socket has been down for a second', () => {
    assert.equal(connectionBannerVisible('online', 5000), false);
    assert.equal(connectionBannerVisible('connecting', 999), false);
    assert.equal(connectionBannerVisible('connecting', 1000), true);
    assert.equal(connectionBannerVisible('offline', 1000), true);
  });
});

describe('live list socket', () => {
  it('shows the latest summary message immediately and asks for a backfill', () => {
    const first = mergeLiveMessage(undefined, msg({ id: 's1', content: 'one' }));
    assert.equal(first.sync, true);
    assert.equal(first.messages[0].clientKey, 's1');

    const second = mergeLiveMessage(first.messages, msg({ id: 's2', content: 'two', createdAt: 20 }));
    assert.equal(second.sync, true);
    assert.deepEqual(
      second.messages.map((item) => item.id),
      ['s1', 's2'],
    );
    assert.equal(historySyncNeeded(first.messages, { id: 's2' }), true);
    assert.equal(historySyncNeeded(second.messages, { id: 's2' }), false);
    assert.equal(historySyncNeeded(undefined, { id: 's2' }), false);
    assert.equal(historySyncNeeded([], { id: 's2' }), true);
  });

  it('keeps clientKey when the same server message is updated', () => {
    const existing = [msg({ id: 's1', clientKey: 'local-a', content: 'hi', senderKind: 'user', local: true })];
    const updated = mergeLiveMessage(existing, msg({ id: 's1', content: 'hi!', senderKind: 'user', card: { type: 'pull_request', state: 'open' } }));
    assert.equal(updated.changed, true);
    assert.equal(updated.sync, false);
    assert.equal(updated.messages[0].clientKey, 'local-a');
    assert.equal(updated.messages[0].content, 'hi!');
    assert.equal(updated.messages[0].local, true);
    assert.equal(updated.messages.length, 1);

    const again = mergeLiveMessage(updated.messages, msg({ id: 's1', content: 'hi!', senderKind: 'user', card: { type: 'pull_request', state: 'open' } }));
    assert.equal(again.changed, false);
    assert.equal(again.messages, updated.messages);
  });

  it('reconciles a pending send instead of showing it twice', () => {
    const pending = msg({
      id: 'local-a',
      clientKey: 'local-a',
      content: 'hi',
      senderKind: 'user',
      delivery: 'sending',
      pending: { content: 'hi', attachmentIds: ['f1'] },
      attachments: [{ id: 'f1' }],
      local: true,
    });
    const server = msg({
      id: 'server-9',
      content: 'hi',
      senderKind: 'user',
      createdAt: 11,
      attachments: [{ id: 'f1' }],
    });
    const merged = mergeLiveMessage([pending], server);
    assert.equal(merged.messages.length, 1);
    assert.equal(merged.messages[0].id, 'server-9');
    assert.equal(merged.messages[0].clientKey, 'local-a');
    assert.equal(merged.messages[0].delivery, undefined);
    assert.equal(merged.messages[0].local, true);
    assert.equal(merged.sync, false);
  });

  it('derives typing from the relay and clears it when the relay ends', () => {
    const thinking = liveGroup({
      relay: { groupId: 'g', rootId: 'r', active: true, hop: 1, maxHops: 5, replies: 0, maxReplies: 10, trail: [], thinking: '小绿' },
      lastMessage: msg({ id: 's1' }),
    });
    assert.deepEqual(typingMemberIds(thinking), ['a']);
    const applied = applyGroupSummary([msg({ id: 's1', clientKey: 's1' })], thinking);
    assert.deepEqual(applied.typing, ['a']);
    assert.equal(applied.sync, false);

    const done = applyGroupSummary(applied.messages, liveGroup({ relay: null, lastMessage: msg({ id: 's1' }) }));
    assert.deepEqual(done.typing, []);
    assert.equal(done.changed, false);
  });
});

describe('mergeHistory', () => {
  it('preserves clientKey and returns the same array when the page is unchanged', () => {
    const existing = [msg({ id: 's1', clientKey: 'local-a', content: 'hi', senderKind: 'user' })];
    const same = mergeHistory(existing, [msg({ id: 's1', content: 'hi', senderKind: 'user' })]);
    assert.equal(same, existing);

    const edited = mergeHistory(existing, [msg({ id: 's1', content: 'edited', senderKind: 'user' })]);
    assert.notEqual(edited, existing);
    assert.equal(edited[0].clientKey, 'local-a');
    assert.equal(edited[0].content, 'edited');

    const added = mergeHistory(edited, [msg({ id: 's2', content: 'next', createdAt: 30 })]);
    assert.deepEqual(
      added.map((item) => item.clientKey),
      ['local-a', 's2'],
    );
  });

  it('turns an unknown history into an empty list once the server says there is nothing', () => {
    assert.deepEqual(mergeHistory(undefined, []), []);
  });
});
