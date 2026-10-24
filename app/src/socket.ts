import { AppState } from 'react-native';

export type SocketStatus = 'offline' | 'connecting' | 'online';

interface Options {
  url: string;
  token: string;
  onEvent: (event: any) => void;
  onStatus: (status: SocketStatus) => void;
  /** Called after a dropped connection is re-established, to catch up. */
  onReconnect?: () => void;
}

/**
 * Opens an authenticated AgentHub WebSocket and keeps it open: reconnects with
 * backoff, and right away when the App returns to the foreground.
 * Returns a function that closes it for good.
 */
export function openSocket({ url, token, onEvent, onStatus, onReconnect }: Options): () => void {
  let ws: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let closed = false;

  const open = () => {
    if (closed) return;
    onStatus('connecting');
    ws = new WebSocket(url);
    ws.onopen = () => ws?.send(JSON.stringify({ type: 'auth', token }));
    ws.onmessage = (e) => {
      let event: any;
      try {
        event = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (event.type === 'hello') {
        const reconnected = attempt > 0;
        attempt = 0;
        onStatus('online');
        if (reconnected) onReconnect?.();
      } else {
        onEvent(event);
      }
    };
    ws.onclose = () => {
      ws = null;
      if (closed) return;
      onStatus('offline');
      attempt += 1;
      retry = setTimeout(open, Math.min(30000, 1000 * 2 ** Math.min(attempt, 5)));
    };
  };
  open();

  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active' && !ws) {
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
}
