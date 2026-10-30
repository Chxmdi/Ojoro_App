import { borderWidth, type SituationId } from '@ojoro/design-tokens';
import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { Platform, Pressable, ScrollView, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Line } from 'react-native-svg';

import { motion, REDUCED_MOTION_FADE } from '../motion';
import { Situation } from '../Situation';
import { useThemeColor } from '../useThemeColor';
import {
  DEFAULT_PERIOD,
  HIT_MIN,
  PILL_HEIGHT,
  edgePad,
  emptyLine,
  fitLabels,
  fitProjection,
  hasActivity,
  labelWidth,
  mapSummary,
  markerModel,
  markerRadius,
  pointLabel,
  pointLine,
  separate,
  sortByBusiest,
  toggleLabel,
  type AreaMapArea,
  type AreaMapEdges,
  type AreaMapInset,
  type AreaMapPoint,
  type AreaMapView,
  type MarkerModel,
} from './AreaMap.logic';
import { Button } from './Button';
import { Icon } from './Icon';
import { LiveIndicator } from './LiveIndicator';
import { useOverlayReducedMotion } from './Overlay';
import { FocusRing, noBrowserOutline, useFocusVisible } from './pressFeedback';
import { Text } from './Text';

export {
  DEFAULT_PERIOD,
  DISC_MAX,
  DISC_MIN,
  HIT_MIN as AREA_MAP_HIT_MIN,
  discSize,
  emptyLine,
  fitProjection,
  hasActivity,
  mapSummary,
  markerModel,
  pointLabel,
  pointLine,
  pointParts,
  separate,
  sortByBusiest,
  toggleLabel as areaMapToggleLabel,
  wantSize,
  type AreaMapArea,
  type AreaMapEdges,
  type AreaMapInset,
  type AreaMapPoint,
  type AreaMapView,
  type MarkerKind,
  type MarkerModel,
} from './AreaMap.logic';

/**
 * What a map renderer draws. The schematic renderer below implements it; a
 * real maps provider (not chosen yet) implements the same props and AreaMap
 * keeps the toggle, the list and the text alternative around it.
 */
export type AreaMapRendererProps = {
  /** Points with something on (filters already applied upstream). */
  points: AreaMapPoint[];
  areas: AreaMapArea[];
  selectedId: string | null;
  onSelect?: ((id: string) => void) | undefined;
  /** Room kept clear for the screen's overlaid header and sheet. */
  inset: AreaMapEdges;
  /** "tonight": the window the counts cover, in spoken labels. */
  period: string;
};

export type AreaMapProps = {
  /** Names the map and starts its text alternative: "Map of central Montréal". */
  title: string;
  /** Places/areas with public centroids and aggregate counts. Filter upstream. */
  points: AreaMapPoint[];
  /** Neighbourhood names set on the ground (decorative; the list carries areas per point). */
  areas?: AreaMapArea[] | undefined;
  selectedId?: string | null | undefined;
  /** A marker or list row was pressed. */
  onSelect?: ((id: string) => void) | undefined;
  /** Controlled view; uncontrolled starts on the map. */
  view?: AreaMapView | undefined;
  onViewChange?: ((view: AreaMapView) => void) | undefined;
  /** Draw SHOW AS LIST / SHOW AS MAP on the map. Default true. Turn off to place `AreaMapViewToggle` yourself. */
  toggle?: boolean | undefined;
  /** Room kept clear for an overlaid header (top) and sheet (bottom). */
  inset?: AreaMapInset | undefined;
  /** The window the counts cover, for spoken labels. Default "tonight". */
  period?: string | undefined;
  /** The honest corner note. Default SCHEMATIC MAP; null hides it (a real provider's map). */
  note?: string | null | undefined;
  /** Shown when no point has anything on. Default "Nothing on tonight in this area." */
  emptyText?: string | undefined;
  /** Draws the map. Default `SchematicMap`. */
  renderer?: ComponentType<AreaMapRendererProps> | undefined;
  /** The ground. Default live, as Pulse. */
  situation?: SituationId | undefined;
  testID?: string | undefined;
};

/** Room under the inset for the note and the toggle, so no marker sits under them. */
const CONTROL_BAND = 64;

const ZERO_INSET: AreaMapEdges = { top: 0, right: 0, bottom: 0, left: 0 };

function fullInset(i: AreaMapInset | undefined): AreaMapEdges {
  return {
    top: i?.top ?? 0,
    right: i?.right ?? 0,
    bottom: i?.bottom ?? 0,
    left: i?.left ?? 0,
  };
}

/**
 * Pulse's map (PRD §9.16, §11.2): areas and places as aggregate markers,
 * never people. A provider-agnostic shell: `renderer` draws the map (the
 * built-in `SchematicMap` until a maps provider is chosen) and AreaMap adds
 * the parts every renderer needs: the full text alternative (the group's
 * label reads the busiest places in words), a SHOW AS LIST toggle and the
 * list itself, where every point is a row with the same words and selection.
 */
export function AreaMap({
  title,
  points,
  areas = [],
  selectedId = null,
  onSelect,
  view: viewProp,
  onViewChange,
  toggle = true,
  inset: insetProp,
  period = DEFAULT_PERIOD,
  note = 'SCHEMATIC MAP',
  emptyText,
  renderer: Renderer = SchematicMap,
  situation = 'live',
  testID,
}: AreaMapProps) {
  const [ownView, setOwnView] = useState<AreaMapView>('map');
  const view = viewProp ?? ownView;
  const inset = fullInset(insetProp);
  const on = useMemo(() => points.filter(hasActivity), [points]);
  const summary = mapSummary(title, points, period);

  const setView = (v: AreaMapView) => {
    if (viewProp === undefined) setOwnView(v);
    onViewChange?.(v);
  };

  const toggleButton = toggle ? (
    <AreaMapViewToggle view={view} title={title} onChange={setView} />
  ) : null;

  return (
    <Situation id={situation} className="flex-1 overflow-hidden" testID={testID}>
      {view === 'map' ? (
        <View
          className="flex-1"
          role="group"
          accessibilityLabel={summary}
          {...(Platform.OS === 'web' ? { 'aria-label': summary } : null)}
        >
          <Renderer
            points={on}
            areas={areas}
            selectedId={selectedId}
            onSelect={onSelect}
            inset={note || toggle ? { ...inset, top: inset.top + CONTROL_BAND } : inset}
            period={period}
          />
          {on.length === 0 ? (
            <View
              pointerEvents="none"
              className="absolute items-center justify-center px-space-6"
              style={{ top: inset.top, bottom: inset.bottom, left: inset.left, right: inset.right }}
            >
              <Text variant="body-sm" muted style={{ textAlign: 'center' }}>
                {emptyText ?? emptyLine(period)}
              </Text>
            </View>
          ) : null}
          <View
            pointerEvents="box-none"
            className="absolute flex-row items-center justify-between gap-space-2 px-space-3 pt-space-3"
            style={{ top: inset.top, left: inset.left, right: inset.right }}
          >
            {note ? (
              <Text
                variant="label-sm"
                muted
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                {note}
              </Text>
            ) : (
              <View />
            )}
            {toggleButton ? <View className="rounded-pill bg-surface">{toggleButton}</View> : null}
          </View>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            paddingTop: inset.top,
            paddingBottom: inset.bottom,
            paddingLeft: inset.left,
            paddingRight: inset.right,
          }}
        >
          {toggleButton ? (
            <View className="flex-row px-space-3 pt-space-3">{toggleButton}</View>
          ) : null}
          <AreaMapList
            title={title}
            points={points}
            selectedId={selectedId}
            onSelect={onSelect}
            period={period}
            emptyText={emptyText}
          />
        </ScrollView>
      )}
    </Situation>
  );
}

export type AreaMapViewToggleProps = {
  view: AreaMapView;
  /** The map's title, for the spoken label ("Show map of central Montréal as a list"). */
  title: string;
  onChange: (view: AreaMapView) => void;
};

/** SHOW AS LIST / SHOW AS MAP, for screens that place the toggle themselves. */
export function AreaMapViewToggle({ view, title, onChange }: AreaMapViewToggleProps) {
  const name = title.trim().replace(/\.$/, '');
  return (
    <Button
      variant="secondary"
      compact
      accessibilityLabel={view === 'map' ? `Show ${name} as a list` : `Show ${name} as a map`}
      onPress={() => onChange(view === 'map' ? 'list' : 'map')}
      testID="area-map-toggle"
    >
      {toggleLabel(view)}
    </Button>
  );
}

export type AreaMapListProps = {
  title: string;
  points: AreaMapPoint[];
  selectedId?: string | null | undefined;
  onSelect?: ((id: string) => void) | undefined;
  period?: string | undefined;
  emptyText?: string | undefined;
};

/**
 * The map as rows, busiest first: name, area, and what's on in words. The
 * selected row says SELECTED next to a check, not by colour.
 */
export function AreaMapList({
  title,
  points,
  selectedId = null,
  onSelect,
  period = DEFAULT_PERIOD,
  emptyText,
}: AreaMapListProps) {
  const rows = sortByBusiest(points);
  return (
    <View role="list" accessibilityLabel={title} className="px-space-5">
      {rows.length === 0 ? (
        <Text variant="body-sm" muted className="py-space-6">
          {emptyText ?? emptyLine(period)}
        </Text>
      ) : (
        rows.map((p) => (
          <ListRow
            key={p.id}
            point={p}
            selected={p.id === selectedId}
            onPress={onSelect ? () => onSelect(p.id) : undefined}
            period={period}
          />
        ))
      )}
    </View>
  );
}

function ListRow({
  point,
  selected,
  onPress,
  period,
}: {
  point: AreaMapPoint;
  selected: boolean;
  onPress?: (() => void) | undefined;
  period: string;
}) {
  const focus = useFocusVisible({});
  return (
    <Pressable
      role="button"
      accessibilityLabel={pointLabel(point, { selected, period })}
      accessibilityState={{ selected }}
      onPress={onPress}
      disabled={!onPress}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      onPressIn={focus.onPressIn}
      style={noBrowserOutline}
      className={`min-h-[64px] flex-row items-center gap-space-3 border-b py-space-3 ${
        selected ? 'border-line-strong' : 'border-line'
      }`}
      testID={`area-map-row-${point.id}`}
    >
      <View className="flex-1 gap-space-1">
        <Text variant="title-sm">{point.name}</Text>
        <Text variant="body-sm" muted style={{ fontVariant: ['tabular-nums'] }}>
          {[point.area, pointLine(point, period)].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {selected ? (
        <View className="flex-row items-center gap-space-1">
          <Icon name="check" size={16} />
          <Text variant="label-sm">SELECTED</Text>
        </View>
      ) : null}
      {focus.focusVisible ? <FocusRing shape="square" /> : null}
    </Pressable>
  );
}

/** label-sm line height, for label collisions. */
const LABEL_HEIGHT = 16;

/** Lattice spacing of the decorative ground lines. */
const LATTICE = 120;
const LATTICE_ANGLE = -34;

/**
 * The built-in renderer: a plain ground in the situation (no tiles, no streets,
 * a faint decorative lattice like Pulse.png), neighbourhood names, and one
 * aggregate marker per point, projected from its public centroid and fitted
 * to the visible points. Markers are pushed apart so each keeps its own 44pt
 * target; positions are approximate on purpose.
 */
export function SchematicMap({
  points,
  areas,
  selectedId,
  onSelect,
  inset,
  period,
}: AreaMapRendererProps) {
  const [box, setBox] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((b) => (b.width === width && b.height === height ? b : { width, height }));
  };

  const { placed, labels } = useMemo(() => {
    if (!box.width || !box.height) return { placed: [], labels: [] };
    const bounds = {
      left: inset.left,
      top: inset.top,
      right: box.width - inset.right,
      bottom: box.height - inset.bottom,
    };
    const e = edgePad(bounds.right - bounds.left, bounds.bottom - bounds.top);
    const pad = {
      top: inset.top + e,
      right: inset.right + e,
      bottom: inset.bottom + e,
      left: inset.left + e,
    };
    const models = points
      .map((p) => ({ p, m: markerModel(p) }))
      .filter((x): x is { p: AreaMapPoint; m: MarkerModel } => x.m !== null);
    const proj = fitProjection(models.length ? models.map((x) => x.p) : areas, box, pad);
    const spread = separate(
      models.map(({ p, m }) => ({ id: p.id, ...proj.project(p.lat, p.lng), r: markerRadius(m) })),
      bounds,
    );
    const names = fitLabels(
      areas.map((a) => {
        const at = proj.project(a.lat, a.lng);
        const width = labelWidth(a.name);
        // Nudge inside the edges rather than cutting the word.
        const x = Math.min(
          Math.max(at.x, bounds.left + width / 2 + 8),
          bounds.right - width / 2 - 8,
        );
        return { id: a.id, x, y: at.y, width, height: LABEL_HEIGHT };
      }),
      spread,
      bounds,
    ).map((l) => ({ ...l, name: areas.find((a) => a.id === l.id)!.name }));
    return {
      placed: models.map((x, i) => ({ ...x, x: spread[i]!.x, y: spread[i]!.y })),
      labels: names,
    };
  }, [points, areas, box, inset.top, inset.right, inset.bottom, inset.left]);

  return (
    <View className="flex-1" onLayout={onLayout}>
      <Ground width={box.width} height={box.height} />
      {labels.map((l) => (
        <Text
          key={l.id}
          variant="label-sm"
          muted
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          numberOfLines={1}
          style={{
            position: 'absolute',
            left: l.x - l.width / 2,
            top: l.y - l.height / 2,
            width: l.width,
            textAlign: 'center',
          }}
        >
          {l.name.toUpperCase()}
        </Text>
      ))}
      {placed.map(({ p, m, x, y }) => (
        <Marker
          key={p.id}
          point={p}
          model={m}
          x={x}
          y={y}
          selected={p.id === selectedId}
          onPress={onSelect ? () => onSelect(p.id) : undefined}
          period={period}
        />
      ))}
    </View>
  );
}

function Ground({ width, height }: { width: number; height: number }) {
  const line = useThemeColor('line');
  if (!width || !height) return null;
  const diag = Math.hypot(width, height);
  const n = Math.ceil(diag / LATTICE) + 1;
  const cx = width / 2;
  const cy = height / 2;
  const lines: { x1: number; y1: number; x2: number; y2: number; key: string }[] = [];
  for (const angle of [LATTICE_ANGLE, LATTICE_ANGLE + 90]) {
    const rad = (angle * Math.PI) / 180;
    const ux = Math.cos(rad);
    const uy = Math.sin(rad);
    for (let k = -n; k <= n; k += 1) {
      const ox = cx - uy * k * LATTICE;
      const oy = cy + ux * k * LATTICE;
      lines.push({
        key: `${angle}:${k}`,
        x1: ox - ux * diag,
        y1: oy - uy * diag,
        x2: ox + ux * diag,
        y2: oy + uy * diag,
      });
    }
  }
  const hidden =
    Platform.OS === 'web'
      ? { 'aria-hidden': true }
      : {
          accessibilityElementsHidden: true,
          importantForAccessibility: 'no-hide-descendants' as const,
        };
  return (
    <Svg
      width={width}
      height={height}
      style={{ position: 'absolute', left: 0, top: 0 }}
      pointerEvents="none"
      {...hidden}
    >
      {lines.map(({ key, ...l }) => (
        <Line key={key} {...l} stroke={line} strokeWidth={1} />
      ))}
    </Svg>
  );
}

function Marker({
  point,
  model,
  x,
  y,
  selected,
  onPress,
  period,
}: {
  point: AreaMapPoint;
  model: MarkerModel;
  x: number;
  y: number;
  selected: boolean;
  onPress?: (() => void) | undefined;
  period: string;
}) {
  const focus = useFocusVisible({});
  const [width, setWidth] = useState(Math.max(HIT_MIN, model.size));
  const primaryH = Math.max(HIT_MIN, model.size);
  return (
    <Pressable
      role="button"
      accessibilityLabel={pointLabel(point, { selected, period })}
      accessibilityState={{ selected }}
      onPress={onPress}
      disabled={!onPress}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      onPressIn={focus.onPressIn}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[
        noBrowserOutline,
        {
          position: 'absolute',
          left: x - width / 2,
          top: y - primaryH / 2,
          alignItems: 'center',
          zIndex: selected ? 2 : 1,
        },
      ]}
      testID={`area-map-marker-${point.id}`}
    >
      <View
        style={{ minWidth: HIT_MIN, minHeight: HIT_MIN }}
        className="items-center justify-center"
      >
        <Primary model={model} selected={selected} />
      </View>
      {model.forming ? (
        <View className="mt-space-1">
          <FormingPill figure={model.forming} />
        </View>
      ) : null}
      {focus.focusVisible ? <FocusRing shape="square" /> : null}
    </Pressable>
  );
}

function Primary({ model, selected }: { model: MarkerModel; selected: boolean }) {
  const ink = useThemeColor('text');
  const dashed = useThemeColor('line-strong');
  const ring = (
    <SelectRing selected={selected} round={model.kind === 'active' || model.kind === 'wanting'} />
  );
  if (model.kind === 'live') {
    return (
      <View>
        <LiveIndicator label={model.word ?? undefined} decorative />
        {ring}
      </View>
    );
  }
  if (model.kind === 'forming') {
    return (
      <View>
        <FormingPill figure={model.figure} />
        {ring}
      </View>
    );
  }
  const d = model.size;
  const big = d >= 64;
  return (
    <View
      className="items-center justify-center rounded-disc"
      style={{
        width: d,
        height: d,
        ...(model.kind === 'active'
          ? { borderWidth: borderWidth['border-strong'], borderColor: ink }
          : null),
      }}
    >
      {model.kind === 'active' ? (
        <View className="absolute inset-0 rounded-disc bg-surface" style={{ zIndex: -1 }} />
      ) : (
        <Svg
          width={d}
          height={d}
          style={{ position: 'absolute', left: 0, top: 0 }}
          pointerEvents="none"
        >
          <Circle
            cx={d / 2}
            cy={d / 2}
            r={d / 2 - 1}
            stroke={dashed}
            strokeWidth={2}
            strokeDasharray="6 5"
            fill="none"
          />
        </Svg>
      )}
      {big || model.kind === 'wanting' ? (
        <Text variant="display-xs" style={{ fontVariant: ['tabular-nums'] }}>
          {model.figure}
        </Text>
      ) : (
        <Text variant="numeric" style={{ fontSize: 13, lineHeight: 16 }}>
          {model.figure}
        </Text>
      )}
      {model.word ? (
        <Text variant="label-sm" muted style={{ textAlign: 'center' }}>
          {model.word}
        </Text>
      ) : null}
      {ring}
    </View>
  );
}

function FormingPill({ figure }: { figure: string }) {
  return (
    <View
      className="flex-row items-center gap-space-2 rounded-pill bg-signal px-space-3"
      style={{ height: PILL_HEIGHT }}
    >
      <Text variant="label-sm" tone="on-signal">
        FORMING
      </Text>
      <Text variant="numeric" tone="on-signal" style={{ fontSize: 13, lineHeight: 16 }}>
        {figure}
      </Text>
    </View>
  );
}

/** Selection: a 2px `text` ring 4pt outside the marker. It fades in (dur-commit, from a little larger); reduced motion cross-fades only. */
function SelectRing({ selected, round }: { selected: boolean; round: boolean }) {
  const reduced = useOverlayReducedMotion();
  const ink = useThemeColor('text');
  const v = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    v.value = withTiming(
      selected ? 1 : 0,
      reduced
        ? { duration: REDUCED_MOTION_FADE }
        : { duration: motion.commit.duration, easing: motion.commit.easing },
    );
  }, [selected, reduced, v]);
  const style = useAnimatedStyle(() => ({
    opacity: v.value,
    transform: [{ scale: reduced ? 1 : 1.12 - 0.12 * v.value }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      className={round ? 'rounded-disc' : 'rounded-pill'}
      style={[
        {
          position: 'absolute',
          top: -6,
          left: -6,
          right: -6,
          bottom: -6,
          borderWidth: 2,
          borderColor: ink,
        },
        style,
      ]}
    />
  );
}

export type AreaMapLegendProps = {
  /** Words per mark. Defaults as Pulse: Activity, Forming, People want it. */
  activity?: string | undefined;
  forming?: string | undefined;
  wanting?: string | undefined;
};

/** Pulse's legend: each marker shape with its word, so the markers never rely on colour. */
export function AreaMapLegend({
  activity = 'Activity',
  forming = 'Forming',
  wanting = 'People want it',
}: AreaMapLegendProps) {
  const ink = useThemeColor('text');
  const dashed = useThemeColor('line-strong');
  return (
    <View accessibilityLabel="Legend" className="flex-row flex-wrap gap-x-space-4 gap-y-space-1">
      <View className="flex-row items-center gap-space-2">
        <View
          className="rounded-disc"
          style={{ width: 12, height: 12, borderWidth: 2, borderColor: ink }}
        />
        <Text variant="caption" muted>
          {activity}
        </Text>
      </View>
      <View className="flex-row items-center gap-space-2">
        <View className="rounded-pill bg-signal" style={{ width: 18, height: 10 }} />
        <Text variant="caption" muted>
          {forming}
        </Text>
      </View>
      <View className="flex-row items-center gap-space-2">
        <Svg width={12} height={12} pointerEvents="none">
          <Circle
            cx={6}
            cy={6}
            r={5}
            stroke={dashed}
            strokeWidth={2}
            strokeDasharray="3 3"
            fill="none"
          />
        </Svg>
        <Text variant="caption" muted>
          {wanting}
        </Text>
      </View>
    </View>
  );
}

export { ZERO_INSET as AREA_MAP_NO_INSET };
