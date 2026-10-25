import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { FlatList, KeyboardAvoidingView, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MacDots } from '../../../components/Avatar';
import { Composer } from '../../../components/Composer';
import { AddPersonIcon, MenuIcon, NewChatIcon } from '../../../components/Icons';
import { buildRows, MessageItem, TypingRow } from '../../../components/MessageItem';
import { RelayDots } from '../../../components/RelayDots';
import { showMessage } from '../../../dialogs';
import { RoundButton } from '../../../components/ui';
import type { RelayState } from '../../../protocol';
import { useGroupChannel, useStore } from '../../../store';
import { colors, shadows, type Avatar } from '../../../theme';

const FALLBACK_AVATAR: Avatar = { shape: 'circle', color: 'gray' };

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const { send } = store;
  const group = store.groups.find((g) => g.id === id);
  const messages = store.messages[id];
  const typing = store.typing[id] ?? [];
  const relay = store.relays[id];
  const channel = useGroupChannel(group ? id : undefined);
  const error = channel.error;

  const goHome = () => (router.canGoBack() ? router.back() : router.replace('/'));

  // Members who have left the group are looked up among all assistants.
  const avatarOf = useCallback(
    (memberId: string | null): Avatar =>
      group?.members.find((m) => m.id === memberId)?.avatar ??
      store.members.find((m) => m.id === memberId)?.avatar ??
      FALLBACK_AVATAR,
    [group, store.members],
  );

  // The list is inverted so it starts at the bottom; rows go newest first.
  const rows = useMemo(() => buildRows(messages ?? [], avatarOf).reverse(), [messages, avatarOf]);

  const onSend = async (content: string) => {
    try {
      await send(id, content);
    } catch (e) {
      showMessage('发送失败', (e as Error).message);
      throw e;
    }
  };

  if (!group) {
    return (
      <SafeAreaView style={styles.empty}>
        <Text style={styles.emptyText}>{store.groupsLoaded ? '群聊不存在' : '加载中…'}</Text>
        <Pressable accessibilityRole="button" onPress={goHome}>
          <Text style={styles.link}>回到列表</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const direct = group.kind === 'direct';

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.root} behavior="padding">
        <View style={styles.header}>
          <RoundButton label="回到助手和群聊" onPress={goHome}>
            <MenuIcon />
          </RoundButton>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${group.name}，对话设置`}
            onPress={() => router.push({ pathname: '/chat/[id]/settings', params: { id } })}
            style={styles.titlePill}
          >
            <MacDots small />
            <Text style={styles.titleText} numberOfLines={1}>
              {group.name}
            </Text>
          </Pressable>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" accessibilityLabel="新建群聊" onPress={() => router.push('/group/new')} style={styles.action}>
              <NewChatIcon />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="新建助手" onPress={() => router.push('/member/new')} style={styles.action}>
              <AddPersonIcon />
            </Pressable>
          </View>
        </View>

        {channel.status !== 'online' && (
          <Text style={styles.banner}>{channel.status === 'connecting' ? '正在连接服务器…' : '与服务器断开，正在重连…'}</Text>
        )}

        <FlatList
          style={styles.list}
          contentContainerStyle={styles.listContent}
          inverted
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={({ item }) => <MessageItem row={item} />}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View>
              {typing.map((memberId) => {
                const m = group.members.find((x) => x.id === memberId);
                return m ? <TypingRow key={memberId} name={m.name} avatar={m.avatar} /> : null;
              })}
            </View>
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {error ?? (messages ? (direct ? '发一句话，开始聊天吧' : '还没有消息，@ 一位成员开始聊天吧') : '加载中…')}
            </Text>
          }
        />

        {relay && <RelayBar relay={relay} />}

        <View style={styles.composer}>
          <Composer members={group.members} onSend={onSend} placeholder={direct ? `给${group.name}发消息` : '给群里发消息，@ 点名'} showMention={!direct} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function RelayBar({ relay }: { relay: RelayState }) {
  return (
    <View style={styles.relay}>
      <RelayDots relay={relay} r={3.5} gap={2.5} />
      <Text style={styles.relayText}>
        接力 {relay.hop} / {relay.maxHops}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 16, paddingTop: 14 },
  titlePill: {
    flexShrink: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 36,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    boxShadow: '0 6px 20px rgba(0,0,0,0.06)',
  },
  titleText: { flexShrink: 1, fontSize: 13, fontWeight: '500', color: colors.text },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    boxShadow: shadows.float,
  },
  action: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  banner: { textAlign: 'center', fontSize: 12, color: colors.warning, paddingTop: 10 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 18, paddingTop: 5, paddingBottom: 15 },
  relay: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingBottom: 12 },
  relayText: { fontSize: 12, color: colors.textSecondary },
  composer: { paddingBottom: 10 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, gap: 8 },
  emptyText: { textAlign: 'center', fontSize: 13, color: colors.textSecondary, paddingVertical: 24 },
  link: { fontSize: 14, color: colors.text, textDecorationLine: 'underline' },
});
