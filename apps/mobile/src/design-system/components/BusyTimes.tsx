import { Platform, View } from 'react-native';

import { barShare, busyLabel, busyMax, busySummary, type BusyTimesDatum } from './BusyTimes.logic';
import { Text } from './Text';

export {
  barShare,
  busyLabel,
  busyLevel,
  busyMax,
  busyRank,
  busySummary,
  type BusyLevel,
  type BusyTimesDatum,
} from './BusyTimes.logic';

export type BusyTimesProps = {
  /** Names the chart for screen readers ("When it's busy, evenings"). The visible heading is the screen's Divider. */
  title: string;
  /** One bar per slot, in order (MON … SUN). Relative values; only the shape is shown. */
  data: BusyTimesDatum[];
  /** The bar for now (tonight): `signal`, its axis word in `text`, and named in the sentence. */
  currentIndex?: number | null | undefined;
  /** The word for the current bar in sentences. Default TONIGHT. */
  currentWord?: string | undefined;
  /** Plural period for the sentence ("evenings"). */
  period?: string | undefined;
  /** Overrides the sentence under the bars. Null hides it. */
  summary?: string | null | undefined;
  /** Bar area height in pt. Default 72. */
  height?: number | undefined;
  testID?: string | undefined;
};

const hidden =
  Platform.OS === 'web'
    ? { 'aria-hidden': true as const }
    : {
        accessibilityElementsHidden: true,
        importantForAccessibility: 'no-hide-descendants' as const,
      };

/**
 * Place's "When it's busy" (Place.png): a compact row of square bars, no axis
 * or gridlines, the current slot in `signal` and the rest in `track`. The
 * highlight never rests on colour: the current axis word is set in `text`
 * (the others muted) and the sentence underneath says it ("Tonight (Tuesday)
 * is the second busiest."). The chart is one image for screen readers, read
 * bar by bar in words.
 */
export function BusyTimes({
  title,
  data,
  currentIndex,
  currentWord = 'TONIGHT',
  period,
  summary,
  height = 72,
  testID,
}: BusyTimesProps) {
  const max = busyMax(data);
  const line =
    summary === undefined ? busySummary(data, { currentIndex, currentWord, period }) : summary;
  return (
    <View testID={testID} className="gap-space-3">
      <View
        role="img"
        accessible
        accessibilityLabel={busyLabel(title, data, { currentIndex, currentWord })}
        className="gap-space-3"
      >
        <View {...hidden} className="flex-row items-end gap-space-2" style={{ height }}>
          {data.map((d, i) => (
            <View
              key={d.key ?? `${d.label}:${i}`}
              className={`flex-1 ${i === currentIndex ? 'bg-signal' : 'bg-track'}`}
              style={{ height: Math.round(barShare(d.value, max) * height) }}
            />
          ))}
        </View>
        <View {...hidden} className="flex-row gap-space-2">
          {data.map((d, i) => (
            <Text
              key={d.key ?? `${d.label}:${i}`}
              variant="label-sm"
              muted={i !== currentIndex}
              className="flex-1"
              style={{ textAlign: 'center' }}
              numberOfLines={1}
            >
              {d.label}
            </Text>
          ))}
        </View>
      </View>
      {line ? <Text variant="body-sm">{line}</Text> : null}
    </View>
  );
}
