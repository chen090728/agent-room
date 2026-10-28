import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AnimatedBlob } from '../components/AnimatedBlob';
import { AvatarPicker } from '../components/AvatarPicker';
import { LockIcon } from '../components/Icons';
import { Card, ErrorText, FieldRow, PrimaryButton, SectionLabel, Switch } from '../components/ui';
import { showMessage } from '../dialogs';
import { useAppTranslation } from '../i18n';
import { pickPicture } from '../photo';
import { KeyboardAvoider } from '../components/KeyboardAvoider';
import { SheetHeader, SheetScrollView, useSheetClose } from '../sheets';
import { useStore } from '../store';
import { useThemedStyles, type ThemeColors, type ThemeShadows, type Avatar } from '../theme';

// The App's "chat assistant" with the mock switch off maps to this adapter;
// its input fields come from the server, so new fields need no App change.
const CHAT_ADAPTER = 'openai-compatible';
const WORK_ADAPTER = 'bridge';
const WORK_TOOLS = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
];

/** Sheet: create an assistant. `params.groupId` offers to add it to that group. */
export function NewMemberSheet({ params }: { params: Record<string, string> }) {
  const { t } = useAppTranslation();
  const styles = useThemedStyles(createStyles);
  const { api, adapters, groups, refreshGroups, filesEnabled } = useStore();
  const close = useSheetClose();
  const group = groups.find((g) => g.id === params.groupId);

  const [avatar, setAvatar] = useState<Avatar>({ shape: 'cloud', color: 'teal' });
  const [picture, setPicture] = useState<{ uri: string } | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [persona, setPersona] = useState('');
  const [work, setWork] = useState(false);
  const [tool, setTool] = useState('claude');
  const [write, setWrite] = useState(false);
  const [mock, setMock] = useState(false);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [joinGroup, setJoinGroup] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fields = adapters.find((a) => a.type === CHAT_ADAPTER)?.fields ?? [];
  const missing = !name.trim() || (!work && !mock && fields.some((f) => f.required && !config[f.key]?.trim()));

  const choosePicture = async () => {
    try {
      const picked = await pickPicture('library');
      if (picked) setPicture({ uri: picked.uri });
    } catch (e) {
      showMessage(t('member.pickFailed'), (e as Error).message);
    }
  };

  const create = async () => {
    if (!api) return;
    setBusy(true);
    setError(null);
    try {
      const member = await api.createMember({
        name: name.trim(),
        type: work ? WORK_ADAPTER : mock ? 'mock' : CHAT_ADAPTER,
        avatar: { shape: avatar.shape, color: avatar.color },
        role: role.trim(),
        persona: persona.trim(),
        config: work ? { tool, write: String(write) } : mock ? {} : config,
      });

      // The picture is an ordinary upload into the assistant's own chat, then pointed to by its avatar.
      if (picture && filesEnabled) {
        try {
          const direct = (await api.groups()).find((g) => g.kind === 'direct' && g.members[0]?.id === member.id);
          if (!direct) throw new Error(t('member.directMissing'));
          const file = await api.upload(direct.id, { uri: picture.uri, name: 'avatar.jpg', mime: 'image/jpeg' });
          await api.setAvatarImage(member.id, { groupId: direct.id, fileId: file.id });
        } catch (e) {
          showMessage(t('member.avatarUploadFailed'), (e as Error).message);
        }
      }

      if (group && joinGroup) {
        await api.setGroupMembers(group.id, [...group.members.map((m) => m.id), member.id]);
      }
      await refreshGroups();
      // A work assistant is useless until a computer is paired, so go straight there.
      close(work ? () => router.push({ pathname: '/member/pair', params: { memberId: member.id } }) : undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoider style={styles.root}>
      <SheetHeader title={t('common.newAssistant')} />
      <SheetScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AvatarPicker value={avatar} onChange={(a) => { setAvatar(a); }} preview={<AnimatedBlob avatar={avatar} size={104} picture={picture?.uri} />} />

        {filesEnabled && (
          <View style={styles.pictureRow}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('member.uploadA11y')} onPress={choosePicture} style={styles.pictureButton}>
              <Text style={styles.pictureText} numberOfLines={2}>{t('member.upload')}</Text>
            </Pressable>
            {picture && (
              <Pressable accessibilityRole="button" accessibilityLabel={t('member.removePicture')} onPress={() => setPicture(null)} style={styles.pictureButton}>
                <Text style={styles.pictureText} numberOfLines={2}>{t('member.removePicture')}</Text>
              </Pressable>
            )}
          </View>
        )}

        <Card>
          <FieldRow first label={t('member.name')} value={name} onChangeText={setName} placeholder={t('member.namePlaceholder')} maxLength={20} />
          <FieldRow label={t('member.role')} value={role} onChangeText={setRole} placeholder={t('member.rolePlaceholder')} maxLength={20} />
          <FieldRow
            label={t('member.persona')}
            value={persona}
            onChangeText={setPersona}
            placeholder={t('member.personaPlaceholder')}
            multiline
            maxLength={2000}
          />
        </Card>

        <View style={styles.section}>
          <SectionLabel>{t('member.type')}</SectionLabel>
          <View style={styles.segment}>
            <Pressable style={[styles.segmentItem, !work && styles.segmentOn]} onPress={() => setWork(false)} accessibilityRole="button" accessibilityLabel={t('member.chat')} accessibilityState={{ selected: !work }}>
              <Text style={!work ? styles.segmentOnText : styles.segmentOffText} numberOfLines={2}>{t('member.chat')}</Text>
            </Pressable>
            <Pressable style={[styles.segmentItem, work && styles.segmentOn]} onPress={() => setWork(true)} accessibilityRole="button" accessibilityLabel={t('bridge.workAssistant')} accessibilityState={{ selected: work }}>
              <Text style={work ? styles.segmentOnText : styles.segmentOffText} numberOfLines={2}>{t('bridge.workAssistant')}</Text>
            </Pressable>
          </View>
        </View>

        {work && (
          <View style={styles.section}>
            <SectionLabel>{t('member.tools')}</SectionLabel>
            <Card>
              <View style={styles.toolRow}>
                {WORK_TOOLS.map((t) => (
                  <Pressable key={t.id} accessibilityRole="button" accessibilityState={{ selected: tool === t.id }} onPress={() => setTool(t.id)} style={[styles.toolChip, tool === t.id && styles.toolChipOn]}>
                    <Text style={[styles.toolText, tool === t.id && styles.toolTextOn]}>{t.label}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={[styles.switchRow, styles.switchDivider]}>
                <View style={styles.switchText}>
                  <Text style={styles.switchTitle}>{t('member.allowWrite')}</Text>
                  <Text style={styles.switchSub}>{t('member.allowWriteHint')}</Text>
                </View>
                <Switch label={t('member.allowWrite')} value={write} onChange={setWrite} />
              </View>
            </Card>
            <Text style={styles.note}>
              {t('member.workNote', { tool: tool === 'codex' ? 'Codex' : 'Claude Code' })}
            </Text>
          </View>
        )}

        {!work && (
          <View style={styles.section}>
            <SectionLabel
              right={
                <View style={styles.lockNote}>
                  <LockIcon />
                  <Text style={styles.lockText}>{t('member.keyNote')}</Text>
                </View>
              }
            >
              {t('member.modelSection')}
            </SectionLabel>
            <Card>
              <View style={styles.switchRow}>
                <View style={styles.switchText}>
                  <Text style={styles.switchTitle}>{t('member.mock')}</Text>
                  <Text style={styles.switchSub}>{t('member.mockHint')}</Text>
                </View>
                <Switch label={t('member.mock')} value={mock} onChange={setMock} />
              </View>
              {!mock &&
                fields.map((f) =>
                  f.kind === 'boolean' ? (
                    <View key={f.key} style={[styles.switchRow, styles.switchDivider]}>
                      <View style={styles.switchText}>
                        <Text style={styles.switchTitle}>{f.label}</Text>
                        <Text style={styles.switchSub}>{t('member.visionHint')}</Text>
                      </View>
                      <Switch label={f.label} value={(config[f.key] ?? f.defaultValue ?? 'false') === 'true'} onChange={(v) => setConfig((c) => ({ ...c, [f.key]: String(v) }))} />
                    </View>
                  ) : (
                    <FieldRow
                      key={f.key}
                      label={f.label}
                      value={config[f.key] ?? ''}
                      onChangeText={(v) => setConfig((c) => ({ ...c, [f.key]: v }))}
                      placeholder={f.placeholder}
                      secureTextEntry={f.kind === 'password'}
                      keyboardType={f.kind === 'url' ? 'url' : 'default'}
                      autoCapitalize="none"
                      multiline={f.kind === 'textarea'}
                    />
                  ),
                )}
            </Card>
          </View>
        )}

        {group && group.kind === 'group' && (
          <Card>
            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={styles.switchTitle}>{t('member.join')}</Text>
                <Text style={styles.switchSub} numberOfLines={1}>
                  {group.name}
                </Text>
              </View>
              <Switch label={t('member.join')} value={joinGroup} onChange={setJoinGroup} />
            </View>
          </Card>
        )}
      </SheetScrollView>

      <View style={styles.footer}>
        <ErrorText>{error}</ErrorText>
        <PrimaryButton title={work ? t('member.createAndPair') : t('member.create')} onPress={create} disabled={missing} busy={busy} />
      </View>
    </KeyboardAvoider>
  );
}

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 20, gap: 24 },
  section: { gap: 10 },
  pictureRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: -10 },
  pictureButton: { flexShrink: 1, minHeight: 36, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  pictureText: { fontSize: 13, color: colors.text, textAlign: 'center' },
  segment: { flexDirection: 'row', gap: 4, padding: 4, backgroundColor: colors.selected, borderRadius: 16 },
  segmentItem: { flex: 1, minWidth: 0, minHeight: 42, paddingHorizontal: 6, paddingVertical: 8, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: colors.surface, boxShadow: shadows.segment },
  segmentOnText: { fontSize: 14, fontWeight: '500', color: colors.text, textAlign: 'center' },
  segmentOffText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  lockNote: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lockText: { flexShrink: 1, fontSize: 12, color: colors.textSecondary },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10, paddingLeft: 16, paddingRight: 12 },
  switchText: { flex: 1, gap: 2 },
  switchTitle: { fontSize: 15, color: colors.text },
  switchSub: { fontSize: 12, color: colors.textSecondary },
  toolRow: { flexDirection: 'row', gap: 8, padding: 12 },
  toolChip: { flex: 1, height: 40, borderRadius: 20, backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center' },
  toolChipOn: { backgroundColor: colors.button },
  toolText: { fontSize: 14, color: colors.text },
  toolTextOn: { color: colors.buttonText },
  note: { fontSize: 12, lineHeight: 18, color: colors.textSecondary, paddingHorizontal: 4 },
  switchDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
  footer: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12, gap: 10 },
});
