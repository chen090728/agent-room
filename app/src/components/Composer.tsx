import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { memo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputInstance } from 'react-native';
import { showMessage } from '../dialogs';
import type { Attachment, GroupMemberRef } from '../protocol';
import { useTheme, useThemedStyles, type ThemeColors, type ThemeShadows } from '../theme';
import { formatSize } from './Attachments';
import { Blob } from './Avatar';
import { AtIcon, CloseIcon, FileIcon, ImageIcon, LinkIcon, PlusIcon, SendIcon } from './Icons';

export interface PickedFile {
  uri: string;
  name: string;
  mime: string;
}

interface Pending {
  key: string;
  name: string;
  status: 'uploading' | 'done';
  attachment?: Attachment;
}

const MAX_FILES = 6;

/**
 * Message input. The + button offers images, files and (in groups) an @ picker;
 * typing "@" at the end opens the same member picker. Files upload as soon as
 * they are picked and are sent with the next message.
 */
export const Composer = memo(function Composer({
  members,
  onSend,
  onUpload,
  placeholder = '给群里发消息，@ 点名',
  showMention = true,
  onPlugins,
}: {
  members: GroupMemberRef[];
  onSend: (text: string, attachmentIds: string[], attachments: Attachment[]) => void;
  onUpload: (file: PickedFile) => Promise<Attachment>;
  placeholder?: string;
  /** Hide the @ picker, e.g. in a one-to-one chat where nobody else can be addressed. */
  showMention?: boolean;
  /** Adds a "插件" entry to the + menu. */
  onPlugins?: () => void;
}) {
  const { colors, colorScheme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [text, setText] = useState('');
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState(false);
  const [files, setFiles] = useState<Pending[]>([]);
  const input = useRef<TextInputInstance>(null);

  const change = (value: string) => {
    // Open the picker right after a freshly typed "@".
    if (showMention && value.length === text.length + 1 && /[@＠]$/.test(value)) setPicker(true);
    else if (picker && !/[@＠]$/.test(value)) setPicker(false);
    setText(value);
  };

  const pick = (name: string) => {
    const base = /[@＠]$/.test(text) ? text.slice(0, -1) : text;
    const spacer = base && !/\s$/.test(base) ? ' ' : '';
    setText(`${base}${spacer}@${name} `);
    setPicker(false);
    input.current?.focus();
  };

  const addFile = async (file: PickedFile) => {
    const key = `${Date.now()}-${Math.random()}`;
    setFiles((f) => [...f, { key, name: file.name, status: 'uploading' }]);
    try {
      const attachment = await onUpload(file);
      setFiles((f) => f.map((p) => (p.key === key ? { ...p, status: 'done', attachment } : p)));
    } catch (e) {
      setFiles((f) => f.filter((p) => p.key !== key));
      showMessage(`「${file.name}」没能上传`, (e as Error).message);
    }
  };

  const room = () => MAX_FILES - files.length;

  const pickImages = async () => {
    setMenu(false);
    if (room() <= 0) return showMessage(`一条消息最多带 ${MAX_FILES} 个文件`);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: room(),
    });
    if (result.canceled) return;
    for (const asset of result.assets.slice(0, room())) {
      const mime = asset.mimeType ?? 'image/jpeg';
      const ext = mime.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
      await addFile({ uri: asset.uri, name: asset.fileName ?? `图片.${ext}`, mime });
    }
  };

  const pickDocuments = async () => {
    setMenu(false);
    if (room() <= 0) return showMessage(`一条消息最多带 ${MAX_FILES} 个文件`);
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return;
    for (const asset of result.assets.slice(0, room())) {
      await addFile({ uri: asset.uri, name: asset.name, mime: asset.mimeType ?? 'application/octet-stream' });
    }
  };

  const uploading = files.some((f) => f.status === 'uploading');
  const ready = files.filter((f) => f.attachment);
  const canSend = (!!text.trim() || ready.length > 0) && !uploading;

  const send = () => {
    if (!canSend) return;
    const content = text.trim();
    const picked = files.filter((f) => f.attachment);
    const attachmentIds = picked.map((f) => f.attachment!.id);
    const attachments = picked.map((f) => f.attachment!);
    // Clear before the network so the tap paints immediately. The list shows the pending row.
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setText('');
    setFiles([]);
    setPicker(false);
    onSend(content, attachmentIds, attachments);
  };

  return (
    <View style={styles.wrap}>
      {showMention && picker && members.length > 0 && (
        <View style={styles.popover}>
          <FlatList
            data={members}
            keyExtractor={(m) => m.id}
            keyboardShouldPersistTaps="always"
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`@${item.name}`}
                onPress={() => pick(item.name)}
                style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
              >
                <Blob avatar={item.avatar} size={28} />
                <Text style={styles.optionText}>{item.name}</Text>
              </Pressable>
            )}
          />
        </View>
      )}

      {menu && (
        <View style={[styles.popover, styles.menu]}>
          <MenuItem label="图片" onPress={pickImages}>
            <ImageIcon />
          </MenuItem>
          <MenuItem label="文件" onPress={pickDocuments}>
            <FileIcon />
          </MenuItem>
          {onPlugins && (
            <MenuItem
              label="插件"
              onPress={() => {
                setMenu(false);
                onPlugins();
              }}
            >
              <LinkIcon />
            </MenuItem>
          )}
          {showMention && (
            <MenuItem
              label="@ 成员"
              onPress={() => {
                setMenu(false);
                setPicker(true);
              }}
            >
              <AtIcon />
            </MenuItem>
          )}
        </View>
      )}

      {files.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
          {files.map((f) => (
            <View key={f.key} style={styles.chip} accessibilityLabel={`${f.name}${f.status === 'uploading' ? '，上传中' : ''}`}>
              {f.status === 'uploading' ? <ActivityIndicator size="small" color={colors.textSecondary} /> : f.attachment?.kind === 'image' ? <ImageIcon size={16} /> : <FileIcon size={16} />}
              <View style={styles.chipText}>
                <Text style={styles.chipName} numberOfLines={1}>
                  {f.name}
                </Text>
                {f.attachment && <Text style={styles.chipSize}>{formatSize(f.attachment.size)}</Text>}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={`移除 ${f.name}`} hitSlop={8} onPress={() => setFiles((all) => all.filter((x) => x.key !== f.key))}>
                <CloseIcon size={12} color={colors.textSecondary} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}

      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="添加附件或点名"
          accessibilityState={{ expanded: menu }}
          onPress={() => {
            setPicker(false);
            setMenu((v) => !v);
          }}
          style={styles.iconButton}
        >
          <PlusIcon />
        </Pressable>
        <TextInput
          ref={input}
          value={text}
          onChangeText={change}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          keyboardAppearance={colorScheme}
          accessibilityLabel="消息"
          style={styles.input}
          multiline
          maxLength={4000}
          onFocus={() => setMenu(false)}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="发送"
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={send}
          style={[styles.send, !canSend && styles.sendDisabled]}
        >
          <SendIcon />
        </Pressable>
      </View>
    </View>
  );
});

function MenuItem({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}>
      {children}
      <Text style={styles.optionText}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => StyleSheet.create({
  wrap: { paddingHorizontal: 14 },
  popover: {
    maxHeight: 220,
    marginBottom: 8,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.hairline,
    boxShadow: shadows.composer,
    paddingVertical: 6,
  },
  menu: { alignSelf: 'flex-start', width: 200 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, height: 44 },
  optionPressed: { backgroundColor: colors.selected },
  optionText: { fontSize: 14, color: colors.text },
  chips: { gap: 8, paddingBottom: 8, paddingHorizontal: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 220,
    height: 40,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { flexShrink: 1, minWidth: 0 },
  chipName: { fontSize: 13, color: colors.text },
  chipSize: { fontSize: 11, color: colors.textSecondary },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    minHeight: 52,
    paddingLeft: 4,
    paddingRight: 7,
    paddingVertical: 4,
    backgroundColor: colors.input,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.hairline,
    boxShadow: shadows.composer,
  },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minHeight: 44, maxHeight: 120, fontSize: 14, color: colors.text, paddingTop: 12, paddingBottom: 12 },
  send: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginBottom: 3,
    backgroundColor: colors.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.35 },
});
