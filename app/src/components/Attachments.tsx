import { useEffect, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Attachment } from '../protocol';
import { showMessage } from '../dialogs';
import { useAppTranslation } from '../i18n';
import { useStore } from '../store';
import { colors } from '../theme';
import { FileIcon } from './Icons';

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** A thumbnail loaded through a short-lived signed link, so no custom request headers are needed. */
function Thumbnail({ groupId, attachment, onPress }: { groupId: string; attachment: Attachment; onPress: () => void }) {
  const { api } = useStore();
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      ?.fileLink(groupId, attachment.id)
      .then((link) => !cancelled && setUri(link))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [api, groupId, attachment.id]);

  return (
    <Pressable accessibilityRole="imagebutton" accessibilityLabel={attachment.name} onPress={onPress}>
      {uri ? (
        <Image source={{ uri }} style={styles.image} resizeMode="cover" accessibilityLabel={attachment.name} />
      ) : (
        <View style={styles.image} />
      )}
    </Pressable>
  );
}

/** The files of a message: images as thumbnails, everything else as a tappable chip. */
export function Attachments({ groupId, attachments, align = 'flex-start' }: { groupId: string; attachments: Attachment[]; align?: 'flex-start' | 'flex-end' }) {
  const { t } = useAppTranslation();
  const { api } = useStore();
  if (!api || !attachments.length) return null;

  const open = async (a: Attachment) => {
    try {
      await Linking.openURL(await api.fileLink(groupId, a.id));
    } catch (e) {
      showMessage(t('attachments.openFailed'), (e as Error).message);
    }
  };

  return (
    <View style={[styles.list, { alignItems: align }]}>
      {attachments.map((a) =>
        a.kind === 'image' ? (
          <Thumbnail key={a.id} groupId={groupId} attachment={a} onPress={() => open(a)} />
        ) : (
          <Pressable key={a.id} accessibilityRole="button" accessibilityLabel={t('attachments.fileA11y', { name: a.name, size: formatSize(a.size) })} onPress={() => open(a)} style={styles.chip}>
            <FileIcon size={20} />
            <View style={styles.chipText}>
              <Text style={styles.name} numberOfLines={1}>
                {a.name}
              </Text>
              <Text style={styles.size}>
                {a.kind === 'pdf' ? t('common.pdf') : t('common.file')} · {formatSize(a.size)}
              </Text>
            </View>
          </Pressable>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  image: { width: 220, height: 160, borderRadius: 16, backgroundColor: colors.selected },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: 240,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { flex: 1, minWidth: 0, gap: 1 },
  name: { fontSize: 14, color: colors.text },
  size: { fontSize: 12, color: colors.textSecondary },
});
