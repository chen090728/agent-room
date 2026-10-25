import { StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { detectModelBrand } from '../modelBrand';
import { MODEL_ICON_PATHS } from '../modelIcons';
import { useTheme, useThemedStyles, type ThemeColors, type ThemeShadows } from '../theme';

/** Small badge showing which provider an assistant's model comes from. */
export function ModelIcon({ model, baseUrl }: { model?: string; baseUrl?: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const brand = detectModelBrand(model, baseUrl);
  const paths = brand === 'generic' ? undefined : MODEL_ICON_PATHS[brand];
  return (
    <View style={styles.badge} accessibilityRole="image" accessibilityLabel="所用模型">
      <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
        {paths ? (
          paths.map((d, i) => <Path key={i} d={d} fill={colors.textSecondary} fillRule="evenodd" />)
        ) : (
          <>
            <Rect x={5} y={5} width={14} height={14} rx={3} stroke={colors.textSecondary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            <Path d="M9 9h6v6H9z" stroke={colors.textSecondary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
      </Svg>
    </View>
  );
}

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => StyleSheet.create({
  badge: { width: 20, height: 20, borderRadius: 6, backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center' },
});
