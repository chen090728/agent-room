import { Redirect, router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GroupAvatar, MacDots, MeAvatar } from '../components/Avatar';
import { BubbleMenu, type BubbleAnchor } from '../components/BubbleMenu';
import { AddPersonIcon, NewChatIcon, SearchIcon, ThinPlusIcon } from '../components/Icons';
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
  if (m.card?.type === 'deployment') {
    const c = m.card;
    return c.state === 'ready' ? `${c.platformLabel} 部署完成` : c.state === 'error' ? `${c.platformLabel} 部署失败` : `正在部署到 ${c.platformLabel}`;
  }
  if (m.senderKind === 'system') return m.content;
  if (g.kind === 'direct') return m.senderKind === 'user' ? `${myName}：${m.content}` : m.content;
  return `${m.senderKind === 'user' ? myName : m.senderName}：${m.content}`;
}

/** The app opens here: every assistant (one-to-one chat) and group, newest first. */
export default function HomeScreen() {
  const { settingsLoaded, settings, groupsLoaded, groups, members, profile, api, refreshGroups, refreshMembers, status } = useStore();
  const insets = useSafeAreaInsets();
  const rootRef = useRef<ViewInstance>(null);
  const plusRef = useRef<ViewInstance>(null);
  const rootSize = useRef({ width: 0, height: 0 });
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState(false);
  const [anchor, setAnchor] = useState<BubbleAnchor | null>(null);

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

  const openMenu = () => {
    const plus = plusRef.current;
    const root = rootRef.current;
    const fallback = (): BubbleAnchor => ({
      x: Math.max(8, (rootSize.current.width || 0) - 16 - 48),
      y: insets.top + 14,
      width: 48,
      height: 48,
    });
    if (!plus || !root) {
      setAnchor(fallback());
      setMenu(true);
      return;
    }
    plus.measureLayout(
      root,
      (x, y, width, height) => {
        if (width <= 0 || height <= 0) setAnchor(fallback());
        else setAnchor({ x, y, width, height });
        setMenu(true);
      },
      () => {
        setAnchor(fallback());
        setMenu(true);
      },
    );
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
      <View
        ref={rootRef}
        style={styles.root}
        collapsable={false}
        onLayout={(event) => {
          rootSize.current = { width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height };
        }}
      >
        <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
          <View style={styles.headerLeft}>
            <Pressable accessibilityRole="button" accessibilityLabel="我的设置" onPress={() => router.push('/settings')} style={styles.round}>
              <MeAvatar avatar={profile.avatar} />
            </Pressable>
            <MacDots />
            {status !== 'online' && <Text style={styles.status}>{status === 'connecting' ? '连接中…' : '离线'}</Text>}
          </View>
          <View ref={plusRef} collapsable={false}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="新建"
              accessibilityState={{ expanded: menu }}
              onPress={() => (menu ? setMenu(false) : openMenu())}
              style={styles.round}
            >
              <ThinPlusIcon />
            </Pressable>
          </View>
        </View>

        <FlatList
          style={styles.list}
          data={rows}
          keyExtractor={(g) => g.id}
          renderItem={renderRow}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 16 }}
          ListEmptyComponent={<Text style={styles.empty}>{q ? '没有匹配的助手或群聊' : '还没有助手，点右上角的加号新建一个'}</Text>}
        />

        <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12) + 16 }]}>
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
        <BubbleMenu
          open={menu}
          anchor={anchor}
          onClose={() => setMenu(false)}
          items={[
            { label: '新建助手', icon: <AddPersonIcon size={20} />, onPress: () => go('/member/new') },
            { label: '新建群聊', icon: <NewChatIcon />, onPress: () => go('/group/new') },
          ]}
        />
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
