import { router } from 'expo-router';
import { useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SettingsContent } from '../sheet-content/SettingsSheet';
import { useOpenSheetFromRoute } from '../sheetRoute';
import { useStore } from '../store';
import { useTheme } from '../theme';

/**
 * Before the App is connected this is the full-screen "connect to a server"
 * page. Once connected, /settings opens the settings sheet instead.
 */
export default function SettingsRoute() {
  const { colors } = useTheme();
  const { settings } = useStore();
  // Decided once: connecting from this page must not turn it into the sheet.
  const firstRun = useRef(!settings).current;
  return !firstRun ? <OpenSettingsSheet /> : (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SettingsContent firstRun onDone={() => router.replace('/')} />
    </SafeAreaView>
  );
}

function OpenSettingsSheet() {
  useOpenSheetFromRoute('settings');
  return null;
}
