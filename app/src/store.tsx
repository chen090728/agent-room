import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAfterTransition } from './afterTransition';
import { createApi, socketUrl, type Api } from './api';
import { buildSnapshot, readRoomCache, writeRoomCache, type RoomSnapshot } from './cache';
import { applyGroupSummary, chatEventFromList, historySyncNeeded, typingMemberIds } from './live';
import {
  acknowledge,
  addIncoming,
  appendOutgoing,
  createOutgoing,
  markFailed,
  markSending,
  mergeServerMessages,
  nextClientKey,
  replaceMessage,
  type ChatMessage,
} from './outgoing';
import type { AdapterInfo, Attachment, ChatEvent, GroupSummary, IntegrationView, ListEvent, MemberView, Message, RelayState } from './protocol';
import { openSocket, type SocketStatus } from './socket';
import {
  clearSettings,
  DEFAULT_PROFILE,
  displayNickname,
  loadProfile,
  loadSettings,
  saveProfile,
  saveSettings,
  type ConnectionSettings,
  type Profile,
} from './storage';

interface State {
  profile: Profile;
  /** Whether the server can store files (hides "upload a picture" when it cannot). */
  filesEnabled: boolean;
  settingsLoaded: boolean;
  settings: ConnectionSettings | null;
  /** Status of the group-list connection. */
  status: SocketStatus;
  groupsLoaded: boolean;
  groups: GroupSummary[];
  members: MemberView[];
  adapters: AdapterInfo[];
  integrations: IntegrationView[];
  integrationTypes: AdapterInfo[];
  /** Loaded messages per group, oldest first. Includes optimistic sends. */
  messages: Record<string, ChatMessage[]>;
  /** Member ids currently composing a reply, per group. */
  typing: Record<string, string[]>;
  relays: Record<string, RelayState | undefined>;
}

type Action =
  | { type: 'profile'; profile: Profile }
  | { type: 'files'; enabled: boolean }
  | { type: 'settings'; settings: ConnectionSettings | null; snap?: RoomSnapshot | null }
  | { type: 'status'; status: SocketStatus }
  | { type: 'groups'; groups: GroupSummary[] }
  | { type: 'members'; members: MemberView[] }
  | { type: 'adapters'; adapters: AdapterInfo[] }
  | { type: 'integrations'; integrations: IntegrationView[]; types: AdapterInfo[] }
  | { type: 'messages'; groupId: string; messages: Message[] }
  | { type: 'group'; group: GroupSummary }
  | { type: 'chat'; event: ChatEvent }
  | { type: 'outgoing'; message: ChatMessage }
  | { type: 'outgoing-sending'; groupId: string; clientKey: string }
  | { type: 'outgoing-failed'; groupId: string; clientKey: string }
  | { type: 'outgoing-ack'; clientKey: string; message: Message };

const initial: State = {
  profile: DEFAULT_PROFILE,
  filesEnabled: false,
  settingsLoaded: false,
  settings: null,
  status: 'offline',
  groupsLoaded: false,
  groups: [],
  members: [],
  adapters: [],
  integrations: [],
  integrationTypes: [],
  messages: {},
  typing: {},
  relays: {},
};

const byActivity = (a: GroupSummary, b: GroupSummary) => b.lastActivityAt - a.lastActivityAt;

function cachedMessages(snap: RoomSnapshot): Record<string, ChatMessage[]> {
  const messages: Record<string, ChatMessage[]> = {};
  for (const [groupId, list] of Object.entries(snap.messages)) {
    messages[groupId] = list.map((item) => ({ ...item, clientKey: item.clientKey || item.id }));
  }
  return messages;
}

function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Swap in a new message list and point the group preview at its newest row. Same list means no update. */
function commitMessages(state: State, groupId: string, list: ChatMessage[]): State {
  if (state.messages[groupId] === list) return state;
  const last = list[list.length - 1];
  let groups = state.groups;
  if (last) {
    const index = groups.findIndex((g) => g.id === groupId);
    if (index >= 0) {
      const current = groups[index];
      const lastActivityAt = Math.max(current.lastActivityAt, last.createdAt);
      if (current.lastMessage !== last || current.lastActivityAt !== lastActivityAt) {
        const updated = { ...current, lastMessage: last, lastActivityAt };
        groups = groups.map((item, i) => (i === index ? updated : item)).sort(byActivity);
      }
    }
  }
  return { ...state, groups, messages: { ...state.messages, [groupId]: list } };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'profile':
      return { ...state, profile: action.profile };
    case 'files':
      return { ...state, filesEnabled: action.enabled };
    case 'settings': {
      const base: State = { ...initial, profile: state.profile, settingsLoaded: true, settings: action.settings };
      const snap = action.snap;
      if (!snap) return base;
      const relays: State['relays'] = {};
      const typing: State['typing'] = {};
      for (const group of snap.groups) {
        relays[group.id] = group.relay ?? undefined;
        const ids = typingMemberIds(group);
        if (ids.length) typing[group.id] = ids;
      }
      return {
        ...base,
        groupsLoaded: true,
        groups: [...snap.groups].sort(byActivity),
        members: snap.members,
        messages: cachedMessages(snap),
        relays,
        typing,
      };
    }
    case 'status':
      return { ...state, status: action.status };
    case 'groups': {
      const relays = { ...state.relays };
      for (const g of action.groups) relays[g.id] = g.relay ?? undefined;
      return { ...state, groupsLoaded: true, groups: [...action.groups].sort(byActivity), relays };
    }
    case 'group': {
      const g = action.group;
      const folded = applyGroupSummary(state.messages[g.id], g);
      const typing = folded.typing;
      const prevTyping = state.typing[g.id] ?? [];
      return {
        ...state,
        groups: [g, ...state.groups.filter((x) => x.id !== g.id)].sort(byActivity),
        relays: { ...state.relays, [g.id]: g.relay ?? undefined },
        messages: folded.changed ? { ...state.messages, [g.id]: folded.messages ?? [] } : state.messages,
        typing: sameIds(prevTyping, typing) ? state.typing : { ...state.typing, [g.id]: typing },
      };
    }
    case 'members':
      return { ...state, members: action.members };
    case 'adapters':
      return { ...state, adapters: action.adapters };
    case 'integrations':
      return { ...state, integrations: action.integrations, integrationTypes: action.types };
    case 'messages':
      return commitMessages(state, action.groupId, mergeServerMessages(state.messages[action.groupId], action.messages));
    case 'chat':
      return applyChatEvent(state, action.event);
    case 'outgoing':
      return commitMessages(state, action.message.groupId, appendOutgoing(state.messages[action.message.groupId], action.message));
    case 'outgoing-sending':
      return commitMessages(state, action.groupId, markSending(state.messages[action.groupId] ?? [], action.clientKey));
    case 'outgoing-failed':
      return commitMessages(state, action.groupId, markFailed(state.messages[action.groupId] ?? [], action.clientKey));
    case 'outgoing-ack':
      return commitMessages(state, action.message.groupId, acknowledge(state.messages[action.message.groupId] ?? [], action.clientKey, action.message));
  }
}

function applyChatEvent(state: State, event: ChatEvent): State {
  switch (event.type) {
    case 'message':
      return commitMessages(state, event.message.groupId, addIncoming(state.messages[event.message.groupId], event.message));
    case 'message_updated': {
      const list = state.messages[event.message.groupId];
      if (!list) return state;
      return commitMessages(state, event.message.groupId, replaceMessage(list, event.message));
    }
    case 'typing': {
      const current = (state.typing[event.groupId] ?? []).filter((id) => id !== event.memberId);
      return {
        ...state,
        typing: { ...state.typing, [event.groupId]: event.active ? [...current, event.memberId] : current },
      };
    }
    case 'relay':
      return {
        ...state,
        relays: { ...state.relays, [event.relay.groupId]: event.relay.active ? event.relay : undefined },
      };
  }
}

interface Store extends State {
  api: Api | null;
  dispatch: React.Dispatch<Action>;
  connect(settings: ConnectionSettings): Promise<void>;
  disconnect(): Promise<void>;
  updateProfile(profile: Profile): Promise<void>;
  refreshGroups(): Promise<void>;
  refreshMembers(): Promise<void>;
  refreshIntegrations(): Promise<void>;
  loadMessages(groupId: string): Promise<void>;
  /** Shows the message immediately, then delivers it. Does not touch storage. */
  send(groupId: string, content: string, attachmentIds?: string[], attachments?: Attachment[]): void;
  /** Retries a message that is showing "发送失败，点击重试". */
  retry(groupId: string, clientKey: string): void;
  /** Inserts a group returned by the API right away, before the next refresh. */
  upsertGroup(group: GroupSummary): void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const api = useMemo(() => (state.settings ? createApi(state.settings) : null), [state.settings]);
  const apiRef = useRef(api);
  apiRef.current = api;
  const profileRef = useRef(state.profile);
  profileRef.current = state.profile;
  const messagesRef = useRef(state.messages);
  messagesRef.current = state.messages;
  const inflight = useRef(new Set<string>());
  const syncTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const deliver = useCallback((groupId: string, clientKey: string, content: string, attachmentIds: string[]) => {
    inflight.current.add(clientKey);
    // After the optimistic row has been painted. Nothing on this path reads or writes storage.
    setTimeout(() => {
      const apiNow = apiRef.current;
      if (!apiNow) {
        inflight.current.delete(clientKey);
        dispatch({ type: 'outgoing-failed', groupId, clientKey });
        return;
      }
      void apiNow
        .send(groupId, content, attachmentIds)
        .then((message) => {
          inflight.current.delete(clientKey);
          dispatch({ type: 'outgoing-ack', clientKey, message });
        })
        .catch(() => {
          inflight.current.delete(clientKey);
          dispatch({ type: 'outgoing-failed', groupId, clientKey });
        });
    }, 0);
  }, []);

  const send = useCallback((groupId: string, content: string, attachmentIds: string[] = [], attachments: Attachment[] = []) => {
    const clientKey = nextClientKey();
    const message = createOutgoing({
      groupId,
      content,
      attachmentIds,
      attachments,
      senderName: displayNickname(profileRef.current.nickname),
      now: Date.now(),
      clientKey,
    });
    if (!apiRef.current) {
      dispatch({ type: 'outgoing', message: { ...message, delivery: 'failed' } });
      return;
    }
    dispatch({ type: 'outgoing', message });
    deliver(groupId, clientKey, content, attachmentIds);
  }, [deliver]);

  const retry = useCallback((groupId: string, clientKey: string) => {
    const message = messagesRef.current[groupId]?.find((item) => item.clientKey === clientKey);
    if (!message?.pending || message.delivery === 'sending' || inflight.current.has(clientKey)) return;
    if (!apiRef.current) return;
    dispatch({ type: 'outgoing-sending', groupId, clientKey });
    deliver(groupId, clientKey, message.pending.content, message.pending.attachmentIds);
  }, [deliver]);

  useEffect(() => {
    let cancelled = false;
    loadProfile().then((profile) => {
      if (!cancelled) dispatch({ type: 'profile', profile });
    });
    loadSettings()
      .then(async (settings) => {
        const snap = settings ? await readRoomCache(AsyncStorage, settings.serverUrl) : null;
        if (!cancelled) dispatch({ type: 'settings', settings, snap });
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: 'settings', settings: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMessages = useCallback(
    async (groupId: string) => {
      if (api) dispatch({ type: 'messages', groupId, messages: await api.messages(groupId) });
    },
    [api],
  );
  const loadRef = useRef(loadMessages);
  loadRef.current = loadMessages;

  const scheduleHistorySync = useCallback((groupId: string) => {
    const pending = syncTimers.current.get(groupId);
    if (pending) clearTimeout(pending);
    syncTimers.current.set(
      groupId,
      setTimeout(() => {
        syncTimers.current.delete(groupId);
        loadRef.current(groupId).catch(() => {});
      }, 300),
    );
  }, []);

  useEffect(
    () => () => {
      for (const timer of syncTimers.current.values()) clearTimeout(timer);
    },
    [],
  );

  const refreshGroups = useCallback(async () => {
    if (!api) return;
    const groups = await api.groups();
    dispatch({ type: 'groups', groups });
    for (const group of groups) {
      if (historySyncNeeded(messagesRef.current[group.id], group.lastMessage)) scheduleHistorySync(group.id);
    }
  }, [api, scheduleHistorySync]);

  const refreshMembers = useCallback(async () => {
    if (!api) return;
    const [members, adapters] = await Promise.all([api.members(), api.adapters()]);
    dispatch({ type: 'members', members });
    dispatch({ type: 'adapters', adapters });
  }, [api]);

  const refreshIntegrations = useCallback(async () => {
    if (!api) return;
    const [integrations, types] = await Promise.all([api.integrations(), api.integrationTypes()]);
    dispatch({ type: 'integrations', integrations, types });
  }, [api]);

  // One WebSocket for the whole app (/ws). Chat screens do not open their own.
  useEffect(() => {
    if (!api || !state.settings) return;
    refreshGroups().catch(() => {});
    refreshMembers().catch(() => {});
    api.filesEnabled().then((enabled) => dispatch({ type: 'files', enabled }));
    return openSocket({
      url: socketUrl(state.settings.serverUrl),
      token: state.settings.token,
      onStatus: (status) => dispatch({ type: 'status', status }),
      onReconnect: () => refreshGroups().catch(() => {}),
      onLanguage: () => {
        refreshGroups().catch(() => {});
        refreshMembers().catch(() => {});
      },
      onEvent: (event: ListEvent) => {
        const chat = chatEventFromList(event);
        if (chat) {
          dispatch({ type: 'chat', event: chat });
          return;
        }
        if (event.type === 'group_updated') {
          dispatch({ type: 'group', group: event.group });
          if (historySyncNeeded(messagesRef.current[event.group.id], event.group.lastMessage)) scheduleHistorySync(event.group.id);
        } else if (event.type === 'groups_changed') refreshGroups().catch(() => {});
        else if (event.type === 'members_changed') refreshMembers().catch(() => {});
      },
    });
  }, [api, state.settings, refreshGroups, refreshMembers, scheduleHistorySync]);

  useEffect(() => {
    if (!state.settings || !state.groupsLoaded) return;
    const snapshot = buildSnapshot(state.settings.serverUrl, state.groups, state.members, state.messages);
    const handle = setTimeout(() => {
      writeRoomCache(AsyncStorage, snapshot).catch(() => {});
    }, 400);
    return () => clearTimeout(handle);
  }, [state.settings, state.groupsLoaded, state.groups, state.members, state.messages]);

  const store: Store = {
    ...state,
    api,
    dispatch,
    async connect(settings) {
      // Verify before saving so a typo never locks the user out.
      await createApi(settings).groups();
      await saveSettings(settings);
      const snap = await readRoomCache(AsyncStorage, settings.serverUrl);
      dispatch({ type: 'settings', settings, snap });
    },
    async disconnect() {
      await clearSettings();
      dispatch({ type: 'settings', settings: null });
    },
    async updateProfile(profile) {
      dispatch({ type: 'profile', profile });
      await saveProfile(profile);
    },
    refreshGroups,
    refreshMembers,
    refreshIntegrations,
    loadMessages,
    send,
    retry,
    upsertGroup(group) {
      dispatch({ type: 'group', group });
    },
  };

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside StoreProvider');
  return store;
}

/**
 * The chat on screen. History is whatever is already cached; a refresh is
 * deferred until the push transition ends. Live rows come from the app socket.
 */
export function useGroupChannel(groupId: string | undefined): { status: SocketStatus; error: string | null } {
  const { settings, status, loadMessages } = useStore();
  const [error, setError] = useState<string | null>(null);
  const sync = useCallback(() => {
    if (!groupId) return;
    loadMessages(groupId).then(
      () => setError(null),
      (e: Error) => setError(e.message),
    );
  }, [groupId, loadMessages]);
  useAfterTransition(sync, Boolean(groupId && settings));
  return { status, error };
}
