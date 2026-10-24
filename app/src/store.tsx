import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { createApi, socketUrl, type Api } from './api';
import type { AdapterInfo, GroupSummary, MemberView, Message, RelayState, ServerEvent } from './protocol';
import { clearSettings, loadSettings, saveSettings, type ConnectionSettings } from './storage';

type Status = 'offline' | 'connecting' | 'online';

interface State {
  settingsLoaded: boolean;
  settings: ConnectionSettings | null;
  status: Status;
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
  | { type: 'settings'; settings: ConnectionSettings | null }
  | { type: 'status'; status: Status }
  | { type: 'groups'; groups: GroupSummary[] }
  | { type: 'members'; members: MemberView[] }
  | { type: 'adapters'; adapters: AdapterInfo[] }
  | { type: 'messages'; groupId: string; messages: Message[] }
  | { type: 'event'; event: ServerEvent };

const initial: State = {
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
    case 'settings':
      return { ...initial, settingsLoaded: true, settings: action.settings };
    case 'status':
      return { ...state, status: action.status };
    case 'groups': {
      const relays = { ...state.relays };
      for (const g of action.groups) relays[g.id] = g.relay ?? undefined;
      return { ...state, groupsLoaded: true, groups: [...action.groups].sort(byActivity), relays };
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
    case 'event':
      return applyEvent(state, action.event);
  }
}

function applyEvent(state: State, event: ServerEvent): State {
  switch (event.type) {
    case 'message': {
      const m = event.message;
      const groups = state.groups
        .map((g) => (g.id === m.groupId ? { ...g, lastMessage: m, lastActivityAt: m.createdAt } : g))
        .sort(byActivity);
      const messages = state.messages[m.groupId]
        ? { ...state.messages, [m.groupId]: mergeMessages(state.messages[m.groupId], [m]) }
        : state.messages;
      return { ...state, groups, messages };
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
    default:
      return state;
  }
}

interface Store extends State {
  api: Api | null;
  connect(settings: ConnectionSettings): Promise<void>;
  disconnect(): Promise<void>;
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
  const loadedGroups = useRef(new Set<string>());

  useEffect(() => {
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
      if (!api) return;
      loadedGroups.current.add(groupId);
      dispatch({ type: 'messages', groupId, messages: await api.messages(groupId) });
    },
    [api],
  );

  // Initial load and live updates over WebSocket, reconnecting with backoff.
  useEffect(() => {
    if (!api || !state.settings) return;
    loadedGroups.current.clear();
    refreshGroups().catch(() => {});
    refreshMembers().catch(() => {});

    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let closed = false;
    const { serverUrl, token } = state.settings;

    const open = () => {
      if (closed) return;
      dispatch({ type: 'status', status: 'connecting' });
      ws = new WebSocket(socketUrl(serverUrl));
      ws.onopen = () => ws?.send(JSON.stringify({ type: 'auth', token }));
      ws.onmessage = (e) => {
        let event: ServerEvent;
        try {
          event = JSON.parse(String(e.data));
        } catch {
          return;
        }
        if (event.type === 'hello') {
          const reconnect = attempt > 0;
          attempt = 0;
          dispatch({ type: 'status', status: 'online' });
          if (reconnect) {
            // Catch up on anything missed while disconnected.
            refreshGroups().catch(() => {});
            loadedGroups.current.forEach((id) => loadMessages(id).catch(() => {}));
          }
        } else if (event.type === 'groups_changed') {
          refreshGroups().catch(() => {});
        } else if (event.type === 'members_changed') {
          refreshMembers().catch(() => {});
        } else {
          dispatch({ type: 'event', event });
        }
      };
      ws.onclose = () => {
        ws = null;
        if (closed) return;
        dispatch({ type: 'status', status: 'offline' });
        attempt += 1;
        retry = setTimeout(open, Math.min(30000, 1000 * 2 ** Math.min(attempt, 5)));
      };
    };
    open();

    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && !ws) {
        clearTimeout(retry);
        open();
      }
    });

    return () => {
      closed = true;
      clearTimeout(retry);
      sub.remove();
      ws?.close();
    };
  }, [api, state.settings, refreshGroups, refreshMembers, loadMessages]);

  const store: Store = {
    ...state,
    api,
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
    refreshGroups,
    refreshMembers,
    loadMessages,
    async send(groupId, content) {
      if (!api) return;
      const message = await api.send(groupId, content);
      dispatch({ type: 'event', event: { type: 'message', message } });
    },
    upsertGroup(group) {
      const others = state.groups.filter((g) => g.id !== group.id);
      dispatch({ type: 'groups', groups: [group, ...others] });
    },
  };

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside StoreProvider');
  return store;
}
