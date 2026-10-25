import { router, useLocalSearchParams } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { KeyboardAvoider } from '../../../components/KeyboardAvoider';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAfterTransition } from '../../../afterTransition';
import { Blob, GroupAvatar, MacDots } from '../../../components/Avatar';
import { BubbleMenu, useBubbleAnchor } from '../../../components/BubbleMenu';
import { ConnectionBanner } from '../../../components/ConnectionBanner';
import { PluginChips } from '../../../components/PluginChips';
import { ThinPlusIcon } from '../../../components/Icons';
import { Composer, type PickedFile } from '../../../components/Composer';
import { AddPersonIcon, MenuIcon, NewChatIcon } from '../../../components/Icons';
import { useSheets } from '../../../sheets';
import { MessageItem, TypingRow } from '../../../components/MessageItem';
import { RelayDots } from '../../../components/RelayDots';
import { RoundButton } from '../../../components/ui';
import { useAppTranslation } from '../../../i18n';
import { displayRows, rowKey, type ChatMessage, type ChatRow } from '../../../outgoing';
import type { GroupMemberRef, RelayState } from '../../../protocol';
import { useGroupChannel, useStore } from '../../../store';
import { colors, type Avatar } from '../../../theme';

const FALLBACK_AVATAR: Avatar = { shape: 'circle', color: 'gray' };
const EMPTY_MESSAGES: ChatMessage[] = [];
const EMPTY_TYPING: string[] = [];

// New messages (and "typing…") rise into place and fade in; the history that is
// already there when the chat opens does not animate.
//
// This is a plain animated style started on mount, not a Reanimated layout
// animation (`entering`): the earlier keyframe animation used an ordinary JS
// easing function, which must run on the UI thread, and that crashed the App
// on iOS as soon as a message was sent.
function RiseIn({ children }: { children: ReactNode }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, [progress]);
  const style = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ translateY: (1 - progress.value) * 12 }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

const TypingHeader = memo(function TypingHeader({ typing, members }: { typing: string[]; members: GroupMemberRef[] }) {
  return (
    <View>
      {typing.map((memberId) => {
        const member = members.find((item) => item.id === memberId);
        return member ? (
          <RiseIn key={memberId}>
            <TypingRow name={member.name} avatar={member.avatar} />
          </RiseIn>
        ) : null;
      })}
    </View>
  );
});

const MessageList = memo(function MessageList({
  rows,
  typing,
  members,
  empty,
  onRetry,
  fresh,
}: {
  rows: ChatRow[];
  typing: string[];
  members: GroupMemberRef[];
  empty: string;
  onRetry: (clientKey: string) => void;
  fresh: (key: string) => boolean;
}) {
  const freshRef = useRef(fresh);
  freshRef.current = fresh;
  const renderItem = useCallback(
    ({ item }: { item: ChatRow }) => {
      const body = <MessageItem row={item} onRetry={onRetry} />;
      // The user's own send is already on screen; don't fade it in from nothing.
      if (item.kind !== 'message' || item.message.local || !freshRef.current(item.message.clientKey)) return body;
      return <RiseIn>{body}</RiseIn>;
    },
    [onRetry],
  );
  const header = useMemo(() => <TypingHeader typing={typing} members={members} />, [typing, members]);
  const emptyNode = useMemo(() => <Text style={styles.emptyText}>{empty}</Text>, [empty]);

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      inverted
      data={rows}
      keyExtractor={rowKey}
      renderItem={renderItem}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={header}
      ListEmptyComponent={emptyNode}
    />
  );
});

export default function ChatScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : params.id?.[0] ?? '';
  const insets = useSafeAreaInsets();
  // Insets move when the keyboard shows. They stay in this shell so that
  // update does not re-render the message list. KeyboardAvoider itself only
  // changes padding on the UI thread.
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <KeyboardAvoider style={styles.root} bottomInset={insets.bottom}>
        <ChatPane groupId={id} topInset={insets.top} />
      </KeyboardAvoider>
    </SafeAreaView>
  );
}

const ChatPane = memo(function ChatPane({ groupId, topInset }: { groupId: string; topInset: number }) {
  const { t } = useAppTranslation();
  const id = groupId;
  const store = useStore();
  const { send, retry } = store;
  const sheets = useSheets();
  const [menu, setMenu] = useState(false);
  const [menuShown, setMenuShown] = useState(false);
  const { rootRef, plusRef, onLayout, anchor, measure } = useBubbleAnchor(topInset);
  const group = store.groups.find((g) => g.id === id);
  const messages = store.messages[id];
  const typing = store.typing[id] ?? EMPTY_TYPING;
  const relay = store.relays[id];
  const channel = useGroupChannel(group ? id : undefined);
  const error = channel.error;
  const members = group?.members;

  const refreshIntegrations = store.refreshIntegrations;
  const refreshPlugins = useCallback(() => {
    refreshIntegrations().catch(() => {});
  }, [refreshIntegrations]);
  useAfterTransition(refreshPlugins);

  // Ids present once history is on screen. Later sends are not in the set, so
  // only those rows play the entrance animation.
  const seeded = useRef<{ groupId: string; ids: Set<string> } | null>(null);
  if (seeded.current && seeded.current.groupId !== id) seeded.current = null;
  if (messages && !seeded.current && (messages.length === 0 || messages.some((item) => !item.delivery))) {
    seeded.current = { groupId: id, ids: new Set(messages.map((item) => item.clientKey || item.id)) };
  }
  const fresh = useCallback((key: string) => !!seeded.current && !seeded.current.ids.has(key), []);

  const goHome = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const avatarOf = useCallback(
    (memberId: string | null): Avatar =>
      members?.find((item) => item.id === memberId)?.avatar ?? store.members.find((item) => item.id === memberId)?.avatar ?? FALLBACK_AVATAR,
    [members, store.members],
  );

  const rowCache = useRef<{ groupId: string; view?: ReturnType<typeof displayRows> }>({ groupId: id });
  if (rowCache.current.groupId !== id) rowCache.current = { groupId: id };
  const list = messages ?? EMPTY_MESSAGES;
  const rows = useMemo(() => {
    const next = displayRows(list, avatarOf, rowCache.current.view);
    rowCache.current = { groupId: id, view: next };
    return next.display;
  }, [list, avatarOf, id]);

  const onSend = useCallback(
    (content: string, attachmentIds: string[], attachments: Parameters<typeof send>[3] = []) => {
      send(id, content, attachmentIds, attachments);
    },
    [send, id],
  );
  const onRetry = useCallback((clientKey: string) => retry(id, clientKey), [retry, id]);
  const onUpload = useCallback(
    (file: PickedFile) => {
      if (!store.api) throw new Error(t('chat.notConnected'));
      return store.api.upload(id, file);
    },
    [store.api, id, t],
  );
  const onPlugins = useCallback(() => sheets.open('plugins', { groupId: id }), [sheets, id]);
  const openSettings = useCallback(() => sheets.open('chat-settings', { groupId: id }), [sheets, id]);

  if (!group || !members) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{store.groupsLoaded ? t('chat.notFound') : t('common.loading')}</Text>
        <Pressable accessibilityRole="button" onPress={goHome}>
          <Text style={styles.link}>{t('chat.backToList')}</Text>
        </Pressable>
      </View>
    );
  }

  const direct = group.kind === 'direct';
  const empty = error ?? (messages ? (direct ? t('chat.emptyDirect') : t('chat.emptyGroup')) : '');

  return (
    <View ref={rootRef} style={styles.root} collapsable={false} onLayout={onLayout}>
      <View style={styles.header}>
        <View style={styles.left}>
          <RoundButton label={t('chat.backHomeA11y')} onPress={goHome}>
            <MenuIcon />
          </RoundButton>
          <MacDots />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t('chat.settingsA11y', { name: group.name })} onPress={openSettings} style={styles.center}>
          {direct && members[0] ? <Blob avatar={members[0].avatar} size={34} /> : <GroupAvatar avatars={members.map((item) => item.avatar)} size={36} />}
          <Text style={styles.titleText} numberOfLines={1}>
            {group.name}
          </Text>
        </Pressable>
        <View style={styles.right}>
          <View ref={plusRef} collapsable={false} pointerEvents={menu || menuShown ? 'none' : 'auto'} style={{ opacity: menu || menuShown ? 0 : 1 }}>
            <RoundButton label={t('chat.moreA11y')} onPress={() => (menu ? setMenu(false) : measure(() => setMenu(true)))}>
              <ThinPlusIcon />
            </RoundButton>
          </View>
        </View>
      </View>

      <ConnectionBanner status={channel.status} />

      <MessageList rows={rows} typing={typing} members={members} empty={empty} onRetry={onRetry} fresh={fresh} />

      {relay && <RelayBar relay={relay} />}

      <PluginChips group={group} onPress={(kind) => sheets.open('plugin-detail', { groupId: id, kind })} />

      <View style={styles.composer}>
        <Composer
          members={members}
          onSend={onSend}
          onUpload={onUpload}
          placeholder={direct ? t('chat.placeholderDirect', { name: group.name }) : t('chat.placeholderGroup')}
          showMention={!direct}
          onPlugins={onPlugins}
        />
      </View>

      <BubbleMenu
        open={menu}
        anchor={anchor}
        onVisibility={setMenuShown}
        onClose={() => setMenu(false)}
        items={[
          { label: t('common.newAssistant'), icon: <AddPersonIcon size={20} />, onPress: () => sheets.open('member-new', direct ? {} : { groupId: id }) },
          { label: t('common.newGroup'), icon: <NewChatIcon size={20} />, onPress: () => sheets.open('group-new') },
        ]}
      />
    </View>
  );
});

function RelayBar({ relay }: { relay: RelayState }) {
  const { t } = useAppTranslation();
  return (
    <View style={styles.relay}>
      <RelayDots relay={relay} r={3.5} gap={2.5} />
      <Text style={styles.relayText} numberOfLines={1}>
        {t('chat.relay', { hop: relay.hop, max: relay.maxHops })}
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
  relayText: { flexShrink: 1, fontSize: 12, color: colors.textSecondary },
  composer: { paddingBottom: 10 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, gap: 8 },
  emptyText: { textAlign: 'center', fontSize: 13, color: colors.textSecondary, paddingVertical: 24, paddingHorizontal: 28 },
  link: { fontSize: 14, color: colors.text, textDecorationLine: 'underline' },
});
