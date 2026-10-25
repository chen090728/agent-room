import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { separatorTime } from '../format';
import type { ChatRow } from '../outgoing';
import { useThemedStyles, type ThemeColors, type ThemeShadows, type Avatar } from '../theme';
import { Attachments } from './Attachments';
import { Blob } from './Avatar';
import { DeploymentCard } from './DeploymentCard';
import { PullRequestCard } from './PullRequestCard';

function sameRow(prev: { row: ChatRow; onRetry?: (clientKey: string) => void }, next: { row: ChatRow; onRetry?: (clientKey: string) => void }): boolean {
  if (prev.onRetry !== next.onRetry || prev.row.kind !== next.row.kind) return false;
  if (prev.row.kind === 'time' && next.row.kind === 'time') return prev.row.at === next.row.at;
  if (prev.row.kind === 'message' && next.row.kind === 'message') return prev.row.message === next.row.message && prev.row.avatar === next.row.avatar;
  return false;
}

export const MessageItem = memo(function MessageItem({ row, onRetry }: { row: ChatRow; onRetry?: (clientKey: string) => void }) {
  const styles = useThemedStyles(createStyles);
  if (row.kind === 'time') return <Text style={styles.time}>{separatorTime(row.at)}</Text>;
  const { message: m, avatar } = row;

  if (m.card?.type === 'deployment') {
    return (
      <View style={styles.deployWrap}>
        <DeploymentCard card={m.card} />
      </View>
    );
  }
  if (m.senderKind === 'system') return <Text style={styles.system}>{m.content}</Text>;

  if (m.senderKind === 'user') {
    const files = m.attachments ?? [];
    const sending = m.delivery === 'sending';
    const failed = m.delivery === 'failed';
    return (
      <View style={[styles.mineWrap, { marginVertical: 11 }]}>
        <View style={sending ? styles.sending : undefined}>
          {files.length > 0 && <Attachments groupId={m.groupId} attachments={files} align="flex-end" />}
          {m.content ? (
            <View style={styles.mine}>
              <Text style={styles.mineText} selectable>
                {m.content}
              </Text>
            </View>
          ) : null}
        </View>
        {sending ? <Text style={styles.delivery}>发送中</Text> : null}
        {failed ? (
          <Pressable accessibilityRole="button" accessibilityLabel="发送失败，点击重试" hitSlop={8} onPress={() => onRetry?.(m.clientKey)}>
            <Text style={styles.failed}>发送失败，点击重试</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.theirs}>
      <View style={styles.sender}>
        <Blob avatar={avatar} size={28} />
        <Text style={styles.senderName}>{m.senderName}</Text>
      </View>
      {m.attachments?.length ? <Attachments groupId={m.groupId} attachments={m.attachments} /> : null}
      {m.content ? (
        <View style={styles.bubble}>
          <Text style={styles.bubbleText} selectable>
            {m.content}
          </Text>
        </View>
      ) : null}
      {m.card?.type === 'pull_request' && <PullRequestCard message={m} card={m.card} />}
    </View>
  );
}, sameRow);

export function TypingRow({ name, avatar }: { name: string; avatar: Avatar }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.typing}>
      <Blob avatar={avatar} size={28} />
      <Text style={styles.typingText}>{name} 正在思考</Text>
    </View>
  );
}

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => StyleSheet.create({
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
  deployWrap: { alignSelf: 'center', width: '86%', maxWidth: 420, marginVertical: 11 },
  mineWrap: { alignSelf: 'flex-end', maxWidth: '82%', gap: 6, alignItems: 'flex-end' },
  mine: {
    alignSelf: 'flex-end',
    maxWidth: '100%',
    backgroundColor: colors.mineBubble,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 11,
  },
  mineText: { color: colors.mineBubbleText, fontSize: 14, lineHeight: 22 },
  sending: { opacity: 0.45 },
  delivery: { alignSelf: 'flex-end', fontSize: 11, lineHeight: 16, color: colors.textSecondary },
  failed: { alignSelf: 'flex-end', fontSize: 11, lineHeight: 16, color: colors.warning },
  theirs: { maxWidth: '86%', gap: 8, marginVertical: 11, alignSelf: 'flex-start' },
  sender: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  senderName: { fontSize: 12, color: colors.textSecondary },
  bubble: {
    backgroundColor: colors.assistantBubble,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 11,
    boxShadow: shadows.card,
  },
  bubbleText: { color: colors.assistantBubbleText, fontSize: 14, lineHeight: 22 },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingLeft: 1, marginVertical: 11 },
  typingText: { fontSize: 13, color: colors.textSecondary },
});
