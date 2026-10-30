/**
 * `/pulse`: Pulse (design-handoff/screens/Pulse.png, live; PRD §9.16, §11.2; docs/PLACES_CONTRACT.md,
 * Pulse). Back, PULSE and "Tonight · 3 km"; sport chips (Everything first) then time chips; the legend;
 * the map of aggregates (AreaMap, with SHOW AS LIST and a full text alternative); the selected place
 * docked at the bottom with OPEN PLACE and CREATE HERE. Areas, not people.
 */
import { shadow } from '@ojoro/design-tokens';
import type { PulseMarker, PulseWhen } from '@ojoro/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect, useIsFocused, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AreaMap,
  AreaMapLegend,
  Button,
  Chip,
  ChipRow,
  IconButton,
  loadingProps,
  Screen,
  Situation,
  Skeleton,
  Text,
  TextButton,
  type AreaMapView,
} from '@/design-system';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { useOnline } from '../activities/data';
import { goBack, InlineError } from '../activities/ui';
import { useAreas } from '../area/data';
import { useHomeDensity, useSportsNearby } from '../discover/data';
import { AREA_PICKER } from '../discover/sections';
import { DownForSheet } from '../downfor/DownForSheet';
import { placeRoutes } from '../places/routes';
import { OfflineNote } from '../places/ui';
import { usePulse, usePulsePlace, usePulseRealtime } from './data';
import {
  areaLabels,
  DEFAULT_WHEN,
  defaultSelection,
  emptyCopy,
  headerCaption,
  keepSelection,
  mapTitle,
  markerPoints,
  periodWords,
  placeIdOf,
  PULSE_WHEN_CHIPS,
  pulseCity,
} from './logic';

const PRIVACY_LINE = "Areas, not people. Exact spots show only inside plans you've joined.";

export function PulseScreen() {
  const params = useLocalSearchParams<{ place?: string }>();
  const focused = useIsFocused();
  const online = useOnline();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();

  const [sportId, setSportId] = useState<string | null>(null);
  const [when, setWhen] = useState<PulseWhen>(DEFAULT_WHEN);
  const [view, setView] = useState<AreaMapView>('map');
  // undefined: not chosen yet (open on the busiest place, or the place in the link); null: closed.
  const [chosen, setChosen] = useState<string | null | undefined>(
    typeof params.place === 'string' && params.place ? `place:${params.place}` : undefined,
  );
  const [sheetHeight, setSheetHeight] = useState(0);
  const [downFor, setDownFor] = useState(false);

  const density = useHomeDensity();
  const sports = useSportsNearby();
  const areas = useAreas();
  const pulse = usePulse(sportId, when, focused);
  const markers = useMemo(() => pulse.data ?? [], [pulse.data]);
  const points = useMemo(() => markerPoints(markers), [markers]);

  const hasArea = density.data?.has_area !== false;
  const myCity = useMemo(() => {
    const label = density.data?.area ?? null;
    return label ? (label.split(',')[1]?.trim() ?? null) : null;
  }, [density.data?.area]);
  usePulseRealtime(pulseCity(markers, myCity));

  const selected =
    chosen === undefined ? keepSelection(defaultSelection(markers), points) : keepSelection(chosen, points);
  const selectedMarker = markers.find((m) => m.marker_id === selected) ?? null;
  const placeId = placeIdOf(selected);
  const sheetPlace = usePulsePlace(placeId, sportId, when, focused);

  // Refresh on coming back (not on the first focus: the queries just loaded).
  const seen = useRef(false);
  useFocusEffect(
    useCallback(() => {
      track('screen_viewed', { screen: 'pulse' });
      if (seen.current) void qc.invalidateQueries({ queryKey: ['pulse'] });
      seen.current = true;
    }, [qc]),
  );

  const sportName = sportId ? (sports.data?.find((s) => s.sport_id === sportId)?.sport_name ?? null) : null;
  const filter = (what: 'sport' | 'when', value: string | null) => track('pulse_filter_changed', { filter: what, value });
  const select = (id: string) => {
    const m = markers.find((x) => x.marker_id === id);
    track('pulse_marker_selected', { kind: m?.kind ?? null, view });
    setChosen(id);
  };

  const areaList = useMemo(() => areaLabels(areas.data ?? []), [areas.data]);
  const title = mapTitle(markers, myCity);
  const empty = emptyCopy(when, sportName);
  const sheetOpen = !!selectedMarker || (!pulse.isPending && points.length === 0);

  return (
    <Screen situation="live" gutter={false}>
      <View className="border-b border-line pb-space-4" testID="pulse-header">
        <View className="flex-row items-center gap-space-2 pl-space-2 pr-space-5 pt-space-2">
          <IconButton icon="back" label="Back" onPress={() => goBack('/discover' as Href)} testID="header-back" />
          <Text variant="display-sm" role="heading" aria-level={1} className="flex-1">
            PULSE
          </Text>
          <Text variant="caption" muted style={{ fontVariant: ['tabular-nums'] }} testID="pulse-caption">
            {headerCaption(when, density.data?.radius_km, hasArea)}
          </Text>
        </View>
        <View className="gap-space-3 pl-space-3 pt-space-3">
          <ChipRow label="Filter" bleed={0} testID="pulse-filters">
            <Chip
              selected={sportId === null}
              onPress={() => {
                filter('sport', null);
                setSportId(null);
              }}
              testID="pulse-sport-all"
            >
              Everything
            </Chip>
            {(sports.data ?? []).map((s) => (
              <Chip
                key={s.sport_id}
                selected={sportId === s.sport_id}
                onPress={() => {
                  const next = sportId === s.sport_id ? null : s.sport_id;
                  filter('sport', next);
                  setSportId(next);
                }}
                testID={`pulse-sport-${s.sport_id}`}
              >
                {s.sport_name}
              </Chip>
            ))}
            {PULSE_WHEN_CHIPS.map((w) => (
              <Chip
                key={w.id}
                selected={when === w.id}
                onPress={() => {
                  filter('when', w.id);
                  setWhen(w.id);
                }}
                testID={`pulse-when-${w.id}`}
              >
                {w.label}
              </Chip>
            ))}
          </ChipRow>
          <View className="pr-space-3">
            <AreaMapLegend />
          </View>
        </View>
      </View>

      {!online ? (
        <View className="px-space-5 pt-space-3">
          <OfflineNote dataUpdatedAt={pulse.dataUpdatedAt} what="Pulse" />
        </View>
      ) : null}
      {!hasArea ? (
        <View className="flex-row flex-wrap items-center gap-x-space-3 px-space-5 pt-space-3" testID="pulse-no-area">
          <Text variant="body-sm" className="shrink">
            Pick your area and Pulse centres on what's near you.
          </Text>
          <TextButton onPress={() => router.push(AREA_PICKER)}>PICK YOUR AREA</TextButton>
        </View>
      ) : null}

      <View className="flex-1">
        {pulse.isPending && !pulse.data ? (
          <View className="gap-space-4 px-space-5 pt-space-6" {...loadingProps('Loading Pulse')}>
            <Skeleton kind="object" />
            <Skeleton kind="strip" />
          </View>
        ) : pulse.isError && !pulse.data ? (
          <View className="px-space-5 pt-space-6" testID="pulse-error">
            <InlineError
              message={errorMessage(ojoroErrorOf(pulse.error))}
              action="RETRY"
              onAction={() => void pulse.refetch()}
            />
          </View>
        ) : (
          <AreaMap
            title={title}
            points={points}
            areas={areaList}
            selectedId={selected}
            onSelect={select}
            view={view}
            onViewChange={(v) => {
              track('pulse_view_toggled', { view: v });
              setView(v);
            }}
            inset={{ bottom: sheetOpen ? sheetHeight : 0 }}
            period={periodWords(when)}
            emptyText={empty.line}
            testID="pulse-map"
          />
        )}
      </View>

      {sheetOpen ? (
        <DockedSheet
          title={selectedMarker ? sheetTitle(selectedMarker) : empty.line}
          onClose={selectedMarker ? () => setChosen(null) : undefined}
          bottomInset={insets.bottom}
          onHeight={setSheetHeight}
        >
          {selectedMarker ? (
            selectedMarker.kind === 'place' && placeId ? (
              <PlaceSheetBody
                placeId={placeId}
                marker={selectedMarker}
                query={sheetPlace}
                online={online}
              />
            ) : (
              <AggregateSheetBody marker={selectedMarker} />
            )
          ) : (
            <EmptySheetBody
              widen={empty.widen}
              onWiden={() => {
                filter('when', 'week');
                setWhen('week');
              }}
              onDownFor={() => setDownFor(true)}
            />
          )}
        </DockedSheet>
      ) : null}

      <DownForSheet
        visible={downFor}
        onClose={() => setDownFor(false)}
        source="pulse"
        defaultRadiusKm={density.data?.radius_km ?? undefined}
      />
    </Screen>
  );
}

function sheetTitle(m: PulseMarker): string {
  if (m.kind === 'place') return m.place_name ?? m.label;
  if (m.kind === 'demand') return `${m.people_count ?? 0} want ${(m.sport_name ?? '').toLowerCase()}`;
  return m.label;
}

/**
 * The selected marker, docked under the map (Pulse.png): a sheet's shape without a scrim, so the map
 * stays usable and readable around it (the DS Sheet is modal).
 */
function DockedSheet({
  title,
  onClose,
  bottomInset,
  onHeight,
  children,
}: {
  title: string;
  onClose?: (() => void) | undefined;
  bottomInset: number;
  onHeight: (h: number) => void;
  children: ReactNode;
}) {
  return (
    <Situation
      id="live"
      role="region"
      aria-label={title}
      className="absolute bottom-0 left-0 right-0 gap-space-4 rounded-t-sheet px-space-5 pt-space-2"
      style={[shadow['shadow-sheet'], { paddingBottom: 24 + bottomInset }]}
      onLayout={(e) => onHeight(Math.round(e.nativeEvent.layout.height))}
      testID="pulse-sheet"
    >
      <View
        className="self-center rounded-pill bg-line-strong"
        style={{ width: 40, height: 4 }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <View className="flex-row items-center justify-between gap-space-2">
        <Text variant="title" role="heading" aria-level={2} className="flex-1" testID="pulse-sheet-title">
          {title}
        </Text>
        {onClose ? <IconButton icon="close" label="Close" onPress={onClose} testID="pulse-sheet-close" /> : null}
      </View>
      {children}
    </Situation>
  );
}

function PlaceSheetBody({
  placeId,
  marker,
  query,
  online,
}: {
  placeId: string;
  marker: PulseMarker;
  query: ReturnType<typeof usePulsePlace>;
  online: boolean;
}) {
  const place = query.data ?? null;
  return (
    <View className="gap-space-3">
      {query.isPending && !place ? (
        <View {...loadingProps('Loading the place')}>
          <Skeleton kind="text" />
        </View>
      ) : query.isError && !place ? (
        <InlineError message={errorMessage(ojoroErrorOf(query.error))} action="RETRY" onAction={() => void query.refetch()} />
      ) : place ? (
        <>
          <Text variant="body-sm" muted testID="pulse-sheet-facts">
            {place.facts}
          </Text>
          <Text variant="body-sm" testID="pulse-sheet-headline">
            {place.headline}
          </Text>
        </>
      ) : (
        <Text variant="body-sm">{marker.summary}</Text>
      )}
      <View className="flex-row flex-wrap gap-space-2">
        <Button
          href={placeRoutes.place(placeId)}
          onPress={() => track('place_opened', { place_id: placeId, source: 'pulse' })}
          testID="pulse-open-place"
        >
          OPEN PLACE
        </Button>
        <Button
          variant="secondary"
          onPress={() => {
            track('create_here_tapped', { place_id: placeId, source: 'pulse', online });
            router.push(placeRoutes.createHere(placeId, place?.main_sport_id ?? null));
          }}
          testID="pulse-create-here"
        >
          CREATE HERE
        </Button>
      </View>
      <Text variant="caption" muted>
        {PRIVACY_LINE}
      </Text>
    </View>
  );
}

/** An area total or people who want a sport: counts only, and where to act on them. */
function AggregateSheetBody({ marker }: { marker: PulseMarker }) {
  return (
    <View className="gap-space-3">
      <Text variant="body-sm" testID="pulse-sheet-headline">
        {marker.summary}
      </Text>
      {marker.kind === 'demand' ? (
        <Text variant="caption" muted>
          Shown as a count. Nobody's name or location is shared until they join.
        </Text>
      ) : null}
      <View className="flex-row flex-wrap gap-space-2">
        <Button href={'/discover' as Href} testID="pulse-open-discover">
          OPEN DISCOVER
        </Button>
        <Button variant="secondary" href={'/create' as Href} testID="pulse-create">
          CREATE
        </Button>
      </View>
      <Text variant="caption" muted>
        {PRIVACY_LINE}
      </Text>
    </View>
  );
}

function EmptySheetBody({
  widen,
  onWiden,
  onDownFor,
}: {
  widen: boolean;
  onWiden: () => void;
  onDownFor: () => void;
}) {
  return (
    <View className="gap-space-3" testID="pulse-empty">
      <Text variant="body-sm">Look further ahead, or say what you're down for and Ojoro finds people.</Text>
      <View className="flex-row flex-wrap gap-space-2">
        {widen ? (
          <Button onPress={onWiden} testID="pulse-widen">
            SHOW THIS WEEK
          </Button>
        ) : null}
        <Button variant={widen ? 'secondary' : 'primary'} onPress={onDownFor}>
          SAY YOU'RE DOWN
        </Button>
      </View>
      <Text variant="caption" muted>
        {PRIVACY_LINE}
      </Text>
    </View>
  );
}
