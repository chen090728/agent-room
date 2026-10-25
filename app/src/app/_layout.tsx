import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider } from '../store';
import { colors } from '../theme';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <StoreProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
            <Stack.Screen name="index" options={{ contentStyle: { backgroundColor: colors.homeBg } }} />
            <Stack.Screen name="chat/[id]/index" />
            <Stack.Screen name="chat/[id]/settings" />
            <Stack.Screen name="integrations/index" />
            <Stack.Screen name="integrations/new" />
            <Stack.Screen name="settings" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="member/new" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="group/new" options={{ animation: 'slide_from_bottom' }} />
          </Stack>
        </StoreProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
