import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { separatorTime } from '../format';
import type { Message } from '../protocol';
import { colors, shadows, type Avatar } from '../theme';
import { Blob } from './Avatar';

export type ChatRow =
  | { kind: 'time'; key: string; at: number }
  | { kind: 'message'; key: string; message: Message; avatar: Avatar };

/** Inserts a time separator before messages that follow a 5-minute gap. */
export function buildRows(messages: Message[], avatarOf: (memberId: string | null) => Avatar): ChatRow[] {
  const rows: ChatRow[] = [];
  let prev = 0;
  for (const m of messages) {
    if (m.createdAt - prev > 5 * 60 * 1000) rows.push({ kind: 'time', key: `t-${m.id}`, at: m.createdAt });
    rows.push({ kind: 'message', key: m.id, message: m, avatar: avatarOf(m.senderId) });
    prev = m.createdAt;
  }
  return rows;
}

export const MessageItem = memo(function MessageItem({ row }: { row: ChatRow }) {
  if (row.kind === 'time') return <Text style={styles.time}>{separatorTime(row.at)}</Text>;
  const { message: m, avatar } = row;

  if (m.senderKind === 'system') return <Text style={styles.system}>{m.content}</Text>;

  if (m.senderKind === 'user') {
    return (
      <View style={styles.mine}>
        <Text style={styles.mineText} selectable>
          {m.content}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.theirs}>
      <View style={styles.sender}>
        <Blob avatar={avatar} size={28} />
        <Text style={styles.senderName}>{m.senderName}</Text>
      </View>
      <View style={styles.bubble}>
        <Text style={styles.bubbleText} selectable>
          {m.content}
        </Text>
      </View>
    </View>
  );
});

export function TypingRow({ name, avatar }: { name: string; avatar: Avatar }) {
  return (
    <View style={styles.typing}>
      <Blob avatar={avatar} size={28} />
      <Text style={styles.typingText}>{name} 正在思考</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  time: { alignSelf: 'center', fontSize: 12, color: colors.textSecondary, marginVertical: 11 },
  system: {
    alignSelf: 'center',
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
    marginVertical: 11,
    paddingHorizontal: 24,
  },
  mine: {
    alignSelf: 'flex-end',
    maxWidth: '82%',
    backgroundColor: colors.text,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 11,
    marginVertical: 11,
  },
  mineText: { color: '#FFFFFF', fontSize: 14, lineHeight: 22 },
  theirs: { maxWidth: '86%', gap: 8, marginVertical: 11, alignSelf: 'flex-start' },
  sender: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  senderName: { fontSize: 12, color: colors.textSecondary },
  bubble: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 11,
    boxShadow: shadows.card,
  },
  bubbleText: { color: colors.text, fontSize: 14, lineHeight: 22 },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingLeft: 1, marginVertical: 11 },
  typingText: { fontSize: 13, color: colors.textSecondary },
});
