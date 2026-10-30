import { useState } from 'react';
import { Platform, Pressable, View, type TextStyle } from 'react-native';

import { spacing } from '@ojoro/design-tokens';

import { useThemeColor } from '../useThemeColor';
import { Button } from './Button';
import {
  axisLabel,
  chartTicks,
  columnHeight,
  columnLabel,
  endLabel,
  endLabelBottom,
  readout,
  toggleLabel,
} from './ColumnChart.logic';
import { DataTable, type DataTableColumn } from './DataTable';
import { FocusRing, noBrowserOutline, useFocusVisible } from './pressFeedback';
import { Text } from './Text';

export {
  axisLabel,
  chartTicks,
  columnHeight,
  columnLabel,
  endLabel,
  readout,
  toggleLabel,
  DEFAULT_LAST_LABEL,
  DEFAULT_X_EVERY,
} from './ColumnChart.logic';

export type ColumnChartDatum = {
  key?: string | undefined;
  /** Full category label ("Sep 28"); the table's row header. */
  label: string;
  value: number;
  /** Axis label under the column; empty to skip. Defaults to `label` upper-cased on every `xLabelEvery`th column. */
  axisLabel?: string | undefined;
  /** Readout line after the value ("Week of Sep 14 · 4 sessions · Thursday rained out"). Default `label`. */
  meta?: string | undefined;
  /** Extra table cells keyed by `extraColumns[].key` ("SESSIONS"). */
  extra?: Record<string, string | number> | undefined;
  /** Spoken column. Default "<label>: <value> <unit>". */
  accessibilityLabel?: string | undefined;
};

export type ColumnChartView = 'chart' | 'table';

export type ColumnChartProps = {
  /** Accessible name of the chart and the table ("People per week"). */
  title: string;
  /** One series, oldest first. The last column is highlighted and labelled in words. */
  data: ColumnChartDatum[];
  /** What a value counts, plural ("people"): readout "58 people". */
  unit: string;
  /** End label on the last column, before its value: "LAST WEEK · 58". Default LAST WEEK. */
  lastLabel?: string | undefined;
  /** Gridline values, lowest first. Default 0 and three steps up to a round top. */
  ticks?: number[] | undefined;
  /** Axis label on every nth column, from the first. Default 3. */
  xLabelEvery?: number | undefined;
  /** Table view headers. Default "WEEK OF" and the unit in caps. */
  categoryTitle?: string | undefined;
  valueTitle?: string | undefined;
  extraColumns?:
    { key: string; title: string; accessibilityLabel?: string | undefined }[] | undefined;
  /** Note under the chart (chart view only). */
  caption?: string | undefined;
  /** Controlled view; uncontrolled starts on `chart`. */
  view?: ColumnChartView | undefined;
  onViewChange?: ((view: ColumnChartView) => void) | undefined;
  /** Chart height in pt. Default 180. */
  height?: number | undefined;
  testID?: string | undefined;
};

const AXIS = 28;
const BAR = 18;
const tickStyle: TextStyle = {
  fontSize: 10,
  lineHeight: 12,
  fontWeight: '500',
  letterSpacing: 0,
  fontVariant: ['tabular-nums'],
};
const endStyle: TextStyle = { fontVariant: ['tabular-nums'], letterSpacing: 0.44 };

/**
 * One series over time (HostInsights "People per week"): `tint` columns on
 * hairline gridlines, the last one in `text` and labelled in words
 * ("LAST WEEK · 58"), so the highlight never rests on colour. Hover, focus or
 * tap a column to read it in the readout above. SHOW AS TABLE swaps the chart
 * for a DataTable of the same numbers, for screen readers and anyone who
 * would rather read than compare heights.
 */
export function ColumnChart({
  title,
  data,
  unit,
  lastLabel,
  ticks: ticksProp,
  xLabelEvery,
  categoryTitle = 'WEEK OF',
  valueTitle,
  extraColumns = [],
  caption,
  view: viewProp,
  onViewChange,
  height = 180,
  testID,
}: ColumnChartProps) {
  const [ownView, setOwnView] = useState<ColumnChartView>('chart');
  const view = viewProp ?? ownView;
  const [hot, setHot] = useState<number | null>(null);
  const [plotWidth, setPlotWidth] = useState(0);
  const [labelWidth, setLabelWidth] = useState(0);
  const tint = useThemeColor('tint');
  const ink = useThemeColor('text');

  const ticks = ticksProp?.length ? ticksProp : chartTicks(data.map((d) => d.value));
  const top = Math.max(...ticks, 1);
  const last = data.length - 1;
  const shown = hot ?? last;
  const current = data[shown];
  const read = current ? readout(current, unit) : null;
  const colWidth = data.length ? plotWidth / data.length : 0;
  const barWidth = colWidth ? Math.max(2, Math.min(BAR, colWidth - 6)) : BAR;

  const setView = (v: ColumnChartView) => {
    if (viewProp === undefined) setOwnView(v);
    onViewChange?.(v);
  };

  const tableColumns: DataTableColumn[] = [
    { key: '__label', title: categoryTitle, align: 'left' },
    { key: '__value', title: valueTitle ?? unit.toUpperCase(), width: 72 },
    ...extraColumns.map((c) => ({ ...c, width: 72 })),
  ];

  return (
    <View testID={testID} className="gap-space-4">
      {read ? (
        <View
          className="min-h-[24px] flex-row flex-wrap items-baseline gap-x-space-2"
          accessibilityLiveRegion="polite"
          {...(Platform.OS === 'web' ? { 'aria-live': 'polite' as const } : null)}
        >
          <Text variant="title" style={{ fontVariant: ['tabular-nums'] }}>
            {read.value}
          </Text>
          <Text variant="body-sm" muted>
            {read.meta}
          </Text>
        </View>
      ) : null}

      {view === 'chart' ? (
        <View>
          <View
            role="group"
            accessibilityLabel={title}
            style={{ height, marginLeft: AXIS }}
            onLayout={(e) => setPlotWidth(e.nativeEvent.layout.width)}
          >
            {ticks.map((t, i) => {
              const y = height - columnHeight(t, top, height);
              return (
                <View
                  key={`t${t}`}
                  pointerEvents="none"
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={{ position: 'absolute', left: 0, right: 0, top: y }}
                >
                  <View className={i === 0 ? 'h-px bg-line-strong' : 'h-px bg-line'} />
                  <Text
                    muted
                    style={[
                      tickStyle,
                      { position: 'absolute', left: -AXIS, width: 22, top: -6, textAlign: 'right' },
                    ]}
                  >
                    {String(t)}
                  </Text>
                </View>
              );
            })}
            <View className="absolute inset-0 flex-row items-end">
              {data.map((d, i) => (
                <Column
                  key={d.key ?? `${d.label}:${i}`}
                  height={columnHeight(d.value, top, height)}
                  barWidth={barWidth}
                  colour={i === last ? ink : tint}
                  ring={i === hot ? ink : null}
                  label={columnLabel(d, unit)}
                  onActive={() => setHot(i)}
                  onLeave={() => setHot((h) => (h === i ? null : h))}
                />
              ))}
            </View>
            {current && last >= 0 ? (
              <Text
                onLayout={(e) => setLabelWidth(e.nativeEvent.layout.width)}
                variant="label-sm"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={[
                  endStyle,
                  {
                    position: 'absolute',
                    right: Math.max(0, (colWidth - barWidth) / 2),
                    bottom: endLabelBottom(
                      data.map((d) => columnHeight(d.value, top, height)),
                      colWidth,
                      barWidth,
                      labelWidth,
                    ),
                  },
                ]}
              >
                {endLabel(data[last]!.value, lastLabel)}
              </Text>
            ) : null}
          </View>
          <View
            className="mt-space-2 flex-row"
            style={{ marginLeft: AXIS }}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {data.map((d, i) => (
              <View key={d.key ?? `${d.label}:${i}`} className="h-[12px] flex-1">
                <Text
                  muted
                  style={[
                    tickStyle,
                    {
                      position: 'absolute',
                      left: '50%',
                      marginLeft: -32,
                      width: 64,
                      textAlign: 'center',
                    },
                  ]}
                >
                  {axisLabel(d, i, xLabelEvery)}
                </Text>
              </View>
            ))}
          </View>
          {caption ? (
            <Text variant="caption" muted className="mt-space-3">
              {caption}
            </Text>
          ) : null}
        </View>
      ) : (
        <DataTable
          label={title}
          density="compact"
          columns={tableColumns}
          rows={data.map((d, i) => ({
            key: d.key ?? `${d.label}:${i}`,
            cells: { __label: d.label, __value: d.value, ...d.extra },
          }))}
        />
      )}

      <Button
        variant="ghost"
        style={{ marginLeft: -spacing['space-3'] }}
        accessibilityLabel={
          view === 'chart'
            ? `Show ${title.toLowerCase()} as a table`
            : `Show ${title.toLowerCase()} as a chart`
        }
        onPress={() => setView(view === 'chart' ? 'table' : 'chart')}
      >
        {toggleLabel(view)}
      </Button>
    </View>
  );
}

function Column({
  height,
  barWidth,
  colour,
  ring,
  label,
  onActive,
  onLeave,
}: {
  height: number;
  barWidth: number;
  colour: string;
  ring: string | null;
  label: string;
  onActive: () => void;
  onLeave: () => void;
}) {
  const focus = useFocusVisible({});
  return (
    <Pressable
      role="button"
      accessibilityLabel={label}
      onPress={onActive}
      onHoverIn={onActive}
      onHoverOut={onLeave}
      onFocus={(e) => {
        focus.onFocus(e);
        onActive();
      }}
      onBlur={(e) => {
        focus.onBlur(e);
        onLeave();
      }}
      onPressIn={focus.onPressIn}
      style={noBrowserOutline}
      className="h-full flex-1 items-center justify-end"
    >
      <View
        style={{
          width: barWidth,
          height,
          backgroundColor: colour,
        }}
      />
      {ring ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: 0,
            width: barWidth + 6,
            height: height + 3,
            borderWidth: 1,
            borderBottomWidth: 0,
            borderColor: ring,
          }}
        />
      ) : null}
      {focus.focusVisible ? <FocusRing shape="square" /> : null}
    </Pressable>
  );
}
