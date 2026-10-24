import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MemberView } from '../protocol';
import { colors } from '../theme';
import { Orb } from './Orb';
import { Card, CheckCircle } from './ui';

/** Card listing members with a check circle each. */
export function MemberChecklist({
  members,
  selected,
  onToggle,
}: {
  members: MemberView[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <Card>
      {members.map((m, i) => {
        const on = selected.includes(m.id);
        return (
          <Fragment key={m.id}>
            {i > 0 && <View style={styles.divider} />}
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={m.name}
              onPress={() => onToggle(m.id)}
              style={styles.row}
            >
              <Orb color={m.color} size={32} />
              <View style={styles.text}>
                <Text style={styles.name}>{m.name}</Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {m.typeLabel}
                  {m.secrets.apiKey ? ` · ${m.secrets.apiKey}` : ''}
                  {m.persona ? ` · ${m.persona}` : ''}
                </Text>
              </View>
              <CheckCircle checked={on} />
            </Pressable>
          </Fragment>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 56 },
  divider: { height: 1, backgroundColor: colors.divider, marginLeft: 60 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 15, color: colors.text },
  sub: { fontSize: 12, color: colors.textSecondary },
});
