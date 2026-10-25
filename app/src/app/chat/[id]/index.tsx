import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { KeyboardAvoider } from '../../../components/KeyboardAvoider';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Blob, GroupAvatar, MacDots } from '../../../components/Avatar';
import { useAfterTransition } from '../../../afterTransition';
import { BubbleMenu, useBubbleAnchor } from '../../../components/BubbleMenu';
import { ConnectionBanner } from '../../../components/ConnectionBanner';
import { PluginChips } from '../../../components/PluginChips';
import { ThinPlusIcon } from '../../../components/Icons';
import { Composer } from '../../../components/Composer';
import { AddPersonIcon, MenuIcon, NewChatIcon } from '../../../components/Icons';
import { useSheets } from '../../../sheets';
import { buildRows, MessageItem, TypingRow } from '../../../components/MessageItem';
import { RelayDots } from '../../../components/RelayDots';
import { showMessage } from '../../../dialogs';
import { RoundButton } from '../../../components/ui';
import type { RelayState } from '../../../protocol';
import { useGroupChannel, useStore } from '../../../store';
import { colors, shadows, type Avatar } from '../../../theme';

const FALLBACK_AVATAR: Avatar = { shape: 'circle', color: 'gray' };

// New messages (and "typing…") rise into place and fade in; the history that is
// already there when the chat opens does not animate.
//
// This is a plain animated style started on mount, not a Reanimated layout
// animation (`entering`): the earlier keyframe animation used an ordinary JS
// easing function, which must run on the UI thread, and that crashed the App
// on iOS as soon as a message was sent.
function Rise({ animate, children }: { animate: boolean; children: ReactNode }) {
  return animate ? <RiseIn>{children}</RiseIn> : <>{children}</>;
}

function RiseIn({ children }: { children: ReactNode }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, [progress]);
  const style = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ translateY: (1 - progress.value) * 12 }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const { send, refreshIntegrations } = store;
  const sheets = useSheets();
  const [menu, setMenu] = useState(false);
  const [menuShown, setMenuShown] = useState(false);
  const insets = useSafeAreaInsets();
  const { rootRef, plusRef, onLayout, anchor, measure } = useBubbleAnchor(insets.top);
  const group = store.groups.find((g) => g.id === id);
  const messages = store.messages[id];
  const typing = store.typing[id] ?? [];
  const relay = store.relays[id];
  const channel = useGroupChannel(group ? id : undefined);
  const error = channel.error;

  const refreshPlugins = useCallback(() => {
    refreshIntegrations().catch(() => {});
  }, [refreshIntegrations]);
  useAfterTransition(refreshPlugins);

  // Remember which messages were there when the chat opened, so only later ones animate.
  const opened = useRef<{ groupId: string; ids: Set<string> } | null>(null);
  if (messages && (!opened.current || opened.current.groupId !== id)) opened.current = { groupId: id, ids: new Set(messages.map((m) => m.id)) };

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

  const onSend = async (content: string, attachmentIds: string[]) => {
    try {
      await send(id, content, attachmentIds);
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
      <View ref={rootRef} style={styles.root} collapsable={false} onLayout={onLayout}>
      <KeyboardAvoider style={styles.root} bottomInset={insets.bottom}>
        <View style={styles.header}>
          <View style={styles.left}>
            <RoundButton label="回到助手和群聊" onPress={goHome}>
              <MenuIcon />
            </RoundButton>
            <MacDots />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${group.name}，对话设置`}
            onPress={() => sheets.open('chat-settings', { groupId: id })}
            style={styles.center}
          >
            {direct && group.members[0] ? <Blob avatar={group.members[0].avatar} size={34} /> : <GroupAvatar avatars={group.members.map((m) => m.avatar)} size={36} />}
            <Text style={styles.titleText} numberOfLines={1}>
              {group.name}
            </Text>
          </Pressable>
          <View style={styles.right}>
            <View ref={plusRef} collapsable={false} pointerEvents={menu || menuShown ? 'none' : 'auto'} style={{ opacity: menu || menuShown ? 0 : 1 }}>
              <RoundButton label="更多" onPress={() => (menu ? setMenu(false) : measure(() => setMenu(true)))}>
                <ThinPlusIcon />
              </RoundButton>
            </View>
          </View>
        </View>

        <ConnectionBanner status={channel.status} />

        <FlatList
          style={styles.list}
          contentContainerStyle={styles.listContent}
          inverted
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={({ item }) => (
            <Rise animate={item.kind === 'message' && !!opened.current && !opened.current.ids.has(item.message.id)}>
              <MessageItem row={item} />
            </Rise>
          )}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View>
              {typing.map((memberId) => {
                const m = group.members.find((x) => x.id === memberId);
                return m ? (
                  <Rise key={memberId} animate>
                    <TypingRow name={m.name} avatar={m.avatar} />
                  </Rise>
                ) : null;
              })}
            </View>
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {error ?? (messages ? (direct ? '发一句话，开始聊天吧' : '还没有消息，@ 一位成员开始聊天吧') : '')}
            </Text>
          }
        />

        {relay && <RelayBar relay={relay} />}

        <PluginChips group={group} onPress={(kind) => sheets.open('plugin-detail', { groupId: id, kind })} />

        <View style={styles.composer}>
          <Composer
            members={group.members}
            onSend={onSend}
            onUpload={(file) => {
              if (!store.api) throw new Error('还没有连接服务器');
              return store.api.upload(id, file);
            }}
            placeholder={direct ? `给${group.name}发消息` : '给群里发消息，@ 点名'}
            showMention={!direct}
            onPlugins={() => sheets.open('plugins', { groupId: id })}
          />
        </View>
      </KeyboardAvoider>

      <BubbleMenu
        open={menu}
        anchor={anchor}
        onVisibility={setMenuShown}
        onClose={() => setMenu(false)}
        items={[
          { label: '新建助手', icon: <AddPersonIcon size={20} />, onPress: () => sheets.open('member-new', direct ? {} : { groupId: id }) },
          { label: '新建群聊', icon: <NewChatIcon size={20} />, onPress: () => sheets.open('group-new') },
        ]}
      />
      </View>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  left: { width: 110, flexDirection: 'row', alignItems: 'center', gap: 10 },
  right: { width: 110, alignItems: 'flex-end' },
  center: { flex: 1, alignItems: 'center', gap: 3, paddingTop: 4 },
  titleText: { fontSize: 12.5, fontWeight: '500', color: colors.text, maxWidth: '100%' },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 18, paddingTop: 5, paddingBottom: 15 },
  relay: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingBottom: 12 },
  relayText: { fontSize: 12, color: colors.textSecondary },
  composer: { paddingBottom: 10 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, gap: 8 },
  emptyText: { textAlign: 'center', fontSize: 13, color: colors.textSecondary, paddingVertical: 24 },
  link: { fontSize: 14, color: colors.text, textDecorationLine: 'underline' },
});
