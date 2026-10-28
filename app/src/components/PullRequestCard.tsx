import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../api';
import { confirmAction, showMessage } from '../dialogs';
import { useAppTranslation } from '../i18n';
import { renderNotice } from '../i18n/notice';
import type { Message, PullRequestCard as Card } from '../protocol';
import { useStore } from '../store';
import { useTheme, useThemedStyles, type ThemeColors, type ThemeShadows } from '../theme';
import { BranchIcon } from './Icons';

const MAX_FILES_SHOWN = 5;

/**
 * Confirmation card for a pull request an assistant opened: which files
 * changed, and buttons to merge or reject. Only a tap here merges anything.
 */
export function PullRequestCard({ message, card }: { message: Message; card: Card }) {
  const { t, i18n } = useAppTranslation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { api, dispatch } = useStore();
  const [busy, setBusy] = useState<'merge' | 'reject' | null>(null);
  const state = {
    open: { text: t('pr.open'), color: colors.warning },
    merged: { text: t('pr.merged'), color: colors.success },
    closed: { text: t('pr.closed'), color: colors.textSecondary },
    failed: { text: t('pr.failed'), color: colors.danger },
  }[card.state];
  const exists = (key: string) => i18n.exists(key);
  const decidable = card.state === 'open' || card.state === 'failed';

  const act = async (action: 'merge' | 'reject') => {
    if (!api) return;
    setBusy(action);
    try {
      const next = await api.cardAction(message.groupId, message.id, action);
      dispatch({ type: 'chat', event: { type: 'message_updated', message: next } });
    } catch (e) {
      const detail = e instanceof ApiError && e.notice ? renderNotice(e.notice, e.message, t, exists) : (e as Error).message;
      showMessage(action === 'merge' ? t('pr.failed') : t('common.actionFailed'), detail);
    } finally {
      setBusy(null);
    }
  };

  const confirmMerge = async () => {
    const ok = await confirmAction({
      title: t('pr.confirmTitle', { number: card.number }),
      message: t('pr.confirmMessage', { title: card.title, repo: card.repo, base: card.base }),
      confirmText: t('pr.confirm'),
    });
    if (ok) await act('merge');
  };

  const openOnGitHub = () => {
    if (/^https?:\/\//i.test(card.url)) Linking.openURL(card.url).catch(() => {});
  };

  const shown = card.files.slice(0, MAX_FILES_SHOWN);

  return (
    <View style={styles.card} accessibilityLabel={t('pr.a11y', { number: card.number, title: card.title, state: state.text })}>
      <View style={styles.top}>
        <BranchIcon />
        <Text style={styles.repo} numberOfLines={1}>
          {card.repo} · #{card.number}
        </Text>
        <Text style={[styles.state, { color: state.color }]} numberOfLines={1}>
          {state.text}
        </Text>
      </View>
      <Text style={styles.title}>{card.title}</Text>

      <View style={styles.files}>
        {shown.map((f) => (
          <View key={f.path} style={styles.fileRow}>
            <Text style={styles.path} numberOfLines={1}>
              {f.path}
            </Text>
            <Text style={styles.counts}>
              <Text style={{ color: colors.success }}>+{f.additions}</Text> <Text style={{ color: colors.danger }}>−{f.deletions}</Text>
            </Text>
          </View>
        ))}
        {card.files.length > shown.length && <Text style={styles.more}>{t('pr.moreFiles', { count: card.files.length - shown.length })}</Text>}
        <Text style={styles.total}>
          {t('pr.summary', { count: card.files.length })}
          <Text style={{ color: colors.success }}>+{card.additions}</Text> <Text style={{ color: colors.danger }}>−{card.deletions}</Text>
        </Text>
      </View>

      {card.state === 'failed' && card.error ? <Text style={styles.error}>{renderNotice(card.errorNotice, card.error, t, exists)}</Text> : null}

      {decidable && (
        <View style={styles.buttons}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('pr.confirm')}
            disabled={busy !== null}
            onPress={confirmMerge}
            style={({ pressed }) => [styles.approve, busy !== null && styles.disabled, pressed && styles.pressed]}
          >
            {busy === 'merge' ? <ActivityIndicator color={colors.buttonText} /> : <Text style={styles.approveText} numberOfLines={1}>{card.state === 'failed' ? t('pr.retry') : t('pr.confirm')}</Text>}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('pr.reject')}
            disabled={busy !== null}
            onPress={() => act('reject')}
            style={({ pressed }) => [styles.reject, busy !== null && styles.disabled, pressed && styles.pressed]}
          >
            {busy === 'reject' ? <ActivityIndicator color={colors.text} /> : <Text style={styles.rejectText} numberOfLines={1}>{t('pr.reject')}</Text>}
          </Pressable>
        </View>
      )}

      <Pressable accessibilityRole="link" onPress={openOnGitHub} style={styles.linkRow}>
        <Text style={styles.link}>{t('pr.viewOnGitHub')}</Text>
      </Pressable>
    </View>
  );
}

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => StyleSheet.create({
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
  state: { flexShrink: 1, fontSize: 12, fontWeight: '500' },
  title: { fontSize: 15, fontWeight: '500', lineHeight: 21, color: colors.text },
  files: { gap: 6, paddingVertical: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.divider },
  fileRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  path: { flex: 1, minWidth: 0, fontSize: 12.5, color: colors.text },
  counts: { fontSize: 12.5 },
  more: { fontSize: 12, color: colors.textSecondary },
  total: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  error: { fontSize: 12.5, lineHeight: 18, color: colors.danger },
  buttons: { flexDirection: 'row', gap: 8 },
  approve: { flex: 1, height: 40, borderRadius: 20, backgroundColor: colors.button, alignItems: 'center', justifyContent: 'center' },
  approveText: { color: colors.buttonText, fontSize: 14, fontWeight: '600' },
  reject: { height: 40, paddingHorizontal: 20, borderRadius: 20, backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center' },
  rejectText: { color: colors.text, fontSize: 14 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
  linkRow: { alignSelf: 'flex-start', paddingVertical: 2 },
  link: { fontSize: 12, color: colors.textSecondary, textDecorationLine: 'underline' },
});
