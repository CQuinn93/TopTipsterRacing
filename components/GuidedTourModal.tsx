import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';

export type GuidedTourStep = {
  title: string;
  body: string;
  icon?: keyof typeof Ionicons.glyphMap;
};

const TOUR_STEPS: GuidedTourStep[] = [
  {
    title: 'Welcome to Top Tipster Racing',
    body: "Here's how Top Tipster Racing works.",
    icon: 'trophy-outline',
  },
  {
    title: 'Join a competition',
    body: "Go to **My Competitions** (tab below) and enter an access code. Your request will be reviewed and you'll be accepted by the organiser.",
    icon: 'medal-outline',
  },
  {
    title: "When you're in",
    body: "Once accepted, you'll see your competitions on the **Home** screen and whether you have selections due. Use the **Next race** card to open **My selections**.",
    icon: 'home-outline',
  },
  {
    title: 'Making your picks',
    body: "You can edit your selections until **1 hour before the first race** of the day. Or **lock in early** to see everyone else's picks—but you can't change yours after that.",
    icon: 'lock-open-outline',
  },
  {
    title: "You're all set",
    body: "Check **Rules** and **Points** in the menu for full details. Enjoy!",
    icon: 'checkmark-circle-outline',
  },
];

function splitBold(text: string): Array<{ text: string; bold: boolean }> {
  const parts: Array<{ text: string; bold: boolean }> = [];
  const re = /\*\*([^*]+)\*\*/g;
  let match: RegExpExecArray | null;
  let lastIndex = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), bold: false });
    }
    parts.push({ text: match[1], bold: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), bold: false });
  }
  if (parts.length === 0) {
    parts.push({ text, bold: false });
  }
  return parts;
}

type Props = {
  visible: boolean;
  onComplete: () => void;
  onSkip: () => void;
};

export function GuidedTourModal({ visible, onComplete, onSkip }: Props) {
  const theme = useTheme();
  const [stepIndex, setStepIndex] = React.useState(0);

  React.useEffect(() => {
    if (visible) setStepIndex(0);
  }, [visible]);

  const step = TOUR_STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === TOUR_STEPS.length - 1;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        overlay: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.6)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: theme.spacing.lg,
        },
        card: {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          borderColor: theme.colors.border,
          maxWidth: 400,
          width: '100%',
          maxHeight: '85%',
        },
        scroll: {
          maxHeight: 360,
        },
        scrollContent: {
          padding: theme.spacing.lg,
          paddingBottom: theme.spacing.md,
        },
        iconWrap: {
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: theme.colors.accentMuted,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: theme.spacing.md,
          alignSelf: 'center',
        },
        title: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 20,
          fontWeight: '700',
          color: theme.colors.text,
          marginBottom: theme.spacing.sm,
          textAlign: 'center',
        },
        body: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          lineHeight: 22,
          color: theme.colors.textSecondary,
          textAlign: 'center',
        },
        bold: {
          fontWeight: '700',
          color: theme.colors.text,
        },
        dots: {
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 8,
          marginTop: theme.spacing.md,
          marginBottom: theme.spacing.sm,
        },
        dot: {
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: theme.colors.border,
        },
        dotActive: {
          backgroundColor: theme.colors.accent,
          width: 24,
        },
        footer: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          gap: theme.spacing.sm,
        },
        skipBtn: {
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.sm,
        },
        skipText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          color: theme.colors.textMuted,
        },
        backBtn: {
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
        },
        backText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          color: theme.colors.textSecondary,
        },
        nextBtn: {
          backgroundColor: theme.colors.accent,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.lg,
          borderRadius: theme.radius.sm,
        },
        nextText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          fontWeight: '600',
          color: theme.colors.black,
        },
      }),
    [theme]
  );

  const handleNext = () => {
    if (isLast) {
      onComplete();
    } else {
      setStepIndex((i) => i + 1);
    }
  };

  const handleBack = () => {
    if (isFirst) return;
    setStepIndex((i) => i - 1);
  };

  const handleSkip = () => {
    onSkip();
  };

  if (!visible) return null;

  const bodyParts = splitBold(step.body);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleSkip}
    >
      <Pressable style={styles.overlay} onPress={handleSkip}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {step.icon && (
              <View style={styles.iconWrap}>
                <Ionicons
                  name={step.icon}
                  size={28}
                  color={theme.colors.accent}
                />
              </View>
            )}
            <Text style={styles.title}>{step.title}</Text>
            <Text style={styles.body}>
              {bodyParts.map((p, i) =>
                p.bold ? (
                  <Text key={i} style={[styles.body, styles.bold]}>
                    {p.text}
                  </Text>
                ) : (
                  p.text
                )
              )}
            </Text>
          </ScrollView>
          <View style={styles.dots}>
            {TOUR_STEPS.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === stepIndex && styles.dotActive,
                ]}
              />
            ))}
          </View>
          <View style={styles.footer}>
            <TouchableOpacity
              onPress={handleSkip}
              style={styles.skipBtn}
              hitSlop={8}
            >
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              {!isFirst && (
                <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
                  <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={handleNext} style={styles.nextBtn} activeOpacity={0.8}>
                <Text style={styles.nextText}>{isLast ? 'Get started' : 'Next'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
