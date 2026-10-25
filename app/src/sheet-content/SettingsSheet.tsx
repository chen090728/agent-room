import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { normalizeServerUrl } from '../api';
import { MacDots, MeAvatar } from '../components/Avatar';
import { LockIcon } from '../components/Icons';
import { Card, ErrorText, FieldRow, PrimaryButton, SectionLabel } from '../components/ui';
import { confirmAction, showMessage } from '../dialogs';
import { clearLastError, loadLastError } from '../errorLog';
import { fullTime } from '../format';
import { pickPhoto, type PhotoSource } from '../photo';
import { KeyboardAvoider } from '../components/KeyboardAvoider';
import { SheetHeader, SheetScrollView, useSheetClose } from '../sheets';
import { useStore } from '../store';
import { useTheme, useThemedStyles, THEME_PREFERENCE_LABELS, type ThemeColors, type ThemeShadows, type ThemePreference } from '../theme';

/**
 * The settings form: "me" (name and photo) and the server. `firstRun` is the
 * full-screen "connect to a server" page; otherwise it is the body of the sheet.
 */
export function SettingsContent({ firstRun: firstRunProp, onDone }: { firstRun?: boolean; onDone(): void }) {
  const styles = useThemedStyles(createStyles);
  const { settings, status, profile, connect, disconnect, updateProfile } = useStore();
  const [nickname, setNickname] = useState(profile.nickname);
  const [photo, setPhoto] = useState<string | null>(profile.photo);
  const [serverUrl, setServerUrl] = useState(settings?.serverUrl ?? '');
  // The saved token is never shown again; leave empty to keep it.
  const [token, setToken] = useState('');
  const [lastError, setLastError] = useState(loadLastError);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const firstRun = firstRunProp ?? !settings;
  const insets = useSafeAreaInsets();
  const url = normalizeServerUrl(serverUrl);
  const validUrl = /^https?:\/\/\S+$/i.test(url);
  const effectiveToken = token.trim() || settings?.token || '';
  const connectionChanged = firstRun || url !== settings?.serverUrl || !!token.trim();

  const choosePhoto = async (source: PhotoSource) => {
    try {
      const picked = await pickPhoto(source);
      if (picked) setPhoto(picked);
    } catch (e) {
      showMessage('没能设置头像', (e as Error).message);
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (connectionChanged) await connect({ serverUrl: url, token: effectiveToken });
      await updateProfile({ nickname: nickname.trim() || '我', avatar: photo ? null : profile.avatar, photo });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    const ok = await confirmAction({
      title: '断开服务器',
      message: '会清除本机保存的地址和访问令牌。服务器上的数据不受影响。',
      confirmText: '断开',
      destructive: true,
    });
    if (!ok) return;
    await disconnect();
    router.replace('/settings');
  };

  return (
    <KeyboardAvoider style={styles.root} bottomInset={firstRun ? insets.bottom : 0}>
      {firstRun ? (
        <View style={styles.firstRunHeader}>
          <Text style={styles.firstRunTitle}>连接服务器</Text>
        </View>
      ) : (
        <SheetHeader title="设置" />
      )}
      <SheetScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {firstRun && (
          <View style={styles.intro}>
            <MacDots />
            <Text style={styles.introTitle}>欢迎使用 AgentHub</Text>
            <Text style={styles.introText}>填写你自己部署的服务器地址和访问令牌（服务器的 AGENTHUB_TOKEN）。</Text>
          </View>
        )}

        <View style={styles.section}>
          <SectionLabel>我</SectionLabel>
          <View style={styles.photoBox}>
            <MeAvatar avatar={null} photo={photo} size={104} />
            <View style={styles.photoButtons}>
              <Pressable accessibilityRole="button" accessibilityLabel="拍照" onPress={() => choosePhoto('camera')} style={styles.photoButton}>
                <Text style={styles.photoButtonText}>拍照</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="从相册选择" onPress={() => choosePhoto('library')} style={styles.photoButton}>
                <Text style={styles.photoButtonText}>从相册选择</Text>
              </Pressable>
            </View>
            {photo && (
              <Pressable accessibilityRole="button" accessibilityLabel="使用默认头像" onPress={() => setPhoto(null)} style={styles.resetAvatar}>
                <Text style={styles.resetText}>使用默认头像</Text>
              </Pressable>
            )}
          </View>
          <Card>
            <FieldRow first label="昵称" value={nickname} onChangeText={setNickname} placeholder="我" maxLength={20} />
          </Card>
          <View style={styles.note}>
            <Text style={styles.noteText}>昵称和头像只保存在这台手机上。</Text>
          </View>
        </View>

        {/* Own block. A language section belongs beside this one, not inside it. */}
        <AppearanceSection />

        <View style={styles.section}>
          <SectionLabel
            right={
              settings ? (
                <Text style={styles.status}>{status === 'online' ? '已连接' : status === 'connecting' ? '连接中…' : '未连接'}</Text>
              ) : undefined
            }
          >
            服务器
          </SectionLabel>
          <Card>
            <FieldRow
              first
              label="服务器地址"
              value={serverUrl}
              onChangeText={setServerUrl}
              placeholder="https://agenthub.example.workers.dev"
              autoCapitalize="none"
              keyboardType="url"
            />
            <FieldRow
              label="访问令牌"
              value={token}
              onChangeText={setToken}
              placeholder={settings ? '已保存，留空则不修改' : '粘贴 AGENTHUB_TOKEN'}
              autoCapitalize="none"
              secureTextEntry
            />
          </Card>
          <View style={styles.note}>
            <LockIcon />
            <Text style={styles.noteText}>令牌保存在本机的系统安全存储中</Text>
          </View>
        </View>

        {lastError && (
          <View style={styles.section}>
            <SectionLabel
              right={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="清除上次错误"
                  onPress={() => {
                    clearLastError();
                    setLastError(null);
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.clear}>清除</Text>
                </Pressable>
              }
            >
              上次错误
            </SectionLabel>
            <Card>
              <View style={styles.errorBox}>
                <Text style={styles.errorMeta}>
                  {fullTime(lastError.at)} · {lastError.source === 'render' ? '界面出错' : lastError.fatal ? '导致退出' : '未处理的错误'}
                </Text>
                <Text style={styles.errorMessage} selectable>
                  {lastError.message}
                </Text>
                {lastError.stack ? (
                  <Text style={styles.errorStack} selectable>
                    {lastError.stack}
                  </Text>
                ) : null}
              </View>
            </Card>
            <Text style={styles.noteText}>出问题时截图这里发给开发者。只保存在这台手机上。</Text>
          </View>
        )}

        {settings && (
          <Pressable accessibilityRole="button" onPress={signOut} style={styles.signOut}>
            <Text style={styles.signOutText}>断开服务器</Text>
          </Pressable>
        )}
      </SheetScrollView>
      <View style={styles.footer}>
        <ErrorText>{error}</ErrorText>
        <PrimaryButton title={firstRun ? '连接并保存' : '保存'} onPress={save} disabled={connectionChanged && (!validUrl || !effectiveToken)} busy={busy} />
      </View>
    </KeyboardAvoider>
  );
}

const THEME_OPTIONS: ThemePreference[] = ['system', 'light', 'dark'];

function AppearanceSection() {
  const { preference, setPreference } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.section}>
      <SectionLabel>外观</SectionLabel>
      <View style={styles.segment}>
        {THEME_OPTIONS.map((option) => {
          const selected = preference === option;
          return (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityLabel={THEME_PREFERENCE_LABELS[option]}
              accessibilityState={{ selected }}
              onPress={() => void setPreference(option)}
              style={[styles.segmentItem, selected && styles.segmentOn]}
            >
              <Text style={selected ? styles.segmentOnText : styles.segmentOffText}>{THEME_PREFERENCE_LABELS[option]}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Settings as a bottom sheet. */
export function SettingsSheet() {
  const close = useSheetClose();
  return <SettingsContent firstRun={false} onDone={() => close()} />;
}

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  firstRunHeader: { alignItems: 'center', paddingTop: 22, paddingBottom: 6 },
  firstRunTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  content: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 20, gap: 26 },
  intro: { alignItems: 'center', gap: 10, paddingVertical: 10 },
  introTitle: { fontSize: 20, fontWeight: '600', color: colors.text, marginTop: 8 },
  introText: { fontSize: 14, lineHeight: 21, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 12 },
  section: { gap: 14 },
  status: { fontSize: 12, color: colors.textSecondary },
  photoBox: { alignItems: 'center', gap: 12 },
  photoButtons: { flexDirection: 'row', gap: 10 },
  photoButton: { height: 38, paddingHorizontal: 18, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  photoButtonText: { fontSize: 14, color: colors.text },
  note: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  noteText: { fontSize: 12, color: colors.textSecondary },
  resetAvatar: { alignSelf: 'center', paddingVertical: 2 },
  resetText: { fontSize: 13, color: colors.textSecondary, textDecorationLine: 'underline' },
  clear: { fontSize: 12, color: colors.textSecondary, textDecorationLine: 'underline' },
  errorBox: { padding: 14, gap: 6 },
  errorMeta: { fontSize: 12, color: colors.textSecondary },
  errorMessage: { fontSize: 13, lineHeight: 19, color: colors.danger },
  errorStack: { fontSize: 10.5, lineHeight: 15, color: colors.textSecondary, fontFamily: 'monospace' },
  signOut: { alignItems: 'center', justifyContent: 'center', height: 48 },
  signOutText: { fontSize: 14, color: colors.danger },
  footer: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12, gap: 10 },
  segment: { flexDirection: 'row', gap: 4, padding: 4, backgroundColor: colors.selected, borderRadius: 16 },
  segmentItem: { flex: 1, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: colors.surface, boxShadow: shadows.segment },
  segmentOnText: { fontSize: 14, fontWeight: '500', color: colors.text },
  segmentOffText: { fontSize: 14, color: colors.textSecondary },
});
