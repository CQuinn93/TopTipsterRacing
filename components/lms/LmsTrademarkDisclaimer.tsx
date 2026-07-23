import { Text, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

export const LMS_TRADEMARK_DISCLAIMER =
  'Club names, logos and trademarks are the property of their respective owners and are used for identification purposes only.';

export function LmsTrademarkDisclaimer() {
  const theme = useTheme();
  return (
    <Text
      style={[
        styles.text,
        {
          fontFamily: theme.fontFamily.light,
          color: theme.colors.textMuted,
        },
      ]}
    >
      {LMS_TRADEMARK_DISCLAIMER}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 8,
  },
});
