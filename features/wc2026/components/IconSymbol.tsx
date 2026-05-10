import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import type { StyleProp, TextStyle } from 'react-native';

type Ion = ComponentProps<typeof Ionicons>['name'];

const MAPPING: Record<string, Ion> = {
  'house.fill': 'home',
  'house': 'home-outline',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code-slash',
  'chevron.right': 'chevron-forward',
  'chevron.left': 'chevron-back',
  'chevron.up': 'chevron-up',
  'chevron.down': 'chevron-down',
  'location.fill': 'location',
  'calendar': 'calendar-outline',
  'gearshape.fill': 'settings-outline',
  'rectangle.portrait.and.arrow.right': 'log-out-outline',
  'person.fill': 'person',
  'person': 'person-outline',
  'chart.bar.fill': 'bar-chart',
  'chart.bar': 'bar-chart-outline',
  'trophy.fill': 'trophy',
  'trophy': 'trophy-outline',
};

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: string;
  size?: number;
  color: string;
  style?: StyleProp<TextStyle>;
  weight?: string;
}) {
  const ion = (MAPPING as Record<string, Ion>)[name] ?? 'ellipse-outline';
  return <Ionicons name={ion} size={size} color={color} style={style} />;
}
