import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { separatorTime } from '../format';
import { useAppTranslation } from '../i18n';
import { renderNotice } from '../i18n/notice';
import type { ChatRow } from '../outgoing';
import { colors, shadows, type Avatar } from '../theme';
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
  const { t, i18n } = useAppTranslation();
  if (row.kind === 'time') return <Text style={styles.time}>{separatorTime(row.at)}</Text>;
  const { message: m, avatar } = row;
  const body = renderNotice(m.notice, m.content, t, (key) => i18n.exists(key));

  if (m.card?.type === 'deployment') {
    return (
      <View style={styles.deployWrap}>
        <DeploymentCard card={m.card} />
      </View>
    );
  }
  if (m.senderKind === 'system') return <Text style={styles.system}>{body}</Text>;

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
                {body}
              </Text>
            </View>
          ) : null}
        </View>
        {sending ? <Text style={styles.delivery}>{t('chat.sending')}</Text> : null}
        {failed ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('chat.sendFailedRetry')} hitSlop={8} onPress={() => onRetry?.(m.clientKey)}>
            <Text style={styles.failed} numberOfLines={2}>
              {t('chat.sendFailedRetry')}
            </Text>
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
            {body}
          </Text>
        </View>
      ) : null}
      {m.card?.type === 'pull_request' && <PullRequestCard message={m} card={m.card} />}
    </View>
  );
}, sameRow);

export function TypingRow({ name, avatar }: { name: string; avatar: Avatar }) {
  const { t } = useAppTranslation();
  return (
    <View style={styles.typing}>
      <Blob avatar={avatar} size={28} />
      <Text style={styles.typingText} numberOfLines={1}>
        {t('chat.typing', { name })}
      </Text>
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
  deployWrap: { alignSelf: 'center', width: '86%', maxWidth: 420, marginVertical: 11 },
  mineWrap: { alignSelf: 'flex-end', maxWidth: '82%', gap: 6, alignItems: 'flex-end' },
  mine: {
    alignSelf: 'flex-end',
    maxWidth: '100%',
    backgroundColor: colors.text,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 11,
  },
  mineText: { color: '#FFFFFF', fontSize: 14, lineHeight: 22 },
  sending: { opacity: 0.45 },
  delivery: { alignSelf: 'flex-end', fontSize: 11, lineHeight: 16, color: colors.textSecondary },
  failed: { alignSelf: 'flex-end', fontSize: 11, lineHeight: 16, color: colors.warning },
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
