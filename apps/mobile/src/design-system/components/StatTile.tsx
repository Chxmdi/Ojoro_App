import { Children, isValidElement, type ReactNode } from 'react';
import { View, type TextStyle } from 'react-native';

import { statTileLabel, tileRows } from './StatTile.logic';
import { Text } from './Text';

export { statTileLabel, tileRows } from './StatTile.logic';

export type StatTileProps = {
  /** The number, already formatted ("91%", "1 DAY", money from `formatMoney`). Display type, tabular numerals. */
  value: string;
  /** What it counts, sentence case ("Showed up"). */
  label: string;
  /** Change against the period before, in words ("+3 pts on the 30 days before"). Never an arrow or a colour alone. */
  delta?: string | undefined;
  /** HostHome's summary: the label as a muted caption, no delta. Default false. */
  compact?: boolean | undefined;
  testID?: string | undefined;
};

export type StatTilesProps = {
  /** Accessible name of the group ("Key numbers"). */
  label: string;
  /** `StatTile`s. */
  children: ReactNode;
  /** Tiles per row. Default 2. */
  columns?: number | undefined;
  /** Hairline rules between tiles (HostInsights). Off for the compact row on HostHome. Default true. */
  ruled?: boolean | undefined;
  testID?: string | undefined;
};

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };
/** `.delta`: 600 12/16, muted. */
const deltaStyle: TextStyle = { fontWeight: '600', letterSpacing: 0 };

/**
 * A key number (HostInsights `.tile`, HostHome's summary): value in display
 * type, what it counts, and the change in words. Read as one sentence:
 * "91%, showed up. +3 pts on the 30 days before."
 */
export function StatTile({ value, label, delta, compact = false, testID }: StatTileProps) {
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={statTileLabel(value, label, compact ? undefined : delta)}
      className="gap-space-1"
    >
      <Text variant="display-sm" style={tabular}>
        {value}
      </Text>
      {compact ? (
        <Text variant="caption" muted>
          {label}
        </Text>
      ) : (
        <Text variant="body-sm">{label}</Text>
      )}
      {delta && !compact ? (
        <Text variant="caption" muted style={deltaStyle}>
          {delta}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Tiles in a grid (`.tiles`): two to a row, separated by 2pt `line` rules
 * (ground changes and hairlines, no boxes or shadows). Unruled, they sit
 * `space-3` apart.
 */
export function StatTiles({ label, children, columns = 2, ruled = true, testID }: StatTilesProps) {
  const items = Children.toArray(children).filter(isValidElement);
  const rows = tileRows(items, columns);
  const per = Math.max(1, Math.floor(columns));
  return (
    <View
      testID={testID}
      role="group"
      accessibilityLabel={label}
      className={ruled ? '' : 'gap-space-3'}
    >
      {rows.map((row, r) => (
        <View
          key={r}
          className={`flex-row ${ruled && r > 0 ? 'border-t-2 border-line' : ''} ${ruled ? '' : 'gap-space-3'}`}
        >
          {Array.from({ length: per }, (_, c) => (
            <View
              key={c}
              className={
                ruled
                  ? `min-w-0 flex-1 py-space-4 ${c > 0 ? 'border-l-2 border-line pl-space-4' : ''} ${c < per - 1 ? 'pr-space-3' : ''}`
                  : 'min-w-0 flex-1'
              }
            >
              {row[c] ?? null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
