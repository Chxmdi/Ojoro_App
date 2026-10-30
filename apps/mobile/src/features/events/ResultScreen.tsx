/**
 * Result (design-handoff/screens/Result.png, after situation): COMPLETE · 9:41 AM · share; the
 * RecapPoster (CHIMDI WINS., the numbers, the story, RUN IT BACK · SHARE RECAP); PREDICTIONS (the
 * crowd's call and yours); the rivalry record, updated, linking to Rivalry; then You.
 *
 * Only a verified result reaches this screen (the server names the winner once both captains
 * confirmed, or an organizer review settled it). It is never edited: RUN IT BACK sends a new Call-Out
 * linked to this event and the rivalry. The result verified haptic plays once, when the result
 * arrives while you're watching.
 */
import { goalGapSentence, isRetryable } from '@ojoro/contracts';
import { router, type Href } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, Share, View } from 'react-native';

import { Badge, DisplayText, haptics, Modal, RecapPoster, Screen, Text, useToast } from '@/design-system';
import { useChallengePassportForMe } from '@/features/passport/data';
import { passportHrefFor } from '@/features/passport/logic';
import { useReportBlock } from '@/features/safety';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { newIdempotencyKey } from '@/lib/idempotency';
import { ojoroErrorOf } from '@/lib/rpc';

import { useOnline } from '../activities/data';
import { clockWithPeriod, dateLabel } from '../activities/format';
import { InlineError, OfflineNote } from '../activities/ui';
import { useEvent, type EventView } from './data';
import { eventReportTarget, StageFallback, StageHeader, stageFacts } from './EventLiveScreen';
import { useRunItBack } from './liveData';
import {
  predictionOutcome,
  recapShareText,
  resultLine,
  resultStats,
  resultStory,
  rivalryRow,
  showValue,
  sideName,
  verifiedBy,
} from './liveLogic';

/** Results already celebrated on this device this session (the haptic plays once). */
const celebrated = new Set<string>();
/** A result this fresh arrived while the viewer was here, or just before they opened it. */
const FRESH_RESULT_MS = 2 * 60_000;

export function ResultScreen({ eventId }: { eventId: string }) {
  const event = useEvent(eventId);
  const data = event.data ?? null;
  if (!data) return <StageFallback query={event} situation="after" label="Loading the result" />;
  return <ResultBody eventId={eventId} row={data.row} dataUpdatedAt={event.dataUpdatedAt} />;
}

function ResultBody({ eventId, row, dataUpdatedAt }: { eventId: string; row: EventView; dataUpdatedAt: number }) {
  const f = stageFacts(row);
  const online = useOnline();
  const toast = useToast();
  const reportBlock = useReportBlock();
  const runItBack = useRunItBack(eventId);
  const [asking, setAsking] = useState(false);
  const key = useRef<string | null>(null);
  const tz = row.time_zone ?? undefined;
  const verifiedAt = row.verified_at ?? row.completed_at;
  const draw = !!row.is_draw || !row.winner_side;
  const winner = row.winner_side ? sideName(f, row.winner_side) : sideName(f, 'a');
  const crowd = predictionOutcome(f);
  const rivalry = rivalryRow(f);
  const captain = !!row.is_captain;
  const myValue = row.my_side ? showValue(row.my_side === 'a' ? row.result_a : row.result_b, f.scoring) : null;
  // Your stamp for this result (Step 7): PB, added to your Passport, how far from your goal.
  const stamp = useChallengePassportForMe(eventId, !!row.is_competitor).data ?? null;
  const gap = stamp ? goalGapSentence(stamp) : null;
  const passportLine = stamp
    ? ['Added to your Passport', gap ? gap.charAt(0).toLowerCase() + gap.slice(1).replace(/\.$/, '') : null]
        .filter(Boolean)
        .join(' · ')
    : 'Your record and Passport';
  const opponent = row.my_side === 'a' ? sideName(f, 'b') : row.my_side === 'b' ? sideName(f, 'a') : 'them';

  useEffect(() => {
    track('recap_viewed', { event_id: eventId, kind: 'challenge' });
    if (!verifiedAt || celebrated.has(eventId)) return;
    celebrated.add(eventId);
    if (Date.parse(row.server_now) - Date.parse(verifiedAt) < FRESH_RESULT_MS) void haptics.resultVerified();
  }, [eventId]); // eslint-disable-line react-hooks/exhaustive-deps -- once per result.

  const share = async () => {
    if (row.audience !== 'public' && !row.is_competitor) {
      toast.show({ kind: 'error', message: 'This event is private, so its recap stays on Ojoro.' });
      return;
    }
    track('recap_shared', { event_id: eventId, kind: 'challenge' });
    try {
      await Share.share({ message: recapShareText(f) });
    } catch {
      toast.show({ kind: 'error', message: "Sharing isn't available here." });
    }
  };

  const rematch = () => {
    key.current ??= newIdempotencyKey();
    runItBack.mutate(key.current, {
      onSuccess: (s) => {
        key.current = null;
        if (s.accepted && s.event_id) router.push(`/event/${s.event_id}` as Href);
        else if (s.call_out_id) router.push(`/challenge/${s.call_out_id}` as Href);
      },
      onError: (e) => {
        if (!isRetryable(ojoroErrorOf(e))) key.current = null;
      },
    });
  };

  return (
    <Screen situation="after" scroll gutter={false}>
      <StageHeader
        overline={verifiedAt ? `COMPLETE · ${clockWithPeriod(verifiedAt, tz)}` : 'COMPLETE'}
        onShare={() => void share()}
        shareLabel="Share the recap"
        onMore={() => reportBlock.open(eventReportTarget(row))}
      />
      <View className="pb-space-10" testID="event-result">
        <RecapPoster
          winner={winner}
          draw={draw}
          discipline={f.title}
          date={verifiedAt ? dateLabel(verifiedAt, tz) : undefined}
          result={resultLine(f)}
          story={resultStory(f) || undefined}
          stats={resultStats(f)}
          showRunItBack={captain}
          runItBackLoading={runItBack.isPending}
          onRunItBack={() => setAsking(true)}
          onShare={() => void share()}
          testID="result-recap"
        />

        <View className="gap-space-8 px-space-5">
          {!online ? <OfflineNote dataUpdatedAt={dataUpdatedAt} extra="RUN IT BACK waits until you're back." /> : null}
          {runItBack.isError ? (
            <InlineError message={errorMessage(ojoroErrorOf(runItBack.error))} testID="rematch-error" />
          ) : null}

          <Text variant="caption" muted testID="result-verified-by">
            {verifiedBy(row.result_source)}
          </Text>

          <View className="gap-space-2 bg-surface-raised p-space-6" testID="result-predictions" role="region" aria-label="Predictions">
            <Text variant="label" muted>
              PREDICTIONS
            </Text>
            {crowd.headline ? <DisplayText size="sm">{crowd.headline}</DisplayText> : null}
            <Text variant="body">{crowd.line}</Text>
          </View>

          <View>
            <LinkRow
              lead={rivalry.record}
              title={rivalry.title}
              line={rivalry.line}
              badge={<Badge tone="signal">UPDATED</Badge>}
              href={row.rivalry_id ? (`/rivalry/${row.rivalry_id}` as Href) : undefined}
              testID="result-rivalry"
            />
            {row.rematch_event_id ? (
              <LinkRow
                lead="NEXT"
                title="The rematch is on"
                line="A new event, linked to this one."
                badge={<Badge>OPEN</Badge>}
                href={`/event/${row.rematch_event_id}` as Href}
                testID="result-rematch-event"
              />
            ) : row.pending_rematch_call_out_id ? (
              <LinkRow
                lead="RUN IT BACK"
                title="A rematch is waiting"
                line="A Call-Out with the same rules. See who asked and answer."
                badge={<Badge>OPEN</Badge>}
                href={`/challenge/${row.pending_rematch_call_out_id}` as Href}
                testID="result-rematch-callout"
              />
            ) : null}
            {row.is_competitor ? (
              <LinkRow
                lead={stamp?.personal_best ? 'PB' : 'YOU'}
                title={myValue ? `${f.title} · ${myValue}` : f.title}
                line={passportLine}
                badge={<Badge>PASSPORT</Badge>}
                href={(stamp ? passportHrefFor(stamp.passport_entry_id ? { entry: stamp.passport_entry_id } : { event: eventId }) : '/passport') as Href}
                testID="result-you"
              />
            ) : null}
          </View>
        </View>
      </View>

      <Modal
        visible={asking}
        title="RUN IT BACK?"
        body={`Sends ${opponent} a new Call-Out with the same rules, two weeks on at the same time. If ${opponent} already asked, this accepts it. This result stays as it is.`}
        confirm="RUN IT BACK"
        cancel="NOT NOW"
        onCancel={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false);
          rematch();
        }}
      />
      {reportBlock.sheet}
    </Screen>
  );
}

/** A row under the poster: the number, what it is, a badge; the whole row opens the link. */
function LinkRow({
  lead,
  title,
  line,
  badge,
  href,
  testID,
}: {
  lead: string;
  title: string;
  line: string;
  badge: ReactNode;
  href: Href | undefined;
  testID: string;
}) {
  const body = (
    <View className="min-h-touch flex-row items-center gap-space-4 border-b border-line py-space-5">
      <View className="w-[80px]">
        <DisplayText size="xs" style={{ fontVariant: ['tabular-nums'] }}>
          {lead}
        </DisplayText>
      </View>
      <View className="flex-1 gap-space-1">
        <Text variant="title-sm">{title}</Text>
        <Text variant="body-sm" muted>
          {line}
        </Text>
      </View>
      {badge}
    </View>
  );
  if (!href) return <View testID={testID}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${lead}. ${title}. ${line}`}
      onPress={() => router.push(href)}
      testID={testID}
    >
      {body}
    </Pressable>
  );
}
