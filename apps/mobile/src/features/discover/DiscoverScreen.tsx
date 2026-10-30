/**
 * Discover (Discover.png, docs/LIQUIDITY_CONTRACT.md §Discover): search with kind, sport and time
 * chips; Ojoro Now in the forming band with latent demand (a count only) and Surprise Me; people to
 * move with; places near you (each opens its Place); the end of the feed. MAP opens Pulse (M8).
 * Crews & Clans (M7) are left out (docs/DESIGN_DECISIONS.md, Step 3 screens).
 */
import type { DiscoverWhen } from '@ojoro/contracts';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { Button, Chip, ChipRow, FeedEnd, Input, Screen, Text, TextButton, useToast } from '@/design-system';
import { clockTime, updatedAt } from '@/lib/age';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { useSports } from '../downfor/data';
import { DownForSheet } from '../downfor/DownForSheet';
import { placeRoutes } from '../places/routes';
import { useNow, useOnline } from '../plans/data';
import { OfflineBanner, routes } from '../plans/parts';
import {
  discoverKeys,
  useDebounced,
  useDiscoverSearch,
  useHomeDensity,
  useLatentDemand,
  useMakeItHappen,
  useOjoroNow,
  usePeopleToMoveWith,
  usePlacesNearby,
  useSportsNearby,
  useSurpriseMe,
} from './data';
import {
  demandCopy,
  groupedCount,
  groupResults,
  KIND_FILTERS,
  needsArea,
  NO_FILTERS,
  nowStrip,
  nowSummary,
  offlineResultsLine,
  personCard,
  pickDemand,
  placeCard,
  resultsSummary,
  resultStrip,
  SEARCH_DEBOUNCE_MS,
  searchState,
  WHEN_FILTERS,
  type DemandBucket,
  type Filters,
  type KindFilter,
  type NowStrip,
  type SuggestionRow,
} from './logic';
import {
  AREA_PICKER,
  AreaPrompt,
  OjoroNow,
  PeopleToMoveWith,
  PlacesNearYou,
  profileRoute,
  Results,
  routeHref,
  SurpriseResult,
  trackOpen,
} from './sections';

/** People to move with shows this many cards; the design shows one. */
const PEOPLE_SHOWN = 3;
const PLACES_SHOWN = 5;

export function DiscoverScreen() {
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const online = useOnline();
  const now = useNow([]);

  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sheet, setSheet] = useState(false);
  const [noArea, setNoArea] = useState(false);
  const [demandError, setDemandError] = useState<string | null>(null);
  const [surprise, setSurprise] = useState<{ row: SuggestionRow | null } | null>(null);

  const query = useDebounced(filters.query, SEARCH_DEBOUNCE_MS);
  const settled = useMemo(() => searchState({ ...filters, query }), [filters, query]);
  const typed = useMemo(() => searchState(filters), [filters]);

  const density = useHomeDensity();
  const ojoroNow = useOjoroNow();
  const demand = useLatentDemand();
  const people = usePeopleToMoveWith();
  const places = usePlacesNearby();
  const sportsNearby = useSportsNearby();
  const sports = useSports();
  const search = useDiscoverSearch(settled.mode === 'results' ? settled.args : null);
  const make = useMakeItHappen();
  const surpriseMe = useSurpriseMe();

  // Refresh when the tab comes back into view (not on the first focus: the queries just loaded).
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      track('screen_viewed', { screen: 'discover' });
      if (focused.current) void qc.invalidateQueries({ queryKey: discoverKeys.all });
      focused.current = true;
    }, [qc]),
  );

  const sportName = (id: string) => sports.data?.find((s) => s.id === id)?.name ?? id;
  const radiusKm = density.data?.radius_km ?? null;
  const showAreaPrompt = needsArea(density.data?.has_area) || noArea;

  const nowItems = ojoroNow.data ?? [];
  const strips = nowItems.map(nowStrip);
  const pick = pickDemand(demand.data ?? [], nowItems);
  const asOf = updatedAt(Math.max(ojoroNow.dataUpdatedAt, demand.dataUpdatedAt, places.dataUpdatedAt));

  const setFilter = (patch: Partial<Filters>, what: string, value: string | null) => {
    track('discover_filter_changed', { filter: what, value });
    setFilters((f) => ({ ...f, ...patch }));
  };

  const onMakeItHappen = (bucket: Pick<DemandBucket, 'sport_id' | 'suggested_start' | 'window_end'>, source: string) => {
    track('make_it_happen_tapped', { sport_id: bucket.sport_id, source, online: onlineManager.isOnline() });
    setDemandError(null);
    const started = make.tap(bucket, {
      onSuccess: (state) => {
        if (state.plan_id) router.push(routes.plan(state.plan_id));
      },
      onError: (e) => {
        const err = ojoroErrorOf(e);
        track('make_it_happen_failed', { sport_id: bucket.sport_id, code: err.code });
        if (err.code === 'area_required') setNoArea(true);
        if (err.code === 'demand_unavailable') void qc.invalidateQueries({ queryKey: discoverKeys.demand });
        setDemandError(
          err.code === 'demand_unavailable'
            ? "Not enough people are down for that any more. Nothing was created. Say what you're down for instead."
            : errorMessage(err),
        );
      },
    });
    if (started && !onlineManager.isOnline()) {
      toast.show({ kind: 'offline', message: "Offline. MAKE IT HAPPEN goes through when you're back." });
    }
  };

  const onSurpriseMe = () => {
    track('surprise_me_tapped', { source: 'discover' });
    if (!onlineManager.isOnline()) {
      toast.show({ kind: 'offline', message: 'SURPRISE ME needs a connection. Try again when you are back.' });
      return;
    }
    if (surpriseMe.isPending) return;
    surpriseMe.mutate(undefined, {
      onSuccess: (row) => setSurprise({ row }),
      onError: (e) => toast.show({ kind: 'error', message: errorMessage(ojoroErrorOf(e)) }),
    });
  };

  const openStrip = (event: 'ojoro_now_item_opened' | 'discover_result_opened', s: NowStrip) => {
    trackOpen(event, s);
    router.push(routeHref(s.route));
  };

  const demandProps = pick
    ? {
        ...demandCopy(pick, radiusKm, now),
        count: pick.bucket.people_count,
        pending: make.isPending,
        onPress: () => onMakeItHappen(pick.bucket, 'latent_demand'),
      }
    : null;

  /* ---------- Results ---------- */
  const results = search.data ?? [];
  const grouped = groupResults(results, filters.kind);
  const resultStrips = grouped.plans.map((r) => resultStrip(r, now));
  const searching = settled.mode === 'results';
  const whenLabel = WHEN_FILTERS.find((w) => w.id === filters.when)?.label ?? null;

  const sportChips = (sportsNearby.data ?? []).map((s) => ({ id: s.sport_id, label: s.sport_name }));

  return (
    <Screen situation="calm" scroll>
      <View className="gap-space-4 pb-space-6 pt-space-4">
        <View className="flex-row items-center justify-between gap-space-3">
          <Text variant="display-lg" role="heading" className="shrink">
            DISCOVER
          </Text>
          <Button
            variant="secondary"
            compact
            href={placeRoutes.pulse()}
            onPress={() => track('pulse_opened', { source: 'discover' })}
            accessibilityLabel="Map. Opens Pulse, the map of what's on near you"
            testID="discover-map"
          >
            MAP
          </Button>
        </View>
        <Input
          label="Search"
          icon="search"
          placeholder="Activities, places, people"
          value={filters.query}
          onChangeText={(text) => setFilters((f) => ({ ...f, query: text }))}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          error={typed.mode === 'invalid' ? typed.error : undefined}
          hint={typed.mode === 'results' ? (typed.hint ?? undefined) : undefined}
          testID="discover-search"
        />
        <ChipRow label="Show" testID="kind-chips">
          {KIND_FILTERS.map((k) => (
            <Chip
              key={k.id}
              selected={filters.kind === k.id}
              onPress={() => setFilter({ kind: k.id as KindFilter }, 'kind', k.id)}
              testID={`kind-${k.id}`}
            >
              {k.label}
            </Chip>
          ))}
        </ChipRow>
        {sportChips.length > 0 || WHEN_FILTERS.length > 0 ? (
          <ChipRow label="Sport and time" testID="filter-chips">
            {sportChips.map((s) => (
              <Chip
                key={s.id}
                selected={filters.sportId === s.id}
                onPress={() => setFilter({ sportId: filters.sportId === s.id ? null : s.id }, 'sport', s.id)}
                testID={`sport-${s.id}`}
              >
                {s.label}
              </Chip>
            ))}
            {WHEN_FILTERS.map((w) => (
              <Chip
                key={w.id}
                selected={filters.when === w.id}
                onPress={() =>
                  setFilter({ when: filters.when === w.id ? null : (w.id as DiscoverWhen) }, 'when', w.id)
                }
                testID={`when-${w.id}`}
              >
                {w.label}
              </Chip>
            ))}
          </ChipRow>
        ) : null}
      </View>

      {searching ? (
        <View className="gap-space-6 pb-space-10" testID="discover-results">
          <View className="flex-row items-center justify-between gap-space-3">
            <Text variant="body-sm" className="shrink" testID="results-summary">
              {search.isPending || search.isPlaceholderData
                ? 'Searching…'
                : resultsSummary(groupedCount(grouped), settled.args, {
                    sport: filters.sportId ? sportName(filters.sportId) : null,
                    when: whenLabel,
                  })}
            </Text>
            <TextButton onPress={() => setFilters(NO_FILTERS)} testID="clear-search">
              CLEAR
            </TextButton>
          </View>
          {!online ? (
            <Text variant="caption" muted testID="results-offline">
              {offlineResultsLine(updatedAt(search.dataUpdatedAt), results.length > 0)}
            </Text>
          ) : null}
          <Results
            grouped={grouped}
            strips={resultStrips}
            loading={search.isPending && online}
            error={search.isError && results.length === 0 ? ojoroErrorOf(search.error) : null}
            onRetry={() => void search.refetch()}
            onOpenPlan={(s) => openStrip('discover_result_opened', s)}
            onOpenPerson={(id) => {
              track('discover_result_opened', { kind: 'person' });
              router.push(profileRoute(id));
            }}
          />
          {!search.isPending && groupedCount(grouped) === 0 && !search.isError ? (
            <View className="gap-space-4" testID="results-empty">
              <Text variant="body">Nothing matches yet. Ojoro can pick something for you, or start it yourself.</Text>
              <View className="flex-row flex-wrap gap-space-2">
                <TextButton onPress={onSurpriseMe} testID="results-surprise">
                  SURPRISE ME
                </TextButton>
                <TextButton onPress={() => setSheet(true)}>SAY YOU'RE DOWN</TextButton>
              </View>
              {surprise ? (
                <SurpriseResult
                  suggestion={surprise.row}
                  now={now}
                  makePending={make.isPending}
                  onOpen={openSuggestion}
                  onMakeItHappen={(s) => makeFromSuggestion(s)}
                  onDownFor={() => setSheet(true)}
                />
              ) : null}
            </View>
          ) : null}
        </View>
      ) : showAreaPrompt ? (
        <View className="gap-space-10 pb-space-10">
          <AreaPrompt
            onPick={() => {
              track('area_prompt_tapped', { source: 'discover' });
              router.push(AREA_PICKER);
            }}
          />
          <FeedEnd
            title="THAT'S EVERYTHING."
            message="Pick your area and Discover fills with what's near you. Search works anywhere."
          />
        </View>
      ) : (
        <View className="gap-space-10 pb-space-10" testID="discover-feed">
          <OjoroNow
            summary={ojoroNow.data ? nowSummary(nowItems.length, density.data?.friends_free_now ?? null) : null}
            strips={strips}
            loading={ojoroNow.isPending}
            error={ojoroNow.isError && !ojoroNow.data ? ojoroErrorOf(ojoroNow.error) : null}
            onRetry={() => void ojoroNow.refetch()}
            offlineAt={!online ? asOf : null}
            onOpen={(s) => openStrip('ojoro_now_item_opened', s)}
            demand={demandProps}
            demandError={demandError}
            onSurpriseMe={onSurpriseMe}
            surprisePending={surpriseMe.isPending}
            onDownFor={() => setSheet(true)}
          >
            {surprise ? (
              <SurpriseResult
                suggestion={surprise.row}
                now={now}
                makePending={make.isPending}
                onOpen={openSuggestion}
                onMakeItHappen={(s) => makeFromSuggestion(s)}
                onDownFor={() => setSheet(true)}
              />
            ) : null}
          </OjoroNow>

          <PeopleToMoveWith
            people={(people.data ?? []).slice(0, PEOPLE_SHOWN).map(personCard)}
            loading={people.isPending}
            error={people.isError ? ojoroErrorOf(people.error) : null}
            onOpen={(p) => {
              track('person_card_opened', { source: 'discover' });
              router.push(profileRoute(p.key));
            }}
          />

          <PlacesNearYou
            places={(places.data ?? []).slice(0, PLACES_SHOWN).map((p) => placeCard(p, sportName))}
            loading={places.isPending}
            error={places.isError ? ojoroErrorOf(places.error) : null}
            radiusKm={radiusKm}
          />

          {!ojoroNow.isPending ? (
            <FeedEnd title="THAT'S EVERYTHING." message="That's what's near you right now. Start something and it shows here.">
              {/* TextButton aligns itself to the start; a row centres it. */}
              <View className="flex-row justify-center self-stretch">
                <TextButton onPress={() => setSheet(true)} testID="feed-end-down-for">
                  SAY YOU'RE DOWN
                </TextButton>
              </View>
            </FeedEnd>
          ) : null}
        </View>
      )}

      {!online ? (
        <OfflineBanner
          at={asOf}
          message={asOf ? `Offline. Showing Discover as of ${clockTime(asOf)}.` : "Offline. We'll load Discover when you're back."}
        />
      ) : null}

      <DownForSheet visible={sheet} onClose={() => setSheet(false)} source="discover" defaultRadiusKm={radiusKm ?? undefined} />
    </Screen>
  );

  function openSuggestion(planId: string) {
    track('suggestion_opened', { kind: 'plan', source: 'surprise_me' });
    router.push(routes.plan(planId));
  }

  function makeFromSuggestion(s: SuggestionRow) {
    if (!s.window_end) return;
    track('suggestion_opened', { kind: 'demand', source: 'surprise_me' });
    onMakeItHappen({ sport_id: s.sport_id, suggested_start: s.starts_at, window_end: s.window_end }, 'surprise_me');
  }
}

