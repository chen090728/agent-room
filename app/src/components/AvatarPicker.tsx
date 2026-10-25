import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTranslation } from '../i18n';
import { AVATAR_COLORS, AVATAR_SHAPES, COLOR_HEX, colors, type Avatar } from '../theme';
import { Blob } from './Avatar';
import { AnimatedBlob } from './AnimatedBlob';
import { Card } from './ui';

/** Large preview plus the 12 shapes and 11 colours to choose from. */
export function AvatarPicker({ value, onChange, preview }: { value: Avatar; onChange: (v: Avatar) => void; preview?: ReactNode }) {
  const { t } = useAppTranslation();
  return (
    <View style={styles.root}>
      <View style={styles.preview} accessibilityLabel={t('avatar.previewA11y')}>
        {preview ?? <AnimatedBlob avatar={value} size={104} />}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>{t('avatar.shape')}</Text>
        <Card style={styles.grid}>
          {AVATAR_SHAPES.map((shape) => {
            const on = shape === value.shape;
            return (
              <Pressable
                key={shape}
                accessibilityRole="button"
                accessibilityLabel={t(`avatar.shapeName.${shape}`)}
                accessibilityState={{ selected: on }}
                onPress={() => onChange({ ...value, shape })}
                style={[styles.shapeCell, on && styles.shapeOn]}
              >
                <Blob avatar={{ shape, color: value.color }} size={36} />
              </Pressable>
            );
          })}
        </Card>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>{t('avatar.color')}</Text>
        <Card style={styles.colorGrid}>
          {AVATAR_COLORS.map((color) => {
            const on = color === value.color;
            return (
              <Pressable
                key={color}
                accessibilityRole="button"
                accessibilityLabel={t(`avatar.colorName.${color}`)}
                accessibilityState={{ selected: on }}
                onPress={() => onChange({ ...value, color })}
                style={styles.colorCell}
              >
                <View style={[styles.ring, on && styles.ringOn]}>
                  <View style={[styles.swatch, { backgroundColor: COLOR_HEX[color] }]} />
                </View>
              </Pressable>
            );
          })}
        </Card>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 24 },
  preview: { alignItems: 'center' },
  section: { gap: 10 },
  label: { paddingHorizontal: 4, fontSize: 12, color: colors.textSecondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 10, rowGap: 6 },
  shapeCell: { width: '16.666%', height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  shapeOn: { backgroundColor: colors.selected },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 12, paddingHorizontal: 8, rowGap: 8 },
  colorCell: { width: '16.666%', alignItems: 'center' },
  ring: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  ringOn: { borderColor: '#BDBDBD' },
  swatch: { width: 32, height: 32, borderRadius: 16 },
});
