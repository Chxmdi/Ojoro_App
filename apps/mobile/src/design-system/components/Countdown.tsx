import { useEffect, useState } from 'react';
import { View, type TextStyle } from 'react-native';

import {
  countdownLabel,
  countdownParts,
  countdownUnits,
  nextTickDelay,
  type CountdownParts,
} from './Countdown.logic';
import { Text } from './Text';

export {
  countdownLabel,
  countdownParts,
  countdownUnits,
  nextTickDelay,
  type CountdownParts,
  type CountdownUnit,
} from './Countdown.logic';

export type CountdownProps = CountdownParts & {
  /** The overline above the numerals: "STARTS IN". Also starts the spoken label. */
  label?: string | undefined;
  /**
   * Not in `index.d.ts`. When the event starts (epoch ms): the countdown ticks
   * itself and ignores `days`…`seconds`. Only this leaf re-renders: once a
   * minute, then once a second in the last hour.
   */
  to?: number | undefined;
  /** With `to`: freeze "now" (epoch ms) instead of ticking (stories, tests). */
  now?: number | undefined;
  testID?: string | undefined;
};

/**
 * The parts left until `to`, re-rendering only when a shown part changes:
 * at each minute boundary, then each second in the last hour. Stops at zero.
 * Pass `fixed` to freeze "now".
 */
export function useCountdown(to: number, fixed?: number | undefined): CountdownParts {
  const [now, setNow] = useState(() => fixed ?? Date.now());
  const current = fixed ?? now;
  useEffect(() => {
    if (fixed !== undefined) return undefined;
    const delay = nextTickDelay(to - current);
    if (delay === null) return undefined;
    // A few ms past the boundary so the floor lands on the new value.
    const id = setTimeout(() => setNow(Date.now()), delay + 8);
    return () => clearTimeout(id);
  }, [to, current, fixed]);
  return countdownParts(to - current);
}

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

function Face({ parts, label, testID }: { parts: CountdownParts; label?: string | undefined; testID?: string | undefined }) {
  const units = countdownUnits(parts);
  return (
    <View
      testID={testID}
      role="timer"
      accessible
      accessibilityLabel={countdownLabel(parts, label)}
    >
      {label ? (
        <Text variant="overline" className="mb-space-2">
          {label}
        </Text>
      ) : null}
      <View className="flex-row gap-space-5">
        {units.map((u) => (
          <View key={u.key} className="gap-space-1">
            <Text variant="display-lg" style={tabular}>
              {u.value}
            </Text>
            <Text variant="label-sm">{u.unit}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Ticking({ to, now, label, testID }: { to: number; now?: number | undefined; label?: string | undefined; testID?: string | undefined }) {
  const parts = useCountdown(to, now);
  return <Face parts={parts} label={label} testID={testID} />;
}

/**
 * Big display numerals to an event (Countdown.md, web `function Countdown`):
 * days, hours, minutes, with seconds only in the last hour. Numerals are
 * `display-lg` in tabular figures, padded to two digits, each over its unit
 * in `label-sm`. A `timer` for screen readers, read in words without seconds
 * so it changes at most once a minute. In a Challenge Event it leads while
 * the stage is `days`; TODAY. / ALMOST TIME. replace it as it nears.
 */
export function Countdown({ label, to, now, testID, ...parts }: CountdownProps) {
  if (to !== undefined) return <Ticking to={to} now={now} label={label} testID={testID} />;
  return <Face parts={parts} label={label} testID={testID} />;
}
