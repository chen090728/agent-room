import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { createApi, socketUrl, type Api } from './api';
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
  | { type: 'settings'; settings: ConnectionSettings | null }
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
    case 'settings':
      return { ...initial, profile: state.profile, settingsLoaded: true, settings: action.settings };
    case 'status':
      return { ...state, status: action.status };
    case 'groups': {
      const relays = { ...state.relays };
      for (const g of action.groups) relays[g.id] = g.relay ?? undefined;
      return { ...state, groupsLoaded: true, groups: [...action.groups].sort(byActivity), relays };
    }
    case 'group': {
      const g = action.group;
      return {
        ...state,
        groups: [g, ...state.groups.filter((x) => x.id !== g.id)].sort(byActivity),
        relays: { ...state.relays, [g.id]: g.relay ?? undefined },
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
      senderName: profileRef.current.nickname || '我',
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
    loadProfile().then((profile) => dispatch({ type: 'profile', profile }));
    loadSettings()
      .then((settings) => dispatch({ type: 'settings', settings }))
      .catch(() => dispatch({ type: 'settings', settings: null }));
  }, []);

  const refreshGroups = useCallback(async () => {
    if (api) dispatch({ type: 'groups', groups: await api.groups() });
  }, [api]);

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

  const loadMessages = useCallback(
    async (groupId: string) => {
      if (api) dispatch({ type: 'messages', groupId, messages: await api.messages(groupId) });
    },
    [api],
  );

  // Group-list connection (/ws): stays open while the App is connected.
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
      onEvent: (event: ListEvent) => {
        if (event.type === 'group_updated') dispatch({ type: 'group', group: event.group });
        else if (event.type === 'groups_changed') refreshGroups().catch(() => {});
        else if (event.type === 'members_changed') refreshMembers().catch(() => {});
      },
    });
  }, [api, state.settings, refreshGroups, refreshMembers]);

  const store: Store = {
    ...state,
    api,
    dispatch,
    async connect(settings) {
      // Verify before saving so a typo never locks the user out.
      await createApi(settings).groups();
      await saveSettings(settings);
      dispatch({ type: 'settings', settings });
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
 * Chat connection (/ws/groups/:id) for the group on screen: loads its history
 * and streams new messages, typing and relay progress while mounted.
 */
export function useGroupChannel(groupId: string | undefined): { status: SocketStatus; error: string | null } {
  const { settings, dispatch, loadMessages } = useStore();
  const [status, setStatus] = useState<SocketStatus>('connecting');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId || !settings) return;
    setError(null);
    const load = () => loadMessages(groupId).then(() => setError(null), (e) => setError(e.message));
    load();
    return openSocket({
      url: socketUrl(settings.serverUrl, groupId),
      token: settings.token,
      onStatus: setStatus,
      onReconnect: load,
      onEvent: (event: ChatEvent) => dispatch({ type: 'chat', event }),
    });
  }, [groupId, settings, dispatch, loadMessages]);

  return { status, error };
}
