import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/contexts/ThemeContext';

type Props = {
  uri?: string | null;
  size?: number;
  /** Accessible label, e.g. team name */
  label?: string;
};

/** Club crest used only as a visual identifier next to the team name. */
export function TeamCrest({ uri, size = 28, label }: Props) {
  const theme = useTheme();
  if (!uri) {
    return (
      <View
        style={[
          styles.placeholder,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: theme.colors.border,
          },
        ]}
        accessibilityLabel={label}
      />
    );
  }
  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size }}
      contentFit="contain"
      cachePolicy="memory-disk"
      recyclingKey={uri}
      accessibilityLabel={label ? `${label} badge` : 'Club badge'}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    opacity: 0.5,
  },
});
