import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ChatSettingsSheet } from '../sheet-content/ChatSettingsSheet';
import { NewGroupSheet } from '../sheet-content/NewGroupSheet';
import { NewMemberSheet } from '../sheet-content/NewMemberSheet';
import { PluginDetailSheet } from '../sheet-content/PluginDetailSheet';
import { PluginsSheet } from '../sheet-content/PluginsSheet';
import { SettingsSheet } from '../sheet-content/SettingsSheet';
import { SheetProvider } from '../sheets';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { installGlobalErrorHandler } from '../errorLog';
import { StoreProvider } from '../store';
import { colors } from '../theme';

installGlobalErrorHandler();

const SHEETS = {
  'member-new': { component: NewMemberSheet },
  'group-new': { component: NewGroupSheet },
  settings: { component: SettingsSheet },
  'chat-settings': { component: ChatSettingsSheet },
  plugins: { component: PluginsSheet },
  'plugin-detail': { component: PluginDetailSheet, height: 0.55 },
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <ErrorBoundary>
        <StoreProvider>
          <StatusBar style="dark" />
          <SheetProvider registry={SHEETS}>
          <Stack
            screenOptions={{
              headerShown: false,
              // Native iOS push. On Android this is the iOS-style slide; on iOS it is the system push.
              animation: 'ios_from_right',
              gestureEnabled: true,
              freezeOnBlur: true,
              contentStyle: { backgroundColor: colors.bg },
            }}
          >
            <Stack.Screen name="index" options={{ contentStyle: { backgroundColor: colors.homeBg } }} />
            <Stack.Screen name="chat/[id]/index" />
            <Stack.Screen name="member/pair" />
            {/* Invisible routes that open a sheet; see sheetRoute.ts. */}
            <Stack.Screen name="settings" options={{ presentation: 'transparentModal', animation: 'none' }} />
            <Stack.Screen name="member/new" options={{ presentation: 'transparentModal', animation: 'none' }} />
            <Stack.Screen name="group/new" options={{ presentation: 'transparentModal', animation: 'none' }} />
          </Stack>
          </SheetProvider>
        </StoreProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
