import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BridgePairing } from '../../components/BridgePairing';
import { BackIcon } from '../../components/Icons';
import { RoundButton, ScreenHeader } from '../../components/ui';
import { useAppTranslation } from '../../i18n';
import { colors } from '../../theme';

/** Connects a work assistant to a computer. */
export default function PairScreen() {
  const { t } = useAppTranslation();
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  return (
    <SafeAreaView style={styles.root}>
      <ScreenHeader
        title={t('bridge.title')}
        left={
          <RoundButton label={t('common.back')} onPress={() => router.back()}>
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
