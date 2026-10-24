import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { normalizeServerUrl } from '../api';
import { MacDots, MeAvatar } from '../components/Avatar';
import { AvatarPicker } from '../components/AvatarPicker';
import { CloseIcon, LockIcon } from '../components/Icons';
import { Card, ErrorText, FieldRow, PrimaryButton, RoundButton, ScreenHeader, SectionLabel } from '../components/ui';
import { useStore } from '../store';
import { colors, type Avatar } from '../theme';

const DEFAULT_PICK: Avatar = { shape: 'cloud', color: 'teal' };

export default function SettingsScreen() {
  const { settings, status, profile, connect, disconnect, updateProfile } = useStore();
  const [nickname, setNickname] = useState(profile.nickname);
  const [avatar, setAvatar] = useState<Avatar | null>(profile.avatar);
  const [serverUrl, setServerUrl] = useState(settings?.serverUrl ?? '');
  // The saved token is never shown again; leave empty to keep it.
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const firstRun = !settings;
  const url = normalizeServerUrl(serverUrl);
  const validUrl = /^https?:\/\/\S+$/i.test(url);
  const effectiveToken = token.trim() || settings?.token || '';
  const connectionChanged = firstRun || url !== settings?.serverUrl || !!token.trim();

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (connectionChanged) await connect({ serverUrl: url, token: effectiveToken });
      await updateProfile({ nickname: nickname.trim() || '我', avatar });
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const signOut = () =>
    Alert.alert('断开服务器', '会清除本机保存的地址和访问令牌。服务器上的数据不受影响。', [
      { text: '取消', style: 'cancel' },
      {
        text: '断开',
        style: 'destructive',
        onPress: async () => {
          await disconnect();
          router.replace('/settings');
        },
      },
    ]);

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={styles.root} behavior="padding">
        <ScreenHeader
          title={firstRun ? '连接服务器' : '设置'}
          left={
            firstRun ? undefined : (
              <RoundButton label="关闭" onPress={() => router.back()}>
                <CloseIcon />
              </RoundButton>
            )
          }
        />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {firstRun && (
            <View style={styles.intro}>
              <MacDots />
              <Text style={styles.introTitle}>欢迎使用 AgentHub</Text>
              <Text style={styles.introText}>填写你自己部署的服务器地址和访问令牌（服务器的 AGENTHUB_TOKEN）。</Text>
            </View>
          )}

          <View style={styles.section}>
            <SectionLabel>我</SectionLabel>
            <AvatarPicker
              value={avatar ?? DEFAULT_PICK}
              onChange={setAvatar}
              preview={<MeAvatar avatar={avatar} size={104} />}
            />
            {avatar && (
              <Pressable accessibilityRole="button" onPress={() => setAvatar(null)} style={styles.resetAvatar}>
                <Text style={styles.resetText}>使用默认头像</Text>
              </Pressable>
            )}
            <Card>
              <FieldRow first label="昵称" value={nickname} onChangeText={setNickname} placeholder="我" maxLength={20} />
            </Card>
            <View style={styles.note}>
              <Text style={styles.noteText}>昵称和头像只保存在这台手机上。</Text>
            </View>
          </View>

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

          {settings && (
            <Pressable accessibilityRole="button" onPress={signOut} style={styles.signOut}>
              <Text style={styles.signOutText}>断开服务器</Text>
            </Pressable>
          )}
        </ScrollView>
        <View style={styles.footer}>
          <ErrorText>{error}</ErrorText>
          <PrimaryButton
            title={firstRun ? '连接并保存' : '保存'}
            onPress={save}
            disabled={connectionChanged && (!validUrl || !effectiveToken)}
            busy={busy}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 18, paddingTop: 30, paddingBottom: 20, gap: 26 },
  intro: { alignItems: 'center', gap: 10, paddingVertical: 10 },
  introTitle: { fontSize: 20, fontWeight: '600', color: colors.text, marginTop: 8 },
  introText: { fontSize: 14, lineHeight: 21, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 12 },
  section: { gap: 14 },
  status: { fontSize: 12, color: colors.textSecondary },
  note: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  noteText: { fontSize: 12, color: colors.textSecondary },
  resetAvatar: { alignSelf: 'center', paddingVertical: 4 },
  resetText: { fontSize: 13, color: colors.textSecondary, textDecorationLine: 'underline' },
  signOut: { alignItems: 'center', justifyContent: 'center', height: 48 },
  signOutText: { fontSize: 14, color: colors.danger },
  footer: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12, gap: 10 },
});
