import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '../../components/ui';
import { loadLastGroupId } from '../../storage';
import { useStore } from '../../store';
import { colors } from '../../theme';

/** Entry point: opens the most recent group, or asks for server settings. */
export default function Index() {
  const { settingsLoaded, settings, groupsLoaded, groups } = useStore();
  const [lastId, setLastId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    loadLastGroupId()
      .then(setLastId)
      .catch(() => setLastId(null));
  }, []);

  if (settingsLoaded && !settings) return <Redirect href="/settings" />;

  if (!settingsLoaded || !groupsLoaded || lastId === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.textSecondary} />
      </View>
    );
  }

  const target = groups.find((g) => g.id === lastId) ?? groups[0];
  if (target) return <Redirect href={{ pathname: '/chat/[id]', params: { id: target.id } }} />;

  return (
    <SafeAreaView style={styles.center}>
      <Text style={styles.title}>还没有群聊</Text>
      <Text style={styles.sub}>先建一个群，把助手拉进来。</Text>
      <View style={styles.button}>
        <PrimaryButton title="新建群聊" onPress={() => router.push('/group/new')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 24, gap: 8 },
  title: { fontSize: 17, fontWeight: '600', color: colors.text },
  sub: { fontSize: 14, color: colors.textSecondary },
  button: { alignSelf: 'stretch', marginTop: 24 },
});
