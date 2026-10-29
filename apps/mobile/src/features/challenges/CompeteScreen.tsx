/**
 * Compete (design-handoff/screens/Compete.png; PRD §9.14, §9.15): the live page with the newest
 * incoming Call-Out at the top on its own calm ground (REPLY), your events with their stage, your
 * rivalries (the first as the Rivalry poster, OPEN RIVALRY), and the call-outs you sent or already
 * answered. CALL OUT opens the composer. LADDERS & SEASONS has no backend yet (contract, Not built),
 * so it shows its empty state (docs/DESIGN_DECISIONS.md, Step 5 screens: A).
 */
import { type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import {
  Badge,
  Button,
  DisplayText,
  Divider,
  LiveIndicator,
  loadingProps,
  Rivalry,
  Screen,
  Situation,
  Skeleton,
  Strip,
  StripList,
  Text,
} from '@/design-system';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { useOnline } from '../activities/data';
import { InlineError, OfflineNote } from '../profile/states';
import {
  useCompeteRealtime,
  useMyCallOuts,
  useMyChallengeEvents,
  useMyRivalries,
} from './data';
import {
  callOutStrips,
  eventStrip,
  incomingCard,
  orderRivalries,
  rivalryModel,
  rivalryStrip,
  type IncomingCard,
  type RivalryRowFacts,
  type StripModel,
} from './logic';

/** Ages ("2H AGO") and day badges move without a fetch. */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function CompeteScreen() {
  const auth = useAuth();
  const userId = auth.status === 'signed-in' ? auth.session.user.id : null;
  const online = useOnline();
  const now = useMinuteClock();
  useCompeteRealtime(userId);
  const callOuts = useMyCallOuts();
  const events = useMyChallengeEvents();
  const rivalries = useMyRivalries();

  const card = callOuts.data ? incomingCard(callOuts.data, now) : null;
  const listedEvents = new Set((events.data ?? []).map((e) => e.event_id));
  const others = callOuts.data ? callOutStrips(callOuts.data, card?.id ?? null, now, listedEvents) : [];
  const lastUpdated = Math.max(callOuts.dataUpdatedAt, events.dataUpdatedAt, rivalries.dataUpdatedAt);

  return (
    <Screen situation="live" scroll gutter={false}>
      <View className="gap-space-10 pb-space-10 pt-space-6" testID="compete-screen">
        <View className="gap-space-3 px-space-5" role="region" aria-label="Compete">
          <Text variant="overline">CALL-OUTS · EVENTS · RIVALRIES</Text>
          <DisplayText size="xl" accessibilityRole="header">
            COMPETE.
          </DisplayText>
          <View className="flex-row flex-wrap items-center gap-space-3 pt-space-2">
            <Button variant="secondary" href={'/challenge/new' as Href} disabled={!online} testID="compete-call-out">
              CALL OUT
            </Button>
            <Text variant="body-sm" muted className="shrink">
              Someone you&apos;ve played with, or a crew.
            </Text>
          </View>
          {!online ? (
            <OfflineNote dataUpdatedAt={lastUpdated} what="Compete" extra="Replies and new Call-Outs need a connection." />
          ) : null}
        </View>

        {callOuts.isPending ? (
          <View className="px-space-5" {...loadingProps('Loading your call-outs')}>
            <Skeleton kind="object" />
          </View>
        ) : callOuts.isError && !callOuts.data ? (
          <View className="px-space-5">
            <InlineError
              message={errorMessage(ojoroErrorOf(callOuts.error))}
              action="RETRY"
              onAction={() => void callOuts.refetch()}
              testID="compete-call-outs-error"
            />
          </View>
        ) : card ? (
          <IncomingBlock card={card} />
        ) : null}

        <View className="gap-space-2 px-space-5" role="region" aria-label="Your events">
          <Divider label="YOUR EVENTS" />
          {events.isPending ? (
            <View {...loadingProps('Loading your events')} className="gap-space-2">
              <Skeleton kind="strip" />
              <Skeleton kind="strip" />
            </View>
          ) : events.isError && !events.data ? (
            <InlineError
              message={errorMessage(ojoroErrorOf(events.error))}
              action="RETRY"
              onAction={() => void events.refetch()}
              testID="compete-events-error"
            />
          ) : events.data && events.data.length > 0 ? (
            <StripList testID="compete-events">
              {events.data.map((e) => (
                <ModelStrip key={e.event_id} model={eventStrip(e, now)} testID={`compete-event-${e.event_id}`} />
              ))}
            </StripList>
          ) : (
            <Text variant="body-sm" muted testID="compete-events-empty">
              No events yet. An accepted Call-Out becomes an event here, with its countdown.
            </Text>
          )}
        </View>

        <View className="gap-space-4" role="region" aria-label="Rivalries">
          <View className="px-space-5">
            <Divider kind="mark" label="RIVALRIES" />
          </View>
          {rivalries.isPending ? (
            <View className="px-space-5" {...loadingProps('Loading your rivalries')}>
              <Skeleton kind="object" />
            </View>
          ) : rivalries.isError && !rivalries.data ? (
            <View className="px-space-5">
              <InlineError
                message={errorMessage(ojoroErrorOf(rivalries.error))}
                action="RETRY"
                onAction={() => void rivalries.refetch()}
                testID="compete-rivalries-error"
              />
            </View>
          ) : rivalries.data && rivalries.data[0] ? (
            <RivalryBlock rows={orderRivalries(rivalries.data)} />
          ) : (
            <Text variant="body-sm" muted className="px-space-5" testID="compete-rivalries-empty">
              No rivalries yet. Your first result against someone starts one.
            </Text>
          )}
        </View>

        <View className="gap-space-2 px-space-5" role="region" aria-label="Ladders and seasons">
          <Divider label="LADDERS & SEASONS" />
          <Text variant="body-sm" muted testID="compete-ladders-empty">
            No ladders or seasons yet. Call-Outs and rivalries are where it starts.
          </Text>
        </View>

        {others.length > 0 ? (
          <View className="gap-space-2 px-space-5" role="region" aria-label="Call-outs">
            <Divider label="CALL-OUTS" />
            <StripList testID="compete-call-outs">
              {others.map((m) => (
                <ModelStrip key={m.id} model={m} testID={`compete-call-out-${m.id}`} />
              ))}
            </StripList>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

/** INCOMING CALL-OUT: calm ground inside the live page (the design's `data-theme="calm"`). */
function IncomingBlock({ card }: { card: IncomingCard }) {
  const href = `/challenge/${card.id}` as Href;
  return (
    <Situation id="calm" testID="compete-incoming">
      <View className="gap-space-3 px-space-5 py-space-6" role="region" aria-label="Incoming call-out">
        <Text variant="overline">{card.overline}</Text>
        <DisplayText size="md">{card.headline}</DisplayText>
        <Text variant="body">{card.line}</Text>
        <View className="flex-row flex-wrap items-center gap-space-2">
          <Button variant="primary" href={href} accessibilityLabel={card.accessibilityLabel} testID="compete-reply">
            REPLY
          </Button>
          <Text variant="body-sm" muted>
            Accept, counter or pass
          </Text>
        </View>
      </View>
    </Situation>
  );
}

function RivalryBlock({ rows }: { rows: RivalryRowFacts[] }) {
  const m = rivalryModel(rows[0] as RivalryRowFacts);
  const rest = rows.slice(1);
  return (
    <View className="gap-space-4">
      <Rivalry a={m.a} b={m.b} record={m.record} history={m.history} next={m.next} testID="compete-rivalry" />
      <View className="self-start px-space-5">
        <Button variant="secondary" href={`/rivalry/${m.id}` as Href} testID="compete-open-rivalry">
          OPEN RIVALRY
        </Button>
      </View>
      {rest.length > 0 ? (
        <StripList className="px-space-5">
          {rest.map((r) => (
            <ModelStrip key={r.rivalry_id} model={rivalryStrip(r)} testID={`compete-rivalry-${r.rivalry_id}`} />
          ))}
        </StripList>
      ) : null}
    </View>
  );
}

function ModelStrip({ model, testID }: { model: StripModel; testID?: string }) {
  return (
    <Strip
      leading={model.leading}
      leadingLabel={model.leadingLabel}
      title={model.title}
      meta={model.meta}
      trailing={
        model.trailing.kind === 'live' ? (
          <LiveIndicator />
        ) : (
          <Badge tone={model.trailing.tone}>{model.trailing.word}</Badge>
        )
      }
      href={model.href as Href}
      testID={testID}
    />
  );
}
