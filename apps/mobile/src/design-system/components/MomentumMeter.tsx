import { View } from 'react-native';

import { momentumModel, MOMENTUM_BAR_MAX } from './MomentumMeter.logic';
import { Text } from './Text';

export {
  momentumModel,
  MOMENTUM_BAR_MAX,
  MOMENTUM_BAR_MIN,
  MOMENTUM_DEFAULT_LABEL,
  type MomentumModel,
} from './MomentumMeter.logic';

export type MomentumMeterProps = {
  /** Sessions per week, oldest first (eight weeks in the designs). The last bar is this week, in `signal`. */
  weeks: number[];
  /** Weeks in a row with a session. Stated in words: "3 WEEK STREAK". Default 0. */
  streak?: number | undefined;
  /** Overline. Default MOMENTUM. */
  label?: string | undefined;
  /** Not in `index.d.ts`. Words in place of the count ("COMEBACK WEEK", "FIRST WEEK"). A zero streak is never written. */
  streakText?: string | undefined;
  testID?: string | undefined;
};

/**
 * Activity rhythm (MomentumMeter.md, web `function MomentumMeter`): the
 * overline and "6 WEEK STREAK" on one baseline, then a 56pt row of plain bars,
 * `track` for past weeks and `signal` for this one. Never a glowing XP bar;
 * the bars are decorative and the whole meter reads as one sentence.
 */
export function MomentumMeter({ weeks, streak, label, streakText, testID }: MomentumMeterProps) {
  const model = momentumModel(weeks, streak, label, streakText);
  return (
    <View testID={testID} accessible role="summary" accessibilityLabel={model.accessibilityLabel}>
      <View className="mb-space-3 flex-row flex-wrap items-baseline justify-between gap-x-space-3">
        <Text variant="overline">{model.label}</Text>
        {model.streakText ? (
          <Text variant="display-xs" style={{ fontVariant: ['tabular-nums'] }}>
            {model.streakText}
          </Text>
        ) : null}
      </View>
      <View
        className="flex-row items-end gap-space-2"
        style={{ height: MOMENTUM_BAR_MAX }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {model.bars.length === 0 ? (
          <Text variant="body-sm" muted className="self-center">
            No sessions yet. The first one starts the count.
          </Text>
        ) : null}
        {model.bars.map((h, i) => (
          <View
            key={i}
            className={`flex-1 ${i === model.bars.length - 1 ? 'bg-signal' : 'bg-track'}`}
            style={{ height: h }}
          />
        ))}
      </View>
    </View>
  );
}
