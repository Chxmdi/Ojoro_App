import { useState } from 'react';
import { Platform, ScrollView, View, type TextStyle } from 'react-native';

import { FLEX_COLUMN_MIN, rowHeaderKey, rowLabel, tableMinWidth } from './DataTable.logic';
import { Text } from './Text';

export {
  FLEX_COLUMN_MIN,
  columnName,
  rowHeaderKey,
  rowLabel,
  tableMinWidth,
  type TableColumnSpec,
} from './DataTable.logic';

export type DataTableColumn = {
  key: string;
  /** Header text, as shown (caps: "PTS", "WEEK OF"). */
  title: string;
  /** Spoken header when `title` is an abbreviation ("Points", "Goal difference"). */
  accessibilityLabel?: string | undefined;
  /** Default `right` (numbers); the row-header column is usually `left`. */
  align?: 'left' | 'right' | undefined;
  /** Fixed width in pt. Without it the column takes the remaining space (min 140pt). */
  width?: number | undefined;
  /** Bold cells (position, points). In `standard` density the row-header column is semibold. */
  strong?: boolean | undefined;
};

export type DataTableRow = {
  key: string;
  cells: Record<string, string | number>;
  /** Shaded with a rule on its left, and `highlightLabel` read out: never shade alone. */
  highlighted?: boolean | undefined;
};

export type DataTableProps = {
  /** Accessible name of the table ("Standings"). */
  label: string;
  columns: DataTableColumn[];
  rows: DataTableRow[];
  /** The column whose cell names the row for screen readers (team, week). Default the first `left` column, else the first. */
  rowHeaderKey?: string | undefined;
  /** Words for a highlighted row ("Moved"). Default "Changed". */
  highlightLabel?: string | undefined;
  /** `standard` (14/20, 12pt rows: standings) or `compact` (13/18, 8pt rows: chart data). Default standard. */
  density?: 'standard' | 'compact' | undefined;
  /** Shown instead of rows when there are none. */
  empty?: string | undefined;
  testID?: string | undefined;
};

const isWeb = Platform.OS === 'web';

/** `.tr.th`: 700 10/12, 0.08em, muted. */
const headStyle: TextStyle = {
  fontSize: 10,
  lineHeight: 12,
  letterSpacing: 0.8,
  fontWeight: '700',
};
const cellStyle = {
  standard: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  compact: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
} satisfies Record<string, TextStyle>;

function colBox(c: DataTableColumn, stretched: boolean) {
  return c.width !== undefined
    ? { width: c.width }
    : { flex: 1, minWidth: stretched ? FLEX_COLUMN_MIN : 0, paddingRight: 8 };
}

/**
 * A table of numbers (HostSeason standings `.tbl`, HostInsights table view):
 * a 2pt `text` rule under the headers, hairlines between rows, tabular
 * numerals, numbers right-aligned. On the web it carries table, row,
 * columnheader, rowheader and cell roles; on iOS and Android each row is
 * one element read as "Mile End Strikers. Position 1, Played 2 … Points 6."
 * When the columns don't fit (about 390pt and up for standings), it scrolls
 * sideways rather than squeezing the numbers.
 */
export function DataTable({
  label,
  columns,
  rows,
  rowHeaderKey: headerKeyProp,
  highlightLabel = 'Changed',
  density = 'standard',
  empty,
  testID,
}: DataTableProps) {
  const [width, setWidth] = useState<number | null>(null);
  const minWidth = tableMinWidth(columns);
  const scrolls = width !== null && width < minWidth;
  const headerKey = rowHeaderKey(columns, headerKeyProp);
  const pad = density === 'compact' ? 'py-space-2' : 'py-space-3';
  const textStyle = cellStyle[density];

  const header = (
    <View
      className={`flex-row items-end border-b-2 border-text ${density === 'compact' ? 'py-space-2' : 'pb-space-2'}`}
      {...(isWeb
        ? { role: 'row' as const }
        : {
            accessibilityElementsHidden: true,
            importantForAccessibility: 'no-hide-descendants' as const,
          })}
    >
      {columns.map((c) => (
        <View
          key={c.key}
          style={colBox(c, scrolls)}
          {...(isWeb ? { role: 'columnheader' as const } : null)}
          {...(isWeb && c.accessibilityLabel ? { 'aria-label': c.accessibilityLabel } : null)}
        >
          <Text muted style={[headStyle, { textAlign: c.align === 'left' ? 'left' : 'right' }]}>
            {c.title}
          </Text>
        </View>
      ))}
    </View>
  );

  const body =
    rows.length === 0 && empty ? (
      <View className="py-space-4">
        <Text variant="body-sm" muted>
          {empty}
        </Text>
      </View>
    ) : (
      rows.map((r, i) => {
        const a11y = isWeb
          ? { role: 'row' as const }
          : {
              accessible: true,
              accessibilityLabel: rowLabel(
                columns,
                r.cells,
                headerKey,
                r.highlighted ? highlightLabel : undefined,
              ),
            };
        return (
          <View
            key={r.key}
            {...a11y}
            className={`flex-row items-center ${pad} ${i < rows.length - 1 ? 'border-b border-line' : ''} ${
              r.highlighted ? 'border-l-2 border-l-line-strong bg-surface-raised' : ''
            }`}
            style={r.highlighted ? { marginLeft: -8, paddingLeft: 6 } : undefined}
          >
            {columns.map((c) => {
              const isHead = c.key === headerKey;
              const v = r.cells[c.key];
              return (
                <View
                  key={c.key}
                  style={colBox(c, scrolls)}
                  {...(isWeb
                    ? { role: isHead ? ('rowheader' as const) : ('cell' as const) }
                    : null)}
                  {...(isWeb && isHead && r.highlighted
                    ? { 'aria-label': `${v === undefined ? '' : String(v)}, ${highlightLabel}` }
                    : null)}
                >
                  <Text
                    style={[
                      textStyle,
                      {
                        fontVariant: ['tabular-nums'],
                        textAlign: c.align === 'left' ? 'left' : 'right',
                      },
                      c.strong
                        ? { fontWeight: '700' }
                        : isHead && density === 'standard'
                          ? { fontWeight: '600' }
                          : null,
                    ]}
                  >
                    {v === undefined ? '' : String(v)}
                  </Text>
                </View>
              );
            })}
          </View>
        );
      })
    );

  const table = (
    <View
      testID={testID}
      {...(isWeb ? { role: 'table' as const, 'aria-label': label } : { accessibilityLabel: label })}
      style={scrolls ? { width: minWidth } : undefined}
    >
      {header}
      {body}
    </View>
  );

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {scrolls ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          accessibilityLabel={`${label}, scrolls sideways`}
        >
          {table}
        </ScrollView>
      ) : (
        table
      )}
    </View>
  );
}
