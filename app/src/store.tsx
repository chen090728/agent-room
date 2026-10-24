import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import { createApi, socketUrl, type Api } from './api';
import type { AdapterInfo, ChatEvent, GroupSummary, ListEvent, MemberView, Message, RelayState } from './protocol';
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
  settingsLoaded: boolean;
  settings: ConnectionSettings | null;
  /** Status of the group-list connection. */
  status: SocketStatus;
  groupsLoaded: boolean;
  groups: GroupSummary[];
  members: MemberView[];
  adapters: AdapterInfo[];
  /** Loaded messages per group, oldest first. */
  messages: Record<string, Message[]>;
  /** Member ids currently composing a reply, per group. */
  typing: Record<string, string[]>;
  relays: Record<string, RelayState | undefined>;
}

type Action =
  | { type: 'profile'; profile: Profile }
  | { type: 'settings'; settings: ConnectionSettings | null }
  | { type: 'status'; status: SocketStatus }
  | { type: 'groups'; groups: GroupSummary[] }
  | { type: 'members'; members: MemberView[] }
  | { type: 'adapters'; adapters: AdapterInfo[] }
  | { type: 'messages'; groupId: string; messages: Message[] }
  | { type: 'group'; group: GroupSummary }
  | { type: 'chat'; event: ChatEvent };

const initial: State = {
  profile: DEFAULT_PROFILE,
  settingsLoaded: false,
  settings: null,
  status: 'offline',
  groupsLoaded: false,
  groups: [],
  members: [],
  adapters: [],
  messages: {},
  typing: {},
  relays: {},
};

const byActivity = (a: GroupSummary, b: GroupSummary) => b.lastActivityAt - a.lastActivityAt;

function mergeMessages(existing: Message[] = [], incoming: Message[]): Message[] {
  const seen = new Set(existing.map((m) => m.id));
  const added = incoming.filter((m) => !seen.has(m.id));
  if (!added.length) return existing;
  return [...existing, ...added].sort((a, b) => a.createdAt - b.createdAt);
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'profile':
      return { ...state, profile: action.profile };
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
    case 'messages':
      return {
        ...state,
        messages: { ...state.messages, [action.groupId]: mergeMessages(state.messages[action.groupId], action.messages) },
      };
    case 'chat':
      return applyChatEvent(state, action.event);
  }
}

function applyChatEvent(state: State, event: ChatEvent): State {
  switch (event.type) {
    case 'message': {
      const m = event.message;
      const groups = state.groups
        .map((g) => (g.id === m.groupId ? { ...g, lastMessage: m, lastActivityAt: m.createdAt } : g))
        .sort(byActivity);
      return {
        ...state,
        groups,
        messages: { ...state.messages, [m.groupId]: mergeMessages(state.messages[m.groupId], [m]) },
      };
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
  loadMessages(groupId: string): Promise<void>;
  send(groupId: string, content: string): Promise<void>;
  /** Inserts a group returned by the API right away, before the next refresh. */
  upsertGroup(group: GroupSummary): void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const api = useMemo(() => (state.settings ? createApi(state.settings) : null), [state.settings]);

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
    loadMessages,
    async send(groupId, content) {
      if (!api) return;
      const message = await api.send(groupId, content);
      dispatch({ type: 'chat', event: { type: 'message', message } });
    },
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
