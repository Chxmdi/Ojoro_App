import { Platform, View } from 'react-native';

import { meterModel } from './Meter.logic';

export { meterModel, type MeterModel } from './Meter.logic';

export type MeterProps = {
  /** Current value. Clamped to 0..max. */
  value: number;
  /** Default 100 (a percentage). */
  max?: number | undefined;
  /** Spoken label, in words ("Tuesday 7-a-side, 98 percent full on average"). Required: the bar never carries meaning alone; show the number beside it too. */
  label: string;
  testID?: string | undefined;
};

/**
 * A fill bar (HostInsights `.meter`): 8pt `track` with a `text` fill, for how
 * full a series runs. One fill, no colour coding; the number is written next
 * to it by the owner ("98% full").
 */
export function Meter({ value, max, label, testID }: MeterProps) {
  const m = meterModel(value, max);
  const a11y =
    Platform.OS === 'web'
      ? {
          role: 'progressbar' as const,
          'aria-valuemin': 0,
          'aria-valuemax': m.max,
          'aria-valuenow': m.now,
          'aria-label': label,
        }
      : {
          accessible: true,
          accessibilityRole: 'progressbar' as const,
          accessibilityValue: { min: 0, max: m.max, now: m.now, text: label },
          accessibilityLabel: label,
        };
  return (
    <View testID={testID} {...a11y} className="h-[8px] overflow-hidden bg-track">
      <View className="h-full bg-text" style={{ width: `${m.pct}%` }} />
    </View>
  );
}
