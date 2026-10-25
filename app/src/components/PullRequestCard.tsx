import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { confirmAction, showMessage } from '../dialogs';
import type { Message, PullRequestCard as Card } from '../protocol';
import { useStore } from '../store';
import { colors, shadows } from '../theme';
import { BranchIcon } from './Icons';

const GREEN = '#148A5A';
const RED = '#C73C40';
const MAX_FILES_SHOWN = 5;

const STATE_LABEL: Record<Card['state'], { text: string; color: string }> = {
  open: { text: '等你确认', color: colors.warning },
  merged: { text: '已合并', color: GREEN },
  closed: { text: '已拒绝', color: colors.textSecondary },
  failed: { text: '合并失败', color: RED },
};

/**
 * Confirmation card for a pull request an assistant opened: which files
 * changed, and buttons to merge or reject. Only a tap here merges anything.
 */
export function PullRequestCard({ message, card }: { message: Message; card: Card }) {
  const { api, dispatch } = useStore();
  const [busy, setBusy] = useState<'merge' | 'reject' | null>(null);
  const state = STATE_LABEL[card.state];
  const decidable = card.state === 'open' || card.state === 'failed';

  const act = async (action: 'merge' | 'reject') => {
    if (!api) return;
    setBusy(action);
    try {
      const next = await api.cardAction(message.groupId, message.id, action);
      dispatch({ type: 'chat', event: { type: 'message_updated', message: next } });
    } catch (e) {
      showMessage(action === 'merge' ? '合并失败' : '操作失败', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const confirmMerge = async () => {
    const ok = await confirmAction({
      title: `合并 #${card.number}？`,
      message: `「${card.title}」会合并进 ${card.repo} 的 ${card.base} 分支。`,
      confirmText: '同意合并',
    });
    if (ok) await act('merge');
  };

  const openOnGitHub = () => {
    if (/^https?:\/\//i.test(card.url)) Linking.openURL(card.url).catch(() => {});
  };

  const shown = card.files.slice(0, MAX_FILES_SHOWN);

  return (
    <View style={styles.card} accessibilityLabel={`修改建议 #${card.number}：${card.title}，${state.text}`}>
      <View style={styles.top}>
        <BranchIcon />
        <Text style={styles.repo} numberOfLines={1}>
          {card.repo} · #{card.number}
        </Text>
        <Text style={[styles.state, { color: state.color }]}>{state.text}</Text>
      </View>
      <Text style={styles.title}>{card.title}</Text>

      <View style={styles.files}>
        {shown.map((f) => (
          <View key={f.path} style={styles.fileRow}>
            <Text style={styles.path} numberOfLines={1}>
              {f.path}
            </Text>
            <Text style={styles.counts}>
              <Text style={{ color: GREEN }}>+{f.additions}</Text> <Text style={{ color: RED }}>−{f.deletions}</Text>
            </Text>
          </View>
        ))}
        {card.files.length > shown.length && <Text style={styles.more}>另外 {card.files.length - shown.length} 个文件</Text>}
        <Text style={styles.total}>
          共 {card.files.length} 个文件 · <Text style={{ color: GREEN }}>+{card.additions}</Text> <Text style={{ color: RED }}>−{card.deletions}</Text>
        </Text>
      </View>

      {card.state === 'failed' && card.error ? <Text style={styles.error}>{card.error}</Text> : null}

      {decidable && (
        <View style={styles.buttons}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="同意合并"
            disabled={busy !== null}
            onPress={confirmMerge}
            style={({ pressed }) => [styles.approve, busy !== null && styles.disabled, pressed && styles.pressed]}
          >
            {busy === 'merge' ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.approveText}>{card.state === 'failed' ? '重试合并' : '同意合并'}</Text>}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="拒绝"
            disabled={busy !== null}
            onPress={() => act('reject')}
            style={({ pressed }) => [styles.reject, busy !== null && styles.disabled, pressed && styles.pressed]}
          >
            {busy === 'reject' ? <ActivityIndicator color={colors.text} /> : <Text style={styles.rejectText}>拒绝</Text>}
          </Pressable>
        </View>
      )}

      <Pressable accessibilityRole="link" onPress={openOnGitHub} style={styles.linkRow}>
        <Text style={styles.link}>在 GitHub 查看</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minWidth: 270,
    gap: 10,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: shadows.card,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  repo: { flex: 1, minWidth: 0, fontSize: 12, color: colors.textSecondary },
  state: { fontSize: 12, fontWeight: '500' },
  title: { fontSize: 15, fontWeight: '500', lineHeight: 21, color: colors.text },
  files: { gap: 6, paddingVertical: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.divider },
  fileRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  path: { flex: 1, minWidth: 0, fontSize: 12.5, color: colors.text },
  counts: { fontSize: 12.5 },
  more: { fontSize: 12, color: colors.textSecondary },
  total: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  error: { fontSize: 12.5, lineHeight: 18, color: RED },
  buttons: { flexDirection: 'row', gap: 8 },
  approve: { flex: 1, height: 40, borderRadius: 20, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  approveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  reject: { height: 40, paddingHorizontal: 20, borderRadius: 20, backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center' },
  rejectText: { color: colors.text, fontSize: 14 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
  linkRow: { alignSelf: 'flex-start', paddingVertical: 2 },
  link: { fontSize: 12, color: colors.textSecondary, textDecorationLine: 'underline' },
});
