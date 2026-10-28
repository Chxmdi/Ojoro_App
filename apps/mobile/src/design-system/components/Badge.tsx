import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useThemeColor } from '../useThemeColor';
import { Check } from './Graphic';
import { Text } from './Text';

export type BadgeTone = 'neutral' | 'signal' | 'verified';

export type BadgeProps = {
  /** `neutral` outline · `signal` filled (something is happening) · `verified` check + strong outline. */
  tone?: BadgeTone;
  /** The word. It carries the meaning; colour only reinforces it. */
  children?: ReactNode;
  className?: string;
};

const ground: Record<BadgeTone, string> = {
  neutral: 'border-line-strong',
  signal: 'bg-signal border-signal',
  verified: 'border-text',
};

/**
 * Small uppercase status label, ported from `.oj-badge`: 11/14 Inter 700 at
 * 0.1em (`label-sm`), 4×8 padding, 1px border, `radius-xs`.
 *
 * `signal` reads the situation's `signal`, which is white on confirmed and
 * live, so an oxblood badge never lands on a black or ink ground and needs no
 * mark-ring.
 */
export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  const text = useThemeColor('text');
  return (
    <View
      className={[
        'flex-row items-center gap-space-1 self-start rounded-xs border px-space-2 py-space-1',
        ground[tone],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {tone === 'verified' ? <Check color={text} /> : null}
      <Text variant="label-sm" tone={tone === 'signal' ? 'on-signal' : 'text'} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}
