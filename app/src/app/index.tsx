import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GroupAvatar, MacDots, MeAvatar } from '../components/Avatar';
import { AddPersonIcon, NewChatIcon, NewMenuIcon, SearchIcon, ThinPlusIcon } from '../components/Icons';
import { ModelIcon } from '../components/ModelIcon';
import { RelayDots } from '../components/RelayDots';
import { confirmAction, showMessage } from '../dialogs';
import { shortTime } from '../format';
import type { GroupSummary, MemberView } from '../protocol';
import { useStore } from '../store';
import { colors, shadows } from '../theme';

/** Role label next to an assistant's name; mock assistants are marked as such. */
export function roleLabel(role: string, type: string): string {
  const mock = type === 'mock' ? '模拟' : '';
  return [role, mock].filter(Boolean).join(' · ');
}

function previewText(g: GroupSummary, myName: string): string {
  if (g.relay) return `${g.relay.thinking ?? '成员'} 正在思考…`;
  const m = g.lastMessage;
  if (m && !m.content && m.attachments?.length) {
    const label = m.attachments.every((a) => a.kind === 'image') ? '[图片]' : '[文件]';
    return g.kind === 'direct' && m.senderKind !== 'user' ? label : `${m.senderKind === 'user' ? myName : m.senderName}：${label}`;
  }
  if (!m) return g.kind === 'direct' ? '点开开始聊天' : '还没有消息';
  if (m.card?.type === 'pull_request' && m.card.state === 'open') {
    const text = `改了 ${m.card.files.length} 个文件，等你确认`;
    return g.kind === 'direct' ? text : `${m.senderName}：${text}`;
  }
  if (m.senderKind === 'system') return m.content;
  if (g.kind === 'direct') return m.senderKind === 'user' ? `${myName}：${m.content}` : m.content;
  return `${m.senderKind === 'user' ? myName : m.senderName}：${m.content}`;
}

/** The app opens here: every assistant (one-to-one chat) and group, newest first. */
export default function HomeScreen() {
  const { settingsLoaded, settings, groupsLoaded, groups, members, profile, api, refreshGroups, refreshMembers, status } = useStore();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState(false);

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

  const confirmDelete = async (member: MemberView) => {
    const ok = await confirmAction({
      title: `删除「${member.name}」？`,
      message: '会同时删除和它的单聊入口；它在群聊里发过的消息会保留。',
      confirmText: '删除',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api?.deleteMember(member.id);
      await Promise.all([refreshGroups(), refreshMembers()]);
    } catch (e) {
      showMessage('删除失败', (e as Error).message);
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
              {direct && roleLabel(direct.role, direct.type) ? <Text style={styles.role}>{`  ${roleLabel(direct.role, direct.type)}`}</Text> : null}
            </Text>
            <Text style={styles.time}>{time}</Text>
          </View>
          <View style={styles.rowBottom}>
            <Text style={styles.preview} numberOfLines={1}>
              {previewText(g, profile.nickname)}
            </Text>
            {g.relay ? (
              <RelayDots relay={g.relay} />
            ) : g.lastMessage?.card?.state === 'open' ? (
              <View style={styles.pendingDot} accessibilityLabel="待处理" />
            ) : member && member.type !== 'mock' ? (
              <ModelIcon model={member.config.model} baseUrl={member.config.baseUrl} />
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <View style={styles.headerLeft}>
          <Pressable accessibilityRole="button" accessibilityLabel="我的设置" onPress={() => router.push('/settings')} style={styles.round}>
            <MeAvatar avatar={profile.avatar} />
          </Pressable>
          <MacDots />
          {status !== 'online' && <Text style={styles.status}>{status === 'connecting' ? '连接中…' : '离线'}</Text>}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="新对话" onPress={() => router.push('/group/new')} style={styles.round}>
          <ThinPlusIcon />
        </Pressable>
      </View>

      <FlatList
        style={styles.list}
        data={rows}
        keyExtractor={(g) => g.id}
        renderItem={renderRow}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 16 }}
        ListEmptyComponent={<Text style={styles.empty}>{q ? '没有匹配的助手或群聊' : '还没有助手，点左下角的按钮新建一个'}</Text>}
      />

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12) + 16 }]}>
        {menu && (
          <>
            <Pressable accessibilityLabel="关闭菜单" onPress={() => setMenu(false)} style={styles.backdrop} />
            <View style={styles.popover}>
              <Pressable accessibilityRole="button" onPress={() => go('/member/new')} style={({ pressed }) => [styles.menuItem, pressed && styles.rowPressed]}>
                <AddPersonIcon size={20} />
                <Text style={styles.menuText}>新建助手</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => go('/group/new')} style={({ pressed }) => [styles.menuItem, pressed && styles.rowPressed]}>
                <NewChatIcon />
                <Text style={styles.menuText}>新建群聊</Text>
              </Pressable>
            </View>
          </>
        )}
        <View style={styles.barRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="新建"
            accessibilityState={{ expanded: menu }}
            onPress={() => setMenu((v) => !v)}
            style={styles.square}
          >
            <NewMenuIcon />
          </Pressable>
          <View style={styles.search}>
            <SearchIcon />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="搜索助手和群聊"
              placeholderTextColor="#A3A3A0"
              accessibilityLabel="搜索助手和群聊"
              style={styles.searchInput}
              returnKeyType="search"
              onFocus={() => setMenu(false)}
            />
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.homeBg },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 6 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  status: { fontSize: 12, color: colors.textSecondary },
  round: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    boxShadow: shadows.float,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 12 },
  rowPressed: { backgroundColor: colors.selected },
  rowBody: { flex: 1, minWidth: 0, gap: 4 },
  rowTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  nameWrap: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '500', color: colors.text },
  role: { fontSize: 13, color: colors.textSecondary },
  time: { fontSize: 12, color: colors.textSecondary },
  rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 20 },
  preview: { flex: 1, minWidth: 0, fontSize: 14, color: colors.textSecondary },
  pendingDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#E0703F' },
  empty: { textAlign: 'center', fontSize: 13, color: colors.textSecondary, paddingVertical: 32, paddingHorizontal: 24 },
  bottom: { paddingHorizontal: 16, paddingTop: 8 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  square: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    boxShadow: shadows.bar,
    alignItems: 'center',
    justifyContent: 'center',
  },
  search: {
    flex: 1,
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
  backdrop: { position: 'absolute', left: -1000, right: -1000, top: -2000, bottom: -1000 },
  popover: {
    position: 'absolute',
    left: 16,
    bottom: '100%',
    marginBottom: 4,
    width: 220,
    padding: 6,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.hairline,
    boxShadow: shadows.popover,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 48, paddingHorizontal: 12, borderRadius: 14 },
  menuText: { fontSize: 15, color: colors.text },
});
