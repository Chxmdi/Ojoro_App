import { borderWidth } from '@ojoro/design-tokens';
import { Platform, View, type TextStyle } from 'react-native';

import { Situation } from '../Situation';
import type { Person } from './AvatarCluster';
import { DisplayText, usePosterWidth } from './DisplayText';
import {
  cleanRecord,
  formCells,
  formHeading,
  recordSentence,
  rivalryOverline,
  type FormCell,
  type RivalryRecord,
  type RivalryResult,
} from './Rivalry.logic';
import { Text } from './Text';

export {
  cleanRecord,
  formCells,
  formHeading,
  meetings,
  recordSentence,
  rivalryOverline,
  type FormCell,
  type RivalryRecord,
  type RivalryResult,
} from './Rivalry.logic';

export type RivalryProps = {
  a: Person;
  b: Person;
  /** Wins each, and draws. */
  record: RivalryRecord;
  /** Who won each meeting, oldest first: `'a' | 'b' | 'd'`. */
  history?: readonly RivalryResult[] | undefined;
  /** The next meeting: "5K · Sat 12 Oct". */
  next?: string | undefined;
  testID?: string | undefined;
};

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

const hidden =
  Platform.OS === 'web'
    ? { 'aria-hidden': true as const }
    : {
        accessibilityElementsHidden: true,
        importantForAccessibility: 'no-hide-descendants' as const,
      };

/** `.oj-form-cell`: 32 square, 13/1 Inter 700. */
const cellText: TextStyle = { fontSize: 13, lineHeight: 16, letterSpacing: 0 };

const cellBox: Record<RivalryResult, string> = {
  a: 'bg-signal',
  b: 'border-2 border-text',
  d: 'bg-track',
};

function Cell({ cell }: { cell: FormCell }) {
  return (
    <View
      role="listitem"
      accessible
      accessibilityLabel={cell.label}
      className={`size-[32px] items-center justify-center ${cellBox[cell.result]}`}
    >
      <Text variant="label" tone={cell.result === 'a' ? 'on-signal' : 'text'} style={cellText}>
        {cell.mark}
      </Text>
    </View>
  );
}

/**
 * Head-to-head history between two people (Rivalry.md, web `function
 * Rivalry`), always on the live situation: the record in huge numerals
 * either side of the Mark, read as a sentence; the form line, oldest first,
 * where each cell carries the winner's initial (= for a draw), filled for
 * side a and outlined for side b, so it never rests on colour; then the next
 * meeting.
 */
export function Rivalry({ a, b, record, history, next, testID }: RivalryProps) {
  const r = cleanRecord(record);
  const cells = formCells(history, a.name, b.name);
  const [width, onLayout] = usePosterWidth();
  return (
    <Situation id="live" testID={testID} role="region" className="p-space-6">
      <View className="gap-space-5" onLayout={onLayout}>
        <View
          accessible
          accessibilityLabel={recordSentence(a.name, b.name, record)}
          className="gap-space-5"
        >
          <Text variant="overline">{rivalryOverline(record)}</Text>
          <View className="flex-row items-end justify-between gap-space-4">
            <View className="shrink">
              <DisplayText size="sm">{a.name.toUpperCase()}</DisplayText>
              <DisplayText size="hero" posterWidth={width} style={tabular}>
                {String(r.a)}
              </DisplayText>
            </View>
            <View
              {...hidden}
              className="self-center bg-text"
              style={{
                width: borderWidth['border-poster'],
                height: 120,
                transform: [{ skewX: '-24deg' }],
              }}
            />
            <View className="shrink items-end">
              <DisplayText size="sm" style={{ textAlign: 'right' }}>
                {b.name.toUpperCase()}
              </DisplayText>
              <DisplayText
                size="hero"
                posterWidth={width}
                style={[tabular, { textAlign: 'right' }]}
              >
                {String(r.b)}
              </DisplayText>
            </View>
          </View>
        </View>
        {cells.length > 0 ? (
          <View>
            <Text variant="label" muted className="mb-space-2">
              {formHeading(cells.length)}
            </Text>
            <View
              role="list"
              accessibilityLabel={`Form, last ${cells.length}, oldest first`}
              className="flex-row flex-wrap gap-space-1"
            >
              {cells.map((c, i) => (
                <Cell key={i} cell={c} />
              ))}
            </View>
          </View>
        ) : null}
        {next ? (
          <View
            accessible
            accessibilityLabel={`Next: ${next}`}
            className="flex-row items-baseline justify-between gap-space-3 border-t border-line pt-space-4"
          >
            <Text variant="label" muted>
              NEXT
            </Text>
            <Text variant="title-sm" className="shrink" style={{ textAlign: 'right' }}>
              {next}
            </Text>
          </View>
        ) : null}
      </View>
    </Situation>
  );
}
