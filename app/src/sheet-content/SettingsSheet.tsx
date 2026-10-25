import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { normalizeServerUrl } from '../api';
import { MacDots, MeAvatar } from '../components/Avatar';
import { LockIcon } from '../components/Icons';
import { Card, ErrorText, FieldRow, PrimaryButton, SectionLabel } from '../components/ui';
import { confirmAction, showMessage } from '../dialogs';
import { clearLastError, loadLastError } from '../errorLog';
import { fullTime } from '../format';
import { languageChoices, useAppTranslation, useLanguage } from '../i18n';
import { pickPhoto, type PhotoSource } from '../photo';
import { KeyboardAvoider } from '../components/KeyboardAvoider';
import { SheetHeader, SheetScrollView, useSheetClose } from '../sheets';
import { displayNickname } from '../storage';
import { useStore } from '../store';
import { useTheme, useThemedStyles, type ThemeColors, type ThemeShadows, type ThemePreference } from '../theme';

/**
 * The settings form: "me" (name and photo) and the server. `firstRun` is the
 * full-screen "connect to a server" page; otherwise it is the body of the sheet.
 */
export function SettingsContent({ firstRun: firstRunProp, onDone }: { firstRun?: boolean; onDone(): void }) {
  const { t } = useAppTranslation();
  const styles = useThemedStyles(createStyles);
  const { settings, status, profile, connect, disconnect, updateProfile } = useStore();
  const me = t('settings.me');
  const [nickname, setNickname] = useState(() => displayNickname(profile.nickname));
  const [photo, setPhoto] = useState<string | null>(profile.photo);
  const [serverUrl, setServerUrl] = useState(settings?.serverUrl ?? '');
  // The saved token is never shown again; leave empty to keep it.
  const [token, setToken] = useState('');
  const [lastError, setLastError] = useState(loadLastError);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNickname((current) => (!current.trim() || current === '我' || current === 'Me' ? me : current));
  }, [me]);

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
      showMessage(t('settings.avatarFailed'), (e as Error).message);
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (connectionChanged) await connect({ serverUrl: url, token: effectiveToken });
      const trimmed = nickname.trim();
      const stored = !trimmed || trimmed === me || trimmed === '我' || trimmed === 'Me' ? '我' : trimmed;
      await updateProfile({ nickname: stored, avatar: photo ? null : profile.avatar, photo });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    const ok = await confirmAction({
      title: t('settings.disconnectTitle'),
      message: t('settings.disconnectMessage'),
      confirmText: t('common.disconnect'),
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
          <Text style={styles.firstRunTitle} numberOfLines={2}>{t('settings.connectTitle')}</Text>
        </View>
      ) : (
        <SheetHeader title={t('settings.title')} />
      )}
      <SheetScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {firstRun && (
          <View style={styles.intro}>
            <MacDots />
            <Text style={styles.introTitle}>{t('settings.welcomeTitle')}</Text>
            <Text style={styles.introText}>{t('settings.welcomeBody')}</Text>
          </View>
        )}

        <View style={styles.section}>
          <SectionLabel>{t('settings.me')}</SectionLabel>
          <View style={styles.photoBox}>
            <MeAvatar avatar={null} photo={photo} size={104} />
            <View style={styles.photoButtons}>
              <Pressable accessibilityRole="button" accessibilityLabel={t('settings.camera')} onPress={() => choosePhoto('camera')} style={styles.photoButton}>
                <Text style={styles.photoButtonText} numberOfLines={2}>{t('settings.camera')}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={t('settings.library')} onPress={() => choosePhoto('library')} style={styles.photoButton}>
                <Text style={styles.photoButtonText} numberOfLines={2}>{t('settings.library')}</Text>
              </Pressable>
            </View>
            {photo && (
              <Pressable accessibilityRole="button" accessibilityLabel={t('settings.useDefault')} onPress={() => setPhoto(null)} style={styles.resetAvatar}>
                <Text style={styles.resetText}>{t('settings.useDefault')}</Text>
              </Pressable>
            )}
          </View>
          <Card>
            <FieldRow first label={t('settings.nickname')} value={nickname} onChangeText={setNickname} placeholder={me} maxLength={20} />
          </Card>
          <View style={styles.note}>
            <Text style={styles.noteText}>{t('settings.profileNote')}</Text>
          </View>
        </View>

        {/* Own block. A language section belongs beside this one, not inside it. */}
        <AppearanceSection />
        {/* Own block. Appearance belongs immediately before this one, never wrapping it. */}
        <LanguageSection />

        <View style={styles.section}>
          <SectionLabel
            right={
              settings ? (
                <Text style={styles.status}>{status === 'online' ? t('settings.online') : status === 'connecting' ? t('common.connecting') : t('settings.offline')}</Text>
              ) : undefined
            }
          >
            {t('settings.server')}
          </SectionLabel>
          <Card>
            <FieldRow
              first
              label={t('settings.serverUrl')}
              value={serverUrl}
              onChangeText={setServerUrl}
              placeholder="https://agenthub.example.workers.dev"
              autoCapitalize="none"
              keyboardType="url"
            />
            <FieldRow
              label={t('settings.token')}
              value={token}
              onChangeText={setToken}
              placeholder={settings ? t('settings.tokenSavedPlaceholder') : t('settings.tokenPlaceholder')}
              autoCapitalize="none"
              secureTextEntry
            />
          </Card>
          <View style={styles.note}>
            <LockIcon />
            <Text style={styles.noteText}>{t('settings.tokenNote')}</Text>
          </View>
        </View>

        {lastError && (
          <View style={styles.section}>
            <SectionLabel
              right={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('settings.clearErrorA11y')}
                  onPress={() => {
                    clearLastError();
                    setLastError(null);
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.clear}>{t('common.clear')}</Text>
                </Pressable>
              }
            >
              {t('settings.lastError')}
            </SectionLabel>
            <Card>
              <View style={styles.errorBox}>
                <Text style={styles.errorMeta}>
                  {fullTime(lastError.at)} · {lastError.source === 'render' ? t('settings.errorRender') : lastError.fatal ? t('settings.errorFatal') : t('settings.errorUnhandled')}
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
            <Text style={styles.noteText}>{t('settings.errorNote')}</Text>
          </View>
        )}

        {settings && (
          <Pressable accessibilityRole="button" onPress={signOut} style={styles.signOut}>
            <Text style={styles.signOutText}>{t('settings.disconnectTitle')}</Text>
          </Pressable>
        )}
      </SheetScrollView>
      <View style={styles.footer}>
        <ErrorText>{error}</ErrorText>
        <PrimaryButton title={firstRun ? t('settings.connectSave') : t('common.save')} onPress={save} disabled={connectionChanged && (!validUrl || !effectiveToken)} busy={busy} />
      </View>
    </KeyboardAvoider>
  );
}

const THEME_OPTIONS: ThemePreference[] = ['system', 'light', 'dark'];

function AppearanceSection() {
  const { preference, setPreference } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { t } = useAppTranslation();
  return (
    <View style={styles.section}>
      <SectionLabel>{t('settings.appearance.title')}</SectionLabel>
      <View style={styles.segment}>
        {THEME_OPTIONS.map((option) => {
          const selected = preference === option;
          const label = t(`settings.appearance.${option}`);
          return (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              onPress={() => void setPreference(option)}
              style={[styles.segmentItem, selected && styles.segmentOn]}
            >
              <Text style={selected ? styles.segmentOnText : styles.segmentOffText} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Language choice. Its own block, meant to sit after appearance, never inside it. */
function LanguageSection() {
  const { preference, setPreference, t } = useLanguage();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.section}>
      <SectionLabel>{t('settings.language.title')}</SectionLabel>
      <View style={styles.segment}>
        {languageChoices.map((option) => {
          const selected = preference === option;
          const label = t(`settings.language.${option}`);
          return (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              onPress={() => void setPreference(option)}
              style={[styles.segmentItem, selected && styles.segmentOn]}
            >
              <Text style={selected ? styles.segmentOnText : styles.segmentOffText} numberOfLines={1}>
                {label}
              </Text>
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
  firstRunTitle: { fontSize: 16, fontWeight: '600', color: colors.text, textAlign: 'center', paddingHorizontal: 16 },
  content: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 20, gap: 26 },
  intro: { alignItems: 'center', gap: 10, paddingVertical: 10 },
  introTitle: { fontSize: 20, fontWeight: '600', color: colors.text, marginTop: 8 },
  introText: { fontSize: 14, lineHeight: 21, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 12 },
  section: { gap: 14 },
  status: { flexShrink: 1, fontSize: 12, color: colors.textSecondary, textAlign: 'right' },
  photoBox: { alignItems: 'center', gap: 12 },
  photoButtons: { flexDirection: 'row', gap: 10, alignSelf: 'stretch', justifyContent: 'center' },
  photoButton: { flexShrink: 1, minHeight: 38, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  photoButtonText: { fontSize: 14, color: colors.text, textAlign: 'center' },
  note: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  noteText: { flexShrink: 1, fontSize: 12, color: colors.textSecondary },
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
