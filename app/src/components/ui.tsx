import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useTheme, useThemedStyles, type ThemeColors, type ThemeShadows } from '../theme';
import { CheckIcon } from './Icons';

/** 48px white circular button floating over the page. */
/** `accent` paints the primary look: light fill with a dark icon in dark mode, same as the others in light mode. */
export function RoundButton({ label, onPress, children, accent }: { label: string; onPress: () => void; children: ReactNode; accent?: boolean }) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.round, accent && styles.roundAccent, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

/** Page header with a round button on the left and a centered title. */
export function ScreenHeader({ title, left }: { title: string; left?: ReactNode }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.header}>
      <View style={styles.headerSide}>{left}</View>
      <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
      <View style={styles.headerSide} />
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const styles = useThemedStyles(createStyles);
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionLabel({ children, right }: { children: string; right?: ReactNode }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.sectionLabelRow}>
      <Text style={styles.sectionLabel} numberOfLines={2}>{children}</Text>
      {right}
    </View>
  );
}

/** Labelled input row inside a Card; set `first` to drop the top divider. */
export function FieldRow({ label, first, ...input }: { label: string; first?: boolean } & TextInputProps) {
  const { colors, colorScheme } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.field, !first && styles.fieldDivider]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.placeholder}
        keyboardAppearance={colorScheme}
        style={[styles.fieldInput, input.multiline && styles.fieldMultiline]}
        autoCorrect={false}
        {...input}
      />
    </View>
  );
}

export function PrimaryButton({
  title,
  onPress,
  disabled,
  busy,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [styles.primary, (disabled || busy) && styles.primaryDisabled, pressed && styles.pressed]}
    >
      {busy ? <ActivityIndicator color={colors.buttonText} /> : <Text style={styles.primaryText} numberOfLines={1}>{title}</Text>}
    </Pressable>
  );
}

export function Switch({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const { colors, shadows } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      hitSlop={6}
      style={[styles.switch, { backgroundColor: value ? colors.switchOn : colors.switchOff, alignItems: value ? 'flex-end' : 'flex-start' }]}
    >
      <View style={[styles.knob, { backgroundColor: value ? colors.knobOn : colors.knob, boxShadow: shadows.knob }]} />
    </Pressable>
  );
}

export function CheckCircle({ checked }: { checked: boolean }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.check, checked ? styles.checkOn : styles.checkOff]}>{checked && <CheckIcon size={13} />}</View>
  );
}

export function ErrorText({ children }: { children: string | null }) {
  const styles = useThemedStyles(createStyles);
  return children ? <Text style={styles.error}>{children}</Text> : null;
}

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => StyleSheet.create({
  round: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.roundBorder,
    boxShadow: shadows.float,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundAccent: { backgroundColor: colors.accent },
  pressed: { opacity: 0.7 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14 },
  headerSide: { width: 48 },
  headerTitle: { flex: 1, minWidth: 0, textAlign: 'center', fontSize: 15, fontWeight: '600', color: colors.text },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.hairline,
    boxShadow: shadows.card,
  },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  sectionLabel: { flexShrink: 1, fontSize: 12, color: colors.textSecondary },
  field: { paddingHorizontal: 16, paddingVertical: 12, gap: 4 },
  fieldDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
  fieldLabel: { fontSize: 12, color: colors.textSecondary },
  fieldInput: { fontSize: 15, color: colors.text, paddingVertical: 2, minHeight: 26 },
  fieldMultiline: { minHeight: 70, lineHeight: 23, textAlignVertical: 'top' },
  primary: {
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.button,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: shadows.button,
  },
  primaryDisabled: { opacity: 0.4 },
  primaryText: { color: colors.buttonText, fontSize: 16, fontWeight: '600', paddingHorizontal: 16 },
  switch: { width: 52, height: 32, borderRadius: 16, padding: 3, justifyContent: 'center' },
  knob: { width: 26, height: 26, borderRadius: 13 },
  check: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.button },
  checkOff: { borderWidth: 1.5, borderColor: colors.checkOff },
  error: { color: colors.danger, fontSize: 13, textAlign: 'center' },
});
