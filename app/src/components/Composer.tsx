import { useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View, type TextInputInstance } from 'react-native';
import type { GroupMemberRef } from '../protocol';
import { colors, shadows } from '../theme';
import { PlusIcon, SendIcon } from './Icons';
import { Orb } from './Orb';

/**
 * Message input. Typing "@" at the end (or tapping +) opens a member picker
 * that inserts "@名字 ".
 */
export function Composer({ members, onSend }: { members: GroupMemberRef[]; onSend: (text: string) => Promise<void> }) {
  const [text, setText] = useState('');
  const [picker, setPicker] = useState(false);
  const [sending, setSending] = useState(false);
  const input = useRef<TextInputInstance>(null);

  const change = (value: string) => {
    // Open the picker right after a freshly typed "@".
    if (value.length === text.length + 1 && /[@＠]$/.test(value)) setPicker(true);
    else if (picker && !/[@＠]$/.test(value)) setPicker(false);
    setText(value);
  };

  const pick = (name: string) => {
    const base = /[@＠]$/.test(text) ? text.slice(0, -1) : text;
    const spacer = base && !/\s$/.test(base) ? ' ' : '';
    setText(`${base}${spacer}@${name} `);
    setPicker(false);
    input.current?.focus();
  };

  const send = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      await onSend(content);
      setText('');
      setPicker(false);
    } finally {
      setSending(false);
    }
  };

  const canSend = !!text.trim() && !sending;

  return (
    <View style={styles.wrap}>
      {picker && members.length > 0 && (
        <View style={styles.picker}>
          <FlatList
            data={members}
            keyExtractor={(m) => m.id}
            keyboardShouldPersistTaps="always"
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`@${item.name}`}
                onPress={() => pick(item.name)}
                style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
              >
                <Orb color={item.color} size={22} />
                <Text style={styles.optionText}>{item.name}</Text>
              </Pressable>
            )}
          />
        </View>
      )}
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="@ 成员"
          onPress={() => setPicker((p) => !p)}
          style={styles.iconButton}
        >
          <PlusIcon />
        </Pressable>
        <TextInput
          ref={input}
          value={text}
          onChangeText={change}
          placeholder="给群里发消息，@ 点名"
          placeholderTextColor="#A3A3A0"
          accessibilityLabel="消息"
          style={styles.input}
          multiline
          maxLength={4000}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="发送"
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={send}
          style={[styles.send, !canSend && styles.sendDisabled]}
        >
          <SendIcon />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 14 },
  picker: {
    maxHeight: 220,
    marginBottom: 8,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.hairline,
    boxShadow: shadows.composer,
    paddingVertical: 6,
  },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, height: 44 },
  optionPressed: { backgroundColor: colors.selected },
  optionText: { fontSize: 14, color: colors.text },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    minHeight: 52,
    paddingLeft: 4,
    paddingRight: 7,
    paddingVertical: 4,
    backgroundColor: colors.surface,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.hairline,
    boxShadow: shadows.composer,
  },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minHeight: 44, maxHeight: 120, fontSize: 14, color: colors.text, paddingTop: 12, paddingBottom: 12 },
  send: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginBottom: 3,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.35 },
});
