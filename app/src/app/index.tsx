import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GroupAvatar, MacDots, MeAvatar } from '../components/Avatar';
import { BubbleMenu, useBubbleAnchor } from '../components/BubbleMenu';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { KeyboardAvoider } from '../components/KeyboardAvoider';
import { AddPersonIcon, NewChatIcon, SearchIcon, ThinPlusIcon } from '../components/Icons';
import { ModelIcon } from '../components/ModelIcon';
import { RelayDots } from '../components/RelayDots';
import { confirmAction, showMessage } from '../dialogs';
import { shortTime } from '../format';
import { useAppTranslation } from '../i18n';
import { renderNotice } from '../i18n/notice';
import type { GroupSummary, MemberView } from '../protocol';
import { displayNickname } from '../storage';
import { useStore } from '../store';
import { useTheme, useThemedStyles, type ThemeColors, type ThemeShadows } from '../theme';

/** Role label next to an assistant's name; mock assistants are marked as such. */
export function roleLabel(role: string, type: string, t: (key: string) => string): string {
  const mock = type === 'mock' ? t('home.mockTag') : '';
  return [role, mock].filter(Boolean).join(' · ');
}

function previewText(g: GroupSummary, myName: string, t: ReturnType<typeof useAppTranslation>['t'], exists: (key: string) => boolean): string {
  if (g.relay) return t('home.thinking', { name: g.relay.thinking ?? t('home.someone') });
  const m = g.lastMessage;
  if (m && !m.content && m.attachments?.length) {
    const label = m.attachments.every((a) => a.kind === 'image') ? t('home.photo') : t('home.file');
    return g.kind === 'direct' && m.senderKind !== 'user' ? label : t('home.from', { name: m.senderKind === 'user' ? myName : m.senderName, text: label });
  }
  if (!m) return g.kind === 'direct' ? t('home.openDirect') : t('home.noMessages');
  if (m.card?.type === 'pull_request' && m.card.state === 'open') {
    const text = t('home.filesChanged', { count: m.card.files.length });
    return g.kind === 'direct' ? text : t('home.from', { name: m.senderName, text });
  }
  if (m.card?.type === 'deployment') {
    const c = m.card;
    return c.state === 'ready' ? t('home.deployReady', { platform: c.platformLabel }) : c.state === 'error' ? t('home.deployFailed', { platform: c.platformLabel }) : t('home.deploying', { platform: c.platformLabel });
  }
  const body = renderNotice(m.notice, m.content, t, exists);
  if (m.senderKind === 'system') return body;
  if (g.kind === 'direct') return m.senderKind === 'user' ? t('home.from', { name: myName, text: body }) : body;
  return t('home.from', { name: m.senderKind === 'user' ? myName : m.senderName, text: body });
}

/** The app opens here: every assistant (one-to-one chat) and group, newest first. */
export default function HomeScreen() {
  const { t, i18n } = useAppTranslation();
  const { colors, colorScheme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { settingsLoaded, settings, groupsLoaded, groups, members, profile, api, refreshGroups, refreshMembers, status } = useStore();
  const insets = useSafeAreaInsets();
  const { rootRef, plusRef, onLayout, anchor, measure } = useBubbleAnchor(insets.top);
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState(false);
  const [menuShown, setMenuShown] = useState(false);

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const q = query.trim().toLowerCase();
  const rows = useMemo(
    () =>
      q
        ? groups.filter((g) => `${g.name} ${g.members.map((m) => m.role).join(' ')}`.toLowerCase().includes(q))
        : groups,
    [groups, q],
  );

  if (settingsLoaded && !settings) return <Redirect href="/settings" />;
  if (!settingsLoaded || !groupsLoaded) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.textSecondary} />
      </View>
    );
  }

  const go = (path: '/member/new' | '/group/new') => {
    setMenu(false);
    router.push(path);
  };

  const openMenu = () => measure(() => setMenu(true));

  const confirmDelete = async (member: MemberView) => {
    const ok = await confirmAction({
      title: t('home.deleteTitle', { name: member.name }),
      message: t('home.deleteMessage'),
      confirmText: t('home.deleteConfirm'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await api?.deleteMember(member.id);
      await Promise.all([refreshGroups(), refreshMembers()]);
    } catch (e) {
      showMessage(t('home.deleteFailed'), (e as Error).message);
    }
  };

  const renderRow = ({ item: g }: { item: GroupSummary }) => {
    const direct = g.kind === 'direct' ? g.members[0] : undefined;
    const member = direct ? memberById.get(direct.id) : undefined;
    const time = g.lastMessage ? shortTime(g.lastMessage.createdAt) : '';
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={g.name}
        onPress={() => router.push({ pathname: '/chat/[id]', params: { id: g.id } })}
        onLongPress={member ? () => confirmDelete(member) : undefined}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        <GroupAvatar avatars={g.members.map((m) => m.avatar)} />
        <View style={styles.rowBody}>
          <View style={styles.rowTop}>
            <Text style={styles.nameWrap} numberOfLines={1}>
              <Text style={styles.name}>{g.name}</Text>
              {direct && roleLabel(direct.role, direct.type, t) ? <Text style={styles.role}>{`  ${roleLabel(direct.role, direct.type, t)}`}</Text> : null}
            </Text>
            <Text style={styles.time}>{time}</Text>
          </View>
          <View style={styles.rowBottom}>
            <Text style={styles.preview} numberOfLines={1}>
              {previewText(g, displayNickname(profile.nickname), t, (key) => i18n.exists(key))}
            </Text>
            {g.relay ? (
              <RelayDots relay={g.relay} />
            ) : g.lastMessage?.card?.state === 'open' ? (
              <View style={styles.pendingDot} accessibilityLabel={t('home.pendingA11y')} />
            ) : member && member.type !== 'mock' ? (
              <ModelIcon model={member.config.model} baseUrl={member.config.baseUrl} />
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <KeyboardAvoider style={styles.root} bottomInset={insets.bottom}>
      <View
        ref={rootRef}
        style={styles.root}
        collapsable={false}
        onLayout={onLayout}
      >
        <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
          <View style={styles.headerLeft}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('home.settingsA11y')} onPress={() => router.push('/settings')} style={styles.round}>
              <MeAvatar avatar={profile.avatar} />
            </Pressable>
            <MacDots />
          </View>
          <View ref={plusRef} collapsable={false} pointerEvents={menu || menuShown ? 'none' : 'auto'} style={{ opacity: menu || menuShown ? 0 : 1 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('home.newA11y')}
              accessibilityState={{ expanded: menu }}
              onPress={() => (menu ? setMenu(false) : openMenu())}
              style={[styles.round, styles.roundAccent]}
            >
              <ThinPlusIcon color={colors.accentIcon} />
            </Pressable>
          </View>
        </View>

        <ConnectionBanner status={status} />

        <FlatList
          style={styles.list}
          data={rows}
          keyExtractor={(g) => g.id}
          renderItem={renderRow}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 16 }}
          ListEmptyComponent={<Text style={styles.empty}>{q ? t('home.emptySearch') : t('home.empty')}</Text>}
        />

        <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12) + 16 }]}>
          <View style={styles.search}>
            <SearchIcon />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('home.searchPlaceholder')}
              placeholderTextColor={colors.placeholder}
              keyboardAppearance={colorScheme}
              accessibilityLabel={t('home.searchA11y')}
              style={styles.searchInput}
              returnKeyType="search"
              onFocus={() => setMenu(false)}
            />
          </View>
        </View>
        <BubbleMenu
          open={menu}
          anchor={anchor}
          onVisibility={setMenuShown}
          onClose={() => setMenu(false)}
          items={[
            { label: t('common.newAssistant'), icon: <AddPersonIcon size={20} />, onPress: () => go('/member/new') },
            { label: t('common.newGroup'), icon: <NewChatIcon />, onPress: () => go('/group/new') },
          ]}
        />
      </View>
    </KeyboardAvoider>
  );
}

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.homeBg },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 6 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  round: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.roundBorder,
    boxShadow: shadows.float,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundAccent: { backgroundColor: colors.accent },
  list: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 12 },
  rowPressed: { backgroundColor: colors.selected },
  rowBody: { flex: 1, minWidth: 0, gap: 4 },
  rowTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  nameWrap: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '500', color: colors.text },
  role: { fontSize: 13, color: colors.textSecondary },
  time: { flexShrink: 0, fontSize: 12, color: colors.textSecondary },
  rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 20 },
  preview: { flex: 1, minWidth: 0, fontSize: 14, color: colors.textSecondary },
  pendingDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.pending },
  empty: { textAlign: 'center', fontSize: 13, color: colors.textSecondary, paddingVertical: 32, paddingHorizontal: 24 },
  bottom: { paddingHorizontal: 16, paddingTop: 8 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 54,
    paddingHorizontal: 18,
    backgroundColor: colors.surface,
    borderRadius: 27,
    borderWidth: 1,
    borderColor: colors.hairline,
    boxShadow: shadows.bar,
  },
  searchInput: { flex: 1, minWidth: 0, height: 40, fontSize: 15, color: colors.text, padding: 0 },
});
