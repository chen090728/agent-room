import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { BridgeStatus } from '../protocol';
import { useStore } from '../store';
import { useTheme, useThemedStyles, type ThemeColors, type ThemeShadows } from '../theme';
import { CheckIcon } from './Icons';
import { Card, ErrorText, SectionLabel } from './ui';

const TOOL_NAMES: Record<string, string> = { claude: 'Claude Code', codex: 'Codex' };

/** ABCD-EFGH, easier to read and type than eight letters in a row. */
const formatCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

/**
 * Pairs a work assistant with a computer: shows a one-time code and the command
 * to run there, and follows the connection until the bridge shows up.
 */
export function BridgePairing({ memberId }: { memberId: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { api, settings } = useStore();
  const [code, setCode] = useState<{ code: string; expiresAt: number } | null>(null);
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  const refreshStatus = useCallback(async () => {
    if (!api) return;
    try {
      setStatus(await api.bridgeStatus(memberId));
    } catch {
      // Keep the last known status; the next poll tries again.
    }
  }, [api, memberId]);

  const newCode = useCallback(async () => {
    if (!api) return;
    setBusy(true);
    setError(null);
    try {
      setCode(await api.createPairing(memberId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [api, memberId]);

  useEffect(() => {
    newCode();
  }, [newCode]);

  useEffect(() => {
    refreshStatus();
    const t = setInterval(() => {
      setNow(Date.now());
      refreshStatus();
    }, 3000);
    return () => clearInterval(t);
  }, [refreshStatus]);

  const expired = !!code && code.expiresAt < now;
  const server = settings?.serverUrl ?? '你的服务器地址';
  const command = code ? `agenthub-bridge pair ${server} ${code.code}` : '';

  return (
    <View style={styles.root}>
      <View style={styles.section}>
        <SectionLabel>状态</SectionLabel>
        <Card>
          <View style={styles.statusRow}>
            {status?.online ? (
              <View style={styles.okDot}>
                <CheckIcon size={11} />
              </View>
            ) : (
              <View style={[styles.okDot, { backgroundColor: status?.paired ? colors.warning : colors.border }]} />
            )}
            <View style={styles.statusText}>
              <Text style={styles.statusTitle}>{status?.online ? '电脑已连接' : status?.paired ? '已配对，电脑没有在线' : '还没有配对'}</Text>
              <Text style={styles.sub}>
                {status?.paired
                  ? `${status.name ?? '电脑'}${status.tools.length ? ` · ${status.tools.map((t) => TOOL_NAMES[t] ?? t).join('、')}` : ''}`
                  : '在电脑上按下面的步骤操作'}
              </Text>
            </View>
          </View>
        </Card>
      </View>

      <View style={styles.section}>
        <SectionLabel>{status?.paired ? '重新配对 / 换一台电脑' : '配对码'}</SectionLabel>
        <Card>
          <View style={styles.codeBox}>
            {busy && !code ? (
              <ActivityIndicator color={colors.textSecondary} />
            ) : code ? (
              <>
                <Text style={[styles.code, expired && styles.codeExpired]} selectable accessibilityLabel={`配对码 ${code.code.split('').join(' ')}`}>
                  {formatCode(code.code)}
                </Text>
                <Text style={styles.sub}>{expired ? '已过期' : '10 分钟内有效，只能用一次'}</Text>
              </>
            ) : null}
            <Pressable accessibilityRole="button" onPress={newCode} disabled={busy} style={styles.refresh}>
              <Text style={styles.refreshText}>{expired ? '重新获取配对码' : '换一个配对码'}</Text>
            </Pressable>
          </View>
        </Card>
        <ErrorText>{error}</ErrorText>
      </View>

      <View style={styles.section}>
        <SectionLabel>在你的电脑上</SectionLabel>
        <View style={styles.steps}>
          <Text style={styles.step}>1. 电脑上要先装好并登录 Claude Code 或 Codex（这是你自己的账号，AgentHub 看不到登录信息）。</Text>
          <Text style={styles.step}>2. 在项目的 bridge 目录里运行 npm install 和 npm run build，得到 dist/agenthub-bridge.cjs。</Text>
          <Text style={styles.step}>3. 配对（把下面这行粘贴到终端）：</Text>
          <Text style={styles.command} selectable>
            {command ? `node dist/agenthub-bridge.cjs ${command.replace('agenthub-bridge ', '')}` : '…'}
          </Text>
          <Text style={styles.step}>4. 开始接任务（在你想让它工作的目录里运行；默认只读，要让它改文件再加 --allow-write）：</Text>
          <Text style={styles.command} selectable>
            node dist/agenthub-bridge.cjs run
          </Text>
          <Text style={styles.step}>
            5. 上面的"状态"变成"电脑已连接"后，就可以在聊天里和这个助手说话了。使用 Claude Code、Codex 要遵守它们各自的使用条款，请自行确认。
          </Text>
        </View>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => StyleSheet.create({
  root: { gap: 26 },
  section: { gap: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  okDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  statusText: { flex: 1, gap: 2 },
  statusTitle: { fontSize: 15, color: colors.text },
  sub: { fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  codeBox: { alignItems: 'center', gap: 6, paddingVertical: 20, paddingHorizontal: 16 },
  code: { fontSize: 34, fontWeight: '600', letterSpacing: 3, color: colors.text },
  codeExpired: { color: colors.textSecondary, textDecorationLine: 'line-through' },
  refresh: { marginTop: 8, paddingHorizontal: 16, height: 36, borderRadius: 18, backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center' },
  refreshText: { fontSize: 13, color: colors.text },
  steps: { gap: 8, paddingHorizontal: 4 },
  step: { fontSize: 13, lineHeight: 20, color: colors.text },
  command: { fontSize: 12, lineHeight: 18, color: colors.text, backgroundColor: colors.selected, borderRadius: 12, padding: 12, fontFamily: 'monospace' },
});
