import type { ReactNode } from 'react';
import { Platform, Pressable, View, type TextStyle } from 'react-native';

import { Badge } from './Badge';
import {
  PREDICTION_QUESTION,
  pickLabel,
  predictionLabel,
  predictionSplit,
  type PredictionPick,
  type PredictionSide,
} from './PredictionBar.logic';
import { FocusRing, noBrowserOutline, useFocusVisible } from './pressFeedback';
import { Text } from './Text';

export {
  PREDICTION_QUESTION,
  pickLabel,
  predictionLabel,
  predictionSplit,
  type PredictionPick,
  type PredictionSide,
  type PredictionSplit,
} from './PredictionBar.logic';

export type PredictionBarProps = {
  /** Default WHO TAKES IT?. */
  question?: string | undefined;
  /** Left side: name and share (a percentage or a raw count; normalised to sum to 100). */
  a: PredictionSide;
  b: PredictionSide;
  /** The viewer's side: YOUR PICK under (a) or before (b) its percentage. */
  picked?: PredictionPick | undefined;
  /**
   * Not in `index.d.ts`. Make each side a choice (a radio). The owner sends
   * `prediction_made{side}` and flips `picked`. Social only: no money, points or odds.
   */
  onPick?: ((side: PredictionPick) => void) | undefined;
  /** Not in `index.d.ts`. Predictions lock when the event goes live: a LOCKED badge, no picking. */
  locked?: boolean | undefined;
  testID?: string | undefined;
};

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

/**
 * WHO TAKES IT? (PredictionBar.md, web `function PredictionBar`): the crowd's
 * split for a Challenge Event. Each side is named and numbered at its own
 * end; the bar is `signal` against `tint` with a 3pt gap, so the split never
 * rests on two hues. The viewer's side carries the word YOUR PICK. Read as
 * one label: "Who takes it? Chimdi 48 percent, Marcus 52 percent". With
 * `onPick` (and not `locked`), each side is a radio.
 */
export function PredictionBar({
  question,
  a,
  b,
  picked,
  onPick,
  locked = false,
  testID,
}: PredictionBarProps) {
  const split = predictionSplit(a, b);
  const label = predictionLabel({ question, a, b, picked, locked });
  const choosing = !!onPick && !locked;
  const pct = (n: number) => (split.empty ? '–' : `${n}%`);

  const sideA = (
    <View className="items-start gap-space-1">
      <Text variant="label">{a.name}</Text>
      <Text variant="display-sm" style={tabular}>
        {pct(split.a)}
      </Text>
      {picked === 'a' ? <Badge tone="signal">YOUR PICK</Badge> : null}
    </View>
  );
  const sideB = (
    <View className="items-end gap-space-1">
      {picked === 'b' ? <Badge tone="signal">YOUR PICK</Badge> : null}
      <Text variant="display-sm" style={[tabular, { textAlign: 'right' }]}>
        {pct(split.b)}
      </Text>
      <Text variant="label" style={{ textAlign: 'right' }}>
        {b.name}
      </Text>
    </View>
  );

  const group = choosing
    ? { role: 'radiogroup' as const, accessibilityLabel: label }
    : { accessible: true, role: 'summary' as const, accessibilityLabel: label };

  return (
    <View testID={testID} className="gap-space-3" {...group}>
      <View className="flex-row flex-wrap items-center gap-space-3">
        <Text variant="display-sm" role="heading" className="shrink">
          {question ?? PREDICTION_QUESTION}
        </Text>
        {locked ? <Badge>LOCKED</Badge> : null}
      </View>
      <View className="flex-row items-end justify-between gap-space-4">
        {choosing ? (
          <Side
            selected={picked === 'a'}
            label={pickLabel(a, split.a, split.empty)}
            onPress={() => onPick('a')}
          >
            {sideA}
          </Side>
        ) : (
          sideA
        )}
        {choosing ? (
          <Side
            selected={picked === 'b'}
            label={pickLabel(b, split.b, split.empty)}
            onPress={() => onPick('b')}
          >
            {sideB}
          </Side>
        ) : (
          sideB
        )}
      </View>
      <View className="h-[12px] flex-row" style={{ gap: 3 }}>
        {split.empty ? (
          <View className="flex-1 bg-track" />
        ) : (
          <>
            <View className="bg-signal" style={{ flexGrow: split.a, flexBasis: 0 }} />
            <View className="bg-tint" style={{ flexGrow: split.b, flexBasis: 0 }} />
          </>
        )}
      </View>
    </View>
  );
}

function Side({
  selected,
  label,
  onPress,
  children,
}: {
  selected: boolean;
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  const focus = useFocusVisible({});
  const checked =
    Platform.OS === 'web'
      ? { 'aria-checked': selected }
      : { accessibilityState: { checked: selected } };
  return (
    <Pressable
      role="radio"
      {...checked}
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={focus.onPressIn}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      style={noBrowserOutline}
      className="relative min-h-touch justify-end"
    >
      {children}
      {focus.focusVisible ? <FocusRing shape="square" /> : null}
    </Pressable>
  );
}
