import i18n from 'i18next';
import { Alert, Platform } from 'react-native';

/** Shows a short message. */
export function showMessage(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    globalThis.alert?.(message ? `${title}\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

/** Asks the user to confirm an action; resolves false when they cancel. */
export function confirmAction(opts: { title: string; message?: string; confirmText: string; destructive?: boolean }): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(globalThis.confirm?.(opts.message ? `${opts.title}\n${opts.message}` : opts.title) ?? false);
  }
  return new Promise((resolve) => {
    Alert.alert(
      opts.title,
      opts.message,
      [
        { text: i18n.isInitialized ? String(i18n.t('common.cancel')) : '取消', style: 'cancel', onPress: () => resolve(false) },
        { text: opts.confirmText, style: opts.destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
