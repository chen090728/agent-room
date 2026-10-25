import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BridgePairing } from '../../components/BridgePairing';
import { BackIcon } from '../../components/Icons';
import { RoundButton, ScreenHeader } from '../../components/ui';
import { colors } from '../../theme';

/** Connects a work assistant to a computer. */
export default function PairScreen() {
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  return (
    <SafeAreaView style={styles.root}>
      <ScreenHeader
        title="连接电脑"
        left={
          <RoundButton label="返回" onPress={() => router.back()}>
            <BackIcon />
          </RoundButton>
        }
      />
      <ScrollView contentContainerStyle={styles.content}>{memberId ? <BridgePairing memberId={memberId} /> : null}</ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 18, paddingTop: 30, paddingBottom: 40 },
});
