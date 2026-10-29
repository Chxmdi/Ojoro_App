/**
 * CallOut (design-handoff/screens/CallOut.png, live situation; PRD §9.14, §10.2): back · RECEIVED
 * 2H AGO · report or block; the CallOutPoster; the challenger's line; THE RULES (format, course,
 * start, verification, audience, STAKES: None); ACCEPT (commit, 56pt) over COUNTER and PASS.
 *
 * ACCEPT creates the Challenge Event on the server in one transaction, exactly once (one key per
 * intention, reused on retry; a second tap while it runs does nothing), gives the heavy haptic and
 * goes to `/event/[id]`. The challenger sees their own call-out with TAKE IT BACK; an answered one
 * says what happened and links on (the event, the counter).
 */
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import {
  Button,
  CallOutPoster,
  Divider,
  Modal,
  Quote,
  Screen,
  Text,
} from '@/design-system';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';
import { useReportBlock } from '@/features/safety';

import { useOnline } from '../activities/data';
import { LoadingState, MoreButton, ScreenHeader } from '../activities/ui';
import { InlineError, OfflineNote, PrivacyNote } from '../profile/states';
import { CounterSheet } from './CounterSheet';
import {
  useAcceptCallOut,
  useCallOut,
  useCallOutRealtime,
  useDeclineCallOut,
  useWithdrawCallOut,
} from './data';
import {
  attribution,
  closedWords,
  headerOverline,
  opponentLabel,
  posterStatus,
  posterWhen,
  replyFor,
  ruleRows,
  shortName,
  type CallOutFacts,
} from './logic';
import { RuleRow } from './ui';

const COMPETE = '/compete' as Href;

export function CallOutScreen({ id }: { id: string }) {
  const online = useOnline();
  useCallOutRealtime(id);
  const q = useCallOut(id);
  const view = q.data ?? null;
  const reportBlock = useReportBlock({ onBlocked: () => router.replace(COMPETE) });

  useEffect(() => {
    track('screen_viewed', { screen: 'call_out', call_out_id: id });
  }, [id]);

  const other = view ? otherSide(view) : null;

  return (
    <Screen situation="live" scroll gutter={false}>
      <ScreenHeader
        overline={view ? headerOverline(view, Date.now()) : 'CALL-OUT'}
        fallback={COMPETE}
        right={
          view && other ? (
            <MoreButton
              label="Report or block"
              onPress={() =>
                reportBlock.open({
                  subjectKind: 'call_out',
                  subjectId: view.id,
                  personName: other.name,
                  ...(other.id ? { personId: other.id } : null),
                })
              }
            />
          ) : undefined
        }
      />
      {q.isPending && !view ? (
        <LoadingState label="Loading the Call-Out" kinds={['object', 'text', 'strip', 'strip']} />
      ) : !view ? (
        <Unavailable error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <CallOutBody view={view} online={online} dataUpdatedAt={q.dataUpdatedAt} />
      )}
      {reportBlock.sheet}
    </Screen>
  );
}

/** The person on the other side, for report and block. */
function otherSide(v: CallOutFacts): { id: string | null; name: string } {
  if (v.is_mine) return { id: v.opponent_id, name: opponentLabel(v) };
  return { id: v.challenger_id, name: v.challenger_name || 'this person' };
}

function CallOutBody({ view, online, dataUpdatedAt }: { view: CallOutFacts; online: boolean; dataUpdatedAt: number }) {
  const crew = view.format === 'crew_vs_crew';
  const reply = replyFor(view);
  const accept = useAcceptCallOut(view.id);
  const decline = useDeclineCallOut(view.id);
  const withdraw = useWithdrawCallOut(view.id);
  const [sheet, setSheet] = useState<'counter' | 'pass' | 'withdraw' | null>(null);
  const now = Date.now();
  const challenger = shortName(view.challenger_name, crew);
  const failure = accept.error ?? decline.error ?? withdraw.error;

  const onAccept = () =>
    accept.accept({
      onSuccess: (eventId) => {
        if (eventId) router.replace(`/event/${eventId}` as Href);
      },
    });

  return (
    <View testID="call-out-screen">
      <CallOutPoster
        challenger={{ name: challenger }}
        opponent={{ name: shortName(opponentLabel(view), crew) }}
        discipline={view.title}
        when={posterWhen(view.starts_at, view.time_zone ?? undefined)}
        status={posterStatus(view.status)}
        testID="call-out-poster"
      />

      <View className="gap-space-8 px-space-5 pb-space-8 pt-space-2">
        {view.message ? (
          <Quote variant="callout" attribution={attribution(view)} testID="call-out-line">
            {view.message}
          </Quote>
        ) : (
          <Text variant="caption" muted testID="call-out-line">
            {attribution(view)}
          </Text>
        )}

        <View role="region" aria-label="The rules">
          <Divider label="THE RULES" />
          {ruleRows(view).map((r) => (
            <RuleRow key={r.label} label={r.label} value={r.value} />
          ))}
        </View>

        {view.audience !== 'public' ? (
          <PrivacyNote>
            {view.audience === 'participants'
              ? 'Only the people competing see this Call-Out and its event. No crowd, no poster.'
              : "Only people who've played with you two see the event. It never shows outside Ojoro."}
          </PrivacyNote>
        ) : null}

        {!online ? (
          <OfflineNote dataUpdatedAt={dataUpdatedAt} what="this Call-Out" extra="Answering needs a connection." />
        ) : null}

        <View className="gap-space-2" role="region" aria-label="Reply" testID={`call-out-reply-${reply}`}>
          {reply === 'answer' || reply === 'answer_open' ? (
            <>
              <Button
                variant="commit"
                block
                loading={accept.isPending}
                disabled={!online || decline.isPending}
                onPress={onAccept}
                testID="call-out-accept"
              >
                ACCEPT
              </Button>
              {reply === 'answer' ? (
                <View className="flex-row gap-space-2">
                  <View className="flex-1">
                    <Button
                      variant="secondary"
                      block
                      disabled={!online || accept.isPending}
                      onPress={() => setSheet('counter')}
                      testID="call-out-counter"
                    >
                      COUNTER
                    </Button>
                  </View>
                  <View className="flex-1">
                    <Button
                      variant="secondary"
                      block
                      loading={decline.isPending}
                      disabled={!online || accept.isPending}
                      onPress={() => setSheet('pass')}
                      testID="call-out-pass"
                    >
                      PASS
                    </Button>
                  </View>
                </View>
              ) : null}
              <Text variant="caption" muted className="text-center">
                {reply === 'answer'
                  ? 'Accepting creates the Challenge Event straight away. Counter to change the time, distance or course.'
                  : 'Accepting creates the Challenge Event straight away. The first to accept takes it.'}
              </Text>
            </>
          ) : (
            <>
              <Text variant="body" testID="call-out-status">
                {closedWords(view, now)}
              </Text>
              {reply === 'event' && view.event_id ? (
                <Button block href={`/event/${view.event_id}` as Href} testID="call-out-open-event">
                  OPEN THE EVENT
                </Button>
              ) : null}
              {reply === 'countered' && view.counter_id ? (
                <View className="self-start">
                  <Button variant="secondary" href={`/challenge/${view.counter_id}` as Href} testID="call-out-open-counter">
                    SEE THE COUNTER
                  </Button>
                </View>
              ) : null}
              {reply === 'waiting' ? (
                <View className="self-start">
                  <Button
                    variant="secondary"
                    loading={withdraw.isPending}
                    disabled={!online}
                    onPress={() => setSheet('withdraw')}
                    testID="call-out-withdraw"
                  >
                    TAKE IT BACK
                  </Button>
                </View>
              ) : null}
              {reply === 'closed' ? (
                <View className="self-start">
                  <Button variant="secondary" onPress={() => router.replace(COMPETE)} testID="call-out-back">
                    BACK TO COMPETE
                  </Button>
                </View>
              ) : null}
            </>
          )}
          {failure ? <InlineError message={errorMessage(ojoroErrorOf(failure))} testID="call-out-error" /> : null}
        </View>
      </View>

      <CounterSheet
        visible={sheet === 'counter'}
        onClose={() => setSheet(null)}
        callOut={view}
        online={online}
        onCountered={(counterId) => {
          setSheet(null);
          if (counterId) router.replace(`/challenge/${counterId}` as Href);
        }}
      />
      <Modal
        visible={sheet === 'pass'}
        title="PASS?"
        body={`No event this time. ${challenger} sees that you passed; nobody else is told.`}
        confirm="PASS"
        cancel="KEEP IT OPEN"
        onCancel={() => setSheet(null)}
        onConfirm={() => {
          setSheet(null);
          decline.mutate();
        }}
      />
      <Modal
        visible={sheet === 'withdraw'}
        title="TAKE IT BACK?"
        body={`The Call-Out ends now. ${shortName(opponentLabel(view), crew)} can't accept it any more.`}
        confirm="TAKE IT BACK"
        cancel="KEEP IT OPEN"
        onCancel={() => setSheet(null)}
        onConfirm={() => {
          setSheet(null);
          withdraw.mutate();
        }}
      />
    </View>
  );
}

function Unavailable({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const e = ojoroErrorOf(error);
  const gone = !error || e.code === 'call_out_not_found';
  return (
    <View className="gap-space-4 px-space-5 pt-space-8" testID="call-out-unavailable">
      {gone ? (
        <>
          <Text variant="title">We can&apos;t find that Call-Out.</Text>
          <Text variant="body-sm" muted>
            It may have been taken back, or it isn&apos;t open to you.
          </Text>
          <View className="self-start">
            <Button variant="secondary" onPress={() => router.replace(COMPETE)}>
              BACK TO COMPETE
            </Button>
          </View>
        </>
      ) : (
        <InlineError message={errorMessage(e)} action="RETRY" onAction={onRetry} testID="screen-error" />
      )}
    </View>
  );
}
