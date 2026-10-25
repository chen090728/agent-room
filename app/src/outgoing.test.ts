import assert from 'node:assert/strict';
import test from 'node:test';
import type { Message } from './protocol.ts';
import {
  acknowledge,
  addIncoming,
  appendOutgoing,
  buildRows,
  createOutgoing,
  displayRows,
  markFailed,
  markSending,
  mergeServerMessages,
  type ChatMessage,
} from './outgoing.ts';
import type { Avatar } from './theme.ts';

const avatar: Avatar = { shape: 'circle', color: 'teal' };
const avatarOf = () => avatar;

function server(partial: Partial<Message> & Pick<Message, 'id' | 'content' | 'createdAt'>): Message {
  return {
    groupId: 'g1',
    senderKind: 'user',
    senderId: null,
    senderName: '用户',
    card: null,
    rootId: partial.id,
    hop: 0,
    ...partial,
  };
}

function outgoing(content: string, now: number, clientKey: string, attachmentIds: string[] = []): ChatMessage {
  return createOutgoing({
    groupId: 'g1',
    content,
    attachmentIds,
    attachments: [],
    senderName: '我',
    now,
    clientKey,
  });
}

test('send appends a faded pending message and keeps earlier rows', () => {
  const older = { ...server({ id: 'a', content: 'earlier', createdAt: 1_000 }), clientKey: 'a' };
  const pending = outgoing('hello', 2_000, 'local-1');
  const next = appendOutgoing([older], pending);

  assert.equal(next[0], older);
  assert.equal(next[1], pending);
  assert.equal(next[1].delivery, 'sending');
  assert.deepEqual(next[1].pending, { content: 'hello', attachmentIds: [] });
  assert.equal(next[1].clientKey, 'local-1');
});

test('success swaps in the server message without changing the list key or other rows', () => {
  const older = { ...server({ id: 'a', content: 'earlier', createdAt: 1_000 }), clientKey: 'a' };
  const pending = outgoing('hello', 2_000, 'local-1');
  const saved = server({ id: 'srv-1', content: 'hello', createdAt: 2_050, senderName: '用户' });
  const acked = acknowledge([older, pending], 'local-1', saved);

  assert.equal(acked.length, 2);
  assert.equal(acked[0], older);
  assert.equal(acked[1].id, 'srv-1');
  assert.equal(acked[1].clientKey, 'local-1');
  assert.equal(acked[1].local, true);
  assert.equal(acked[1].delivery, undefined);
  assert.equal(acked[1].content, 'hello');

  assert.equal(acknowledge(acked, 'local-1', saved), acked);
  assert.equal(addIncoming(acked, saved), acked);
});

test('a socket echo reconciles the pending row instead of duplicating it', () => {
  const older = { ...server({ id: 'a', content: 'earlier', createdAt: 1_000, senderKind: 'member', senderName: '小橙' }), clientKey: 'a' };
  const first = outgoing('hi', 2_000, 'local-1');
  const second = outgoing('hi', 3_000, 'local-2');
  const list = [older, first, second];

  const echo1 = server({ id: 's1', content: 'hi', createdAt: 2_100 });
  const after1 = addIncoming(list, echo1);
  assert.equal(after1[0], older);
  assert.equal(after1[1].id, 's1');
  assert.equal(after1[1].clientKey, 'local-1');
  assert.equal(after1[2], second);

  const echo2 = server({ id: 's2', content: 'hi', createdAt: 3_100 });
  const after2 = addIncoming(after1, echo2);
  assert.equal(after2[2].id, 's2');
  assert.equal(after2[2].clientKey, 'local-2');
  assert.equal(after2.filter((item) => item.delivery).length, 0);
});

test('failure and retry touch only that message', () => {
  const older = { ...server({ id: 'a', content: 'earlier', createdAt: 1_000 }), clientKey: 'a' };
  const pending = outgoing('hello', 2_000, 'local-1');
  const failed = markFailed([older, pending], 'local-1');

  assert.equal(failed[0], older);
  assert.notEqual(failed[1], pending);
  assert.equal(failed[1].delivery, 'failed');
  assert.equal(failed[1].pending, pending.pending);
  assert.equal(markFailed(failed, 'missing'), failed);

  const again = markSending(failed, 'local-1');
  assert.equal(again[0], older);
  assert.equal(again[1].delivery, 'sending');
  assert.equal(again[1].clientKey, 'local-1');
  assert.equal(markSending(again, 'local-1'), again);
});

test('history reload keeps an unsent message and the objects already on screen', () => {
  const older = { ...server({ id: 'a', content: 'earlier', createdAt: 1_000 }), clientKey: 'a' };
  const pending = outgoing('hello', 5_000, 'local-1');
  const merged = mergeServerMessages([older, pending], [server({ id: 'a', content: 'earlier', createdAt: 1_000 })]);

  assert.equal(merged[0], older);
  assert.equal(merged[1], pending);
  assert.equal(mergeServerMessages(merged, [server({ id: 'a', content: 'earlier', createdAt: 1_000 })]), merged);

  const saved = server({ id: 'srv-1', content: 'hello', createdAt: 5_100 });
  const echoed = mergeServerMessages(merged, [server({ id: 'a', content: 'earlier', createdAt: 1_000 }), saved]);
  assert.equal(echoed[0], older);
  assert.equal(echoed[1].id, 'srv-1');
  assert.equal(echoed[1].clientKey, 'local-1');
  assert.equal(echoed[1].delivery, undefined);
});

test('history reload applies an older card edit and keeps unknown message fields', () => {
  const card = { type: 'pull_request', state: 'open' };
  const older = { ...server({ id: 'a', content: 'earlier', createdAt: 1_000, card: card as never }), clientKey: 'a' };
  const fresh = server({ id: 'a', content: 'earlier', createdAt: 1_000, card: { ...card, state: 'merged' } as never });
  const withNotice = { ...fresh, notice: { code: 'demo.welcome', params: { name: '小橙' } } };
  const merged = mergeServerMessages([older], [withNotice]);

  assert.equal(merged[0].clientKey, 'a');
  assert.equal((merged[0].card as { state: string }).state, 'merged');
  assert.deepEqual((merged[0] as { notice?: unknown }).notice, withNotice.notice);
  assert.equal(mergeServerMessages(merged, [withNotice]), merged);
});

test('adding a message reuses the previous row objects', () => {
  const older = { ...server({ id: 'a', content: 'earlier', createdAt: 1_000, senderKind: 'member', senderId: 'm1', senderName: '小橙' }), clientKey: 'a' };
  const pending = outgoing('hello', 2_000, 'local-1');
  const first = displayRows([older], avatarOf);
  const second = displayRows([older, pending], avatarOf, first);

  const olderRow = (view: typeof first) => view.display.find((row) => row.kind === 'message' && row.message.id === 'a');
  assert.equal(olderRow(second), olderRow(first));
  assert.notEqual(second, first);
  assert.equal(second.display[0].kind === 'message' && second.display[0].message.delivery, 'sending');
  assert.equal(displayRows([older, pending], avatarOf, second), second);

  const rebuilt = buildRows([older, pending], avatarOf, second.chrono);
  assert.equal(rebuilt, second.chrono);
});
