import { Alert, Platform } from 'react-native';

export function showAlert(title: string, message: string): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

export function confirmDialog(
  title: string,
  message: string,
  options?: { confirmLabel?: string; cancelLabel?: string; destructive?: boolean }
): Promise<boolean> {
  const confirmLabel = options?.confirmLabel ?? 'OK';
  const cancelLabel = options?.cancelLabel ?? 'Cancel';

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: options?.destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}
