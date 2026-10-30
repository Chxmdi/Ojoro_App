/**
 * Discover's blocks: Ojoro Now (forming band) with latent demand and Surprise Me, people to move
 * with, places near you, the search results, and the no-area prompt.
 */
import type { Href } from 'expo-router';
import { View } from 'react-native';

import {
  ActivityStrip,
  Band,
  Button,
  Divider,
  LatentDemand,
  loadingProps,
  Panel,
  PlaceMiniCard,
  Skeleton,
  Strip,
  Text,
  UserMiniCard,
} from '@/design-system';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import type { OjoroError } from '@ojoro/contracts';

import { placeRoutes } from '../places/routes';
import { AsOf, ErrorState, InlineError, routes } from '../plans/parts';
import {
  personResultLine,
  placeResultCard,
  suggestionCopy,
  type Grouped,
  type NowStrip,
  type PersonCard,
  type PlaceCard,
  type Route,
  type SuggestionRow,
} from './logic';

/** The area picker (built with FirstHome and the onboarding area step). */
export const AREA_PICKER = '/settings/area' as Href;

export const profileRoute = (id: string) => `/profile/${id}` as Href;

export function routeHref(r: Route): Href {
  return r.to === 'activity' ? routes.activity(r.id) : routes.plan(r.id);
}

/* ---------- Ojoro Now ---------- */

export type OjoroNowProps = {
  summary: string | null;
  strips: readonly NowStrip[];
  loading: boolean;
  error: OjoroError | null;
  onRetry: () => void;
  offlineAt: Date | null;
  onOpen: (s: NowStrip) => void;
  demand: {
    overline: string;
    headline: string;
    count: number;
    pending: boolean;
    onPress: () => void;
  } | null;
  demandError: string | null;
  onSurpriseMe: () => void;
  surprisePending: boolean;
  onDownFor: () => void;
  children?: React.ReactNode;
};

export function OjoroNow(p: OjoroNowProps) {
  return (
    <Band situation="forming" accessibilityLabel="Ojoro Now" testID="ojoro-now">
      <Text variant="overline">OJORO NOW · WITHIN THE HOUR</Text>
      <Text variant="display-xl" role="heading">
        RIGHT NOW.
      </Text>
      {p.loading ? (
        <View {...loadingProps('Loading what starts soon')} className="gap-space-2">
          <Skeleton kind="text" lines={1} />
          <Skeleton kind="strip" />
          <Skeleton kind="strip" />
          <Skeleton kind="strip" />
        </View>
      ) : p.error ? (
        <View className="-mx-space-5">
          <ErrorState error={p.error} onRetry={p.onRetry} />
        </View>
      ) : (
        <>
          {p.summary ? (
            <Text variant="body" testID="ojoro-now-summary">
              {p.summary}
            </Text>
          ) : null}
          {p.offlineAt ? <AsOf at={p.offlineAt} what="Showing what was on" /> : null}
          {p.strips.length > 0 ? (
            <View role="list" aria-label="Starting soon" testID="ojoro-now-list">
              {p.strips.map((s) => (
                <ActivityStrip
                  key={s.key}
                  activity={s.activity}
                  time={s.time}
                  place={s.place}
                  status={s.status}
                  count={s.count}
                  capacity={s.capacity}
                  onPress={() => p.onOpen(s)}
                />
              ))}
            </View>
          ) : null}
        </>
      )}
      {p.demand ? (
        <LatentDemand
          count={p.demand.count}
          overline={p.demand.overline}
          headline={p.demand.headline}
          pending={p.demand.pending}
          onPress={p.demand.onPress}
          onSurpriseMe={p.onSurpriseMe}
          testID="latent-demand"
        />
      ) : !p.loading ? (
        <Panel
          overline="NOTHING WAITING ON YOU"
          title="Let Ojoro pick something, or say what you're down for."
          accessibilityLabel="Something to do"
          testID="ojoro-now-empty"
          actions={
            <>
              <Button variant="primary" loading={p.surprisePending} onPress={p.onSurpriseMe}>
                SURPRISE ME
              </Button>
              <Button variant="secondary" onPress={p.onDownFor}>
                SAY YOU'RE DOWN
              </Button>
            </>
          }
        />
      ) : null}
      {p.demandError ? <InlineError message={p.demandError} testID="demand-error" /> : null}
      {p.children}
    </Band>
  );
}

/* ---------- Surprise Me ---------- */

export function SurpriseResult({
  suggestion,
  now,
  onOpen,
  onMakeItHappen,
  onDownFor,
  makePending,
}: {
  suggestion: SuggestionRow | null;
  now: Date;
  onOpen: (planId: string) => void;
  onMakeItHappen: (s: SuggestionRow) => void;
  onDownFor: () => void;
  makePending: boolean;
}) {
  if (!suggestion) {
    return (
      <Panel
        overline="SURPRISE ME"
        title="Nothing fits right now."
        body="Say what you're down for and Ojoro gathers people around it."
        accessibilityLabel="Surprise me"
        testID="surprise-none"
        actions={
          <Button variant="primary" onPress={onDownFor}>
            SAY YOU'RE DOWN
          </Button>
        }
      />
    );
  }
  const copy = suggestionCopy(suggestion, now);
  const planId = suggestion.plan_id;
  return (
    <Panel
      overline="SURPRISE ME"
      title={copy.title}
      body={copy.body}
      note={copy.why ?? undefined}
      accessibilityLabel="Surprise me"
      testID="surprise-result"
      actions={
        copy.action === 'open' && planId ? (
          <Button variant="primary" onPress={() => onOpen(planId)}>
            SEE THE PLAN
          </Button>
        ) : (
          <Button variant="primary" loading={makePending} onPress={() => onMakeItHappen(suggestion)}>
            MAKE IT HAPPEN
          </Button>
        )
      }
    />
  );
}

/* ---------- People and places ---------- */

export function PeopleToMoveWith({
  people,
  loading,
  error,
  onOpen,
}: {
  people: readonly PersonCard[];
  loading: boolean;
  error: OjoroError | null;
  onOpen: (p: PersonCard) => void;
}) {
  return (
    <View className="gap-space-4" role="region" aria-label="People to move with" testID="people-to-move-with">
      <Divider label="PEOPLE TO MOVE WITH" />
      {loading ? (
        <View {...loadingProps('Loading people to move with')}>
          <Skeleton kind="object" />
        </View>
      ) : error && people.length === 0 ? (
        <InlineError message={errorMessage(error)} />
      ) : people.length === 0 ? (
        <Text variant="body-sm" muted>
          Play a game and the people you play with show here. People nearby show once they turn Pull Me In on.
        </Text>
      ) : (
        people.map((p) => (
          <View key={p.key} className="gap-space-3">
            {p.reason ? (
              <Text variant="body-sm" muted>
                {p.reason}
              </Text>
            ) : null}
            <UserMiniCard
              name={p.name}
              handle={p.handle}
              area={p.area}
              sports={p.sports}
              stats={p.stats}
              onPress={() => onOpen(p)}
              testID={`person-${p.handle}`}
            />
          </View>
        ))
      )}
    </View>
  );
}

export function PlacesNearYou({
  places,
  loading,
  error,
  radiusKm,
}: {
  places: readonly PlaceCard[];
  loading: boolean;
  error: OjoroError | null;
  radiusKm: number | null;
}) {
  return (
    <View role="region" aria-label="Places near you" testID="places-near-you">
      <View className="pb-space-2">
        <Divider label="PLACES NEAR YOU" />
      </View>
      {loading ? (
        <View {...loadingProps('Loading places')}>
          <Skeleton kind="strip" />
          <Skeleton kind="strip" />
        </View>
      ) : error && places.length === 0 ? (
        <InlineError message={errorMessage(error)} />
      ) : places.length === 0 ? (
        <Text variant="body-sm" muted>
          {radiusKm ? `No places within ${radiusKm} km yet.` : 'No places near you yet.'}
        </Text>
      ) : (
        places.map((p, i) => (
          <PlaceMiniCard
            key={p.key}
            name={p.name}
            kind={p.kind}
            surface={p.surface}
            distance={p.distance}
            lights={p.lights}
            plansTonight={p.plansTonight}
            href={placeRoutes.place(p.key)}
            onPress={() => track('place_opened', { place_id: p.key, source: 'discover_nearby' })}
            rule={i < places.length - 1}
            testID={`place-${p.key}`}
          />
        ))
      )}
    </View>
  );
}

/* ---------- Area prompt ---------- */

export function AreaPrompt({ onPick }: { onPick: () => void }) {
  return (
    <Panel
      overline="PICK YOUR AREA"
      title="Choose your neighbourhood to see what's near you."
      body="Ojoro uses an area, never your address or your location. You can change it any time."
      accessibilityLabel="Pick your area"
      testID="area-prompt"
      actions={
        <Button variant="primary" onPress={onPick}>
          PICK YOUR AREA
        </Button>
      }
    />
  );
}

/* ---------- Results ---------- */

export function Results({
  grouped,
  strips,
  loading,
  error,
  onRetry,
  onOpenPlan,
  onOpenPerson,
}: {
  grouped: Grouped;
  strips: readonly NowStrip[];
  loading: boolean;
  error: OjoroError | null;
  onRetry: () => void;
  onOpenPlan: (s: NowStrip) => void;
  onOpenPerson: (id: string) => void;
}) {
  if (loading) {
    return (
      <View {...loadingProps('Searching')} className="gap-space-2">
        <Skeleton kind="strip" />
        <Skeleton kind="strip" />
        <Skeleton kind="strip" />
      </View>
    );
  }
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  return (
    <View className="gap-space-8" testID="search-results">
      {strips.length > 0 ? (
        <View role="region" aria-label="Activities">
          <Divider label="ACTIVITIES" />
          {strips.map((s) => (
            <ActivityStrip
              key={s.key}
              activity={s.activity}
              time={s.time}
              place={s.place}
              status={s.status}
              count={s.count}
              capacity={s.capacity}
              onPress={() => onOpenPlan(s)}
            />
          ))}
        </View>
      ) : null}
      {grouped.places.length > 0 ? (
        <View role="region" aria-label="Places">
          <View className="pb-space-2">
            <Divider label="PLACES" />
          </View>
          {grouped.places.map((row, i) => {
            const p = placeResultCard(row);
            return (
              <PlaceMiniCard
                key={p.key}
                name={p.name}
                kind={p.kind}
                distance={p.distance}
                plansTonight={p.plansTonight}
                href={placeRoutes.place(p.key)}
                onPress={() => track('place_opened', { place_id: p.key, source: 'discover_search' })}
                rule={i < grouped.places.length - 1}
                testID={`result-place-${p.key}`}
              />
            );
          })}
        </View>
      ) : null}
      {grouped.people.length > 0 ? (
        <View role="region" aria-label="People">
          <Divider label="PEOPLE" />
          {grouped.people.map((row) => (
            <Strip
              key={row.id}
              title={row.title ?? 'Someone'}
              meta={personResultLine(row) || undefined}
              trailing="chevron"
              accessibilityHint="Opens their profile"
              onPress={() => onOpenPerson(row.id)}
              testID={`result-person-${row.id}`}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Helper for analytics of a strip open. */
export function trackOpen(event: 'ojoro_now_item_opened' | 'discover_result_opened', s: NowStrip, extra: Record<string, string | number> = {}) {
  track(event, { kind: s.route.to, id: s.route.id, action: s.action, status: s.status, ...extra });
}
