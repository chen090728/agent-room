import { router } from 'expo-router';
import type { DrawerContentComponentProps } from 'expo-router/drawer';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { shortTime } from '../format';
import type { GroupSummary } from '../protocol';
import { useStore } from '../store';
import { colors } from '../theme';
import { AddPersonIcon, NewChatIcon, SettingsIcon } from './Icons';
import { GroupAvatar, OrbRow } from './Orb';

export function GroupDrawer({ state, navigation }: DrawerContentComponentProps) {
  const { groups, status } = useStore();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const route = state.routes[state.index];
  const currentId = route.name === 'chat/[id]' ? (route.params as { id?: string } | undefined)?.id : undefined;
  const q = query.trim().toLowerCase();
  const visible = q ? groups.filter((g) => g.name.toLowerCase().includes(q)) : groups;

  const go = (path: '/group/new' | '/member/new' | '/settings') => {
    navigation.closeDrawer();
    router.push(currentId && path === '/member/new' ? { pathname: path, params: { groupId: currentId } } : path);
  };

  const open = (g: GroupSummary) => {
    navigation.closeDrawer();
    router.navigate({ pathname: '/chat/[id]', params: { id: g.id } });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 22, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.brand}>
        <OrbRow memberColors={['orange', 'blue', 'green']} r={6.5} gap={0} />
        <Text style={styles.brandText}>AgentHub</Text>
        {status !== 'online' && <Text style={styles.status}>{status === 'connecting' ? '连接中…' : '离线'}</Text>}
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="搜索"
          placeholderTextColor="#A3A3A0"
          accessibilityLabel="搜索群聊"
          style={styles.search}
          returnKeyType="search"
        />
      </View>

      <Pressable accessibilityRole="button" style={({ pressed }) => [styles.action, pressed && styles.pressed]} onPress={() => go('/group/new')}>
        <NewChatIcon />
        <Text style={styles.actionText}>新建群聊</Text>
      </Pressable>
      <Pressable accessibilityRole="button" style={({ pressed }) => [styles.action, pressed && styles.pressed]} onPress={() => go('/member/new')}>
        <AddPersonIcon size={20} />
        <Text style={styles.actionText}>新建助手</Text>
      </Pressable>

      <Text style={styles.section}>群聊</Text>
      <FlatList
        style={styles.list}
        data={visible}
        keyExtractor={(g) => g.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const active = item.id === currentId;
          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => open(item)}
              style={({ pressed }) => [styles.group, active && styles.groupActive, pressed && styles.pressed]}
            >
              <GroupAvatar memberColors={item.members.map((m) => m.color)} ring={active ? colors.selected : colors.bg} />
              <View style={styles.groupText}>
                <Text style={styles.groupName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.groupSub} numberOfLines={1}>
                  {item.relay ? `接力中 ${item.relay.hop}/${item.relay.maxHops}` : shortTime(item.lastActivityAt)}
                </Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>{q ? '没有匹配的群聊' : '还没有群聊'}</Text>}
      />

      <Pressable accessibilityRole="button" style={({ pressed }) => [styles.action, styles.settings, pressed && styles.pressed]} onPress={() => go('/settings')}>
        <SettingsIcon />
        <Text style={styles.actionText}>设置</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 22, paddingTop: 4, paddingBottom: 18 },
  brandText: { fontSize: 17, fontWeight: '600', color: colors.text },
  status: { marginLeft: 'auto', fontSize: 12, color: colors.textSecondary },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 10 },
  search: {
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    fontSize: 14,
    color: colors.text,
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 8, paddingHorizontal: 14, height: 48, borderRadius: 14 },
  actionText: { fontSize: 14, color: colors.text },
  settings: { height: 52 },
  pressed: { backgroundColor: colors.selected },
  section: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 8, fontSize: 12, color: colors.textSecondary },
  list: { flex: 1, paddingHorizontal: 8 },
  group: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14 },
  groupActive: { backgroundColor: colors.selected },
  groupText: { flex: 1, minWidth: 0, gap: 2 },
  groupName: { fontSize: 14, fontWeight: '500', color: colors.text },
  groupSub: { fontSize: 12, color: colors.textSecondary },
  empty: { paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: colors.textSecondary },
});
