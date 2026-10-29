/**
 * Rivalry & rematch (design-handoff/screens/Rivalry.png, live then after; PRD §9.15, §10.13): back ·
 * CHIMDI · MARCUS · report; the head-to-head record, form (last 8, oldest first) and the next
 * meeting (Rivalry); RECENT MEETINGS, each linking to its result; then the rematch block on the
 * after ground. A rematch is always a new Call-Out linked to this rivalry; accepting it creates one
 * new Challenge Event. Past results are never touched.
 */
import { router, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import {
  Badge,
  Button,
  Divider,
  DisplayText,
  Graphic,
  Rematch,
  Rivalry,
  Situation,
  Screen,
  Text,
  TextButton,
  useThemeColor,
  useToast,
} from '@/design-system';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';
import { useReportBlock, type ReportBlockTarget } from '@/features/safety';

import { useOnline } from '../activities/data';
import { InlineError, LoadingState, MoreButton, ScreenHeader } from '../activities/ui';
import { OfflineNote, PrivacyNote } from '../profile/states';
import {
  useAcceptRematch,
  useDeclineRematch,
  useRivalry,
  useRivalryMeetings,
  useRivalryRealtime,
  useRunItBack,
} from './data';
import {
  formHistory,
  headerTitle,
  lastTimeLine,
  meetingBadge,
  meetingDate,
  meetingLine,
  meetingTitle,
  nextLine,
  rematchBlock,
  rematchPromise,
  withShownNames,
  type RematchBlock,
  type RivalryMeetingRow,
  type RivalryViewRow,
} from './logic';

/** RECENT MEETINGS shown at first, and added per EARLIER MEETINGS tap. */
const MEETINGS_STEP = 3;

const eventHref = (id: string) => `/event/${id}` as Href;
const callOutHref = (id: string) => `/challenge/${id}` as Href;

export function RivalryScreen({ id }: { id: string }) {
  const online = useOnline();
  useRivalryRealtime(id);
  const rivalry = useRivalry(id);
  const view = useMemo(() => (rivalry.data ? withShownNames(rivalry.data) : null), [rivalry.data]);
  const reportBlock = useReportBlock({ onBlocked: () => router.replace('/compete' as Href) });

  useEffect(() => {
    track('screen_viewed', { screen: 'rivalry', rivalry_id: id });
  }, [id]);

  const target = view ? reportTarget(view) : null;

  return (
    <Screen situation="live" scroll gutter={false}>
      <ScreenHeader
        overline={view ? headerTitle(view) : 'RIVALRY'}
        fallback={'/compete' as Href}
        right={
          target ? (
            <MoreButton label={`Report or block ${target.personName}`} onPress={() => reportBlock.open(target)} />
          ) : undefined
        }
      />
      {rivalry.isPending && !view ? (
        <LoadingState label="Loading the rivalry" kinds={['object', 'strip', 'strip']} />
      ) : !view ? (
        <RivalryUnavailable error={rivalry.error} onRetry={() => void rivalry.refetch()} />
      ) : (
        <RivalryBody id={id} view={view} online={online} dataUpdatedAt={rivalry.dataUpdatedAt} />
      )}
      {reportBlock.sheet}
    </Screen>
  );
}

/**
 * Report and block from the rivalry (report subject `rivalry`). The person to block is the
 * other side when it's two people and you're one of them). Crews and spectators report only.
 */
function reportTarget(view: RivalryViewRow): ReportBlockTarget {
  const person = view.kind === 'people' && view.i_am_in && view.b_id ? view.b_id : undefined;
  return {
    subjectKind: 'rivalry',
    subjectId: view.rivalry_id,
    personName: person ? view.b_name : `${view.a_name} and ${view.b_name}`,
    ...(person ? { personId: person } : null),
  };
}

function RivalryBody({
  id,
  view,
  online,
  dataUpdatedAt,
}: {
  id: string;
  view: RivalryViewRow;
  online: boolean;
  dataUpdatedAt: number;
}) {
  const meetings = useRivalryMeetings(id);
  // The newest three, as designed, so the rematch stays close; the rest a tap away.
  const [shown, setShown] = useState(MEETINGS_STEP);
  const rows = meetings.data ?? [];
  const block = rematchBlock(view);
  const next = nextLine(view);
  const hidden = meetings.data ? Math.max(0, view.meetings - rows.length) : 0;

  return (
    <View testID="rivalry-screen">
      {!online ? (
        <View className="px-space-5 pt-space-3">
          <OfflineNote dataUpdatedAt={dataUpdatedAt} what="the rivalry" extra="Rematch answers go through when you're back." />
        </View>
      ) : null}

      <Rivalry
        a={{ name: view.a_name }}
        b={{ name: view.b_name }}
        record={{ a: view.a_wins, b: view.b_wins, draws: view.draws }}
        history={formHistory(view.form)}
        next={next ?? undefined}
        testID="rivalry-record"
      />

      <View className="gap-space-4 px-space-5 pb-space-8" role="region" aria-label="Recent meetings">
        <Divider label="RECENT MEETINGS" />
        {meetings.isPending ? (
          <LoadingState label="Loading meetings" kinds={['strip', 'strip']} />
        ) : meetings.isError && rows.length === 0 ? (
          <InlineError
            message={errorMessage(ojoroErrorOf(meetings.error))}
            action="RETRY"
            onAction={() => void meetings.refetch()}
            testID="rivalry-meetings-error"
          />
        ) : rows.length === 0 ? (
          <Text variant="body-sm" muted testID="rivalry-meetings-empty">
            {view.meetings === 0
              ? 'No meetings yet. The record starts with the first verified result.'
              : 'No meetings you can see yet.'}
          </Text>
        ) : (
          <View testID="rivalry-meetings">
            {rows.slice(0, shown).map((m) => (
              <MeetingRow key={m.event_id} meeting={m} aName={view.a_name} bName={view.b_name} />
            ))}
            {rows.length > shown ? (
              <TextButton
                onPress={() => setShown((n) => n + MEETINGS_STEP)}
                className="mt-space-4 self-start"
                testID="rivalry-earlier"
              >
                EARLIER MEETINGS
              </TextButton>
            ) : null}
          </View>
        )}
        {hidden > 0 ? (
          <PrivacyNote>
            {`${hidden} ${hidden === 1 ? 'meeting isn’t' : 'meetings aren’t'} listed here. ${hidden === 1 ? 'It was' : 'They were'} only open to the people in ${hidden === 1 ? 'it' : 'them'}. The record counts every verified result.`}
          </PrivacyNote>
        ) : null}
      </View>

      <RematchSection id={id} view={view} block={block} online={online} last={rows[0] ?? null} />
    </View>
  );
}

function MeetingRow({
  meeting,
  aName,
  bName,
}: {
  meeting: RivalryMeetingRow;
  aName: string;
  bName: string;
}) {
  const badge = meetingBadge(meeting.winner, aName, bName);
  const title = meetingTitle(meeting);
  const line = meetingLine(meeting);
  const date = meetingDate(meeting.starts_at, meeting.time_zone);
  return (
    <Pressable
      role="link"
      accessibilityLabel={`${date}, ${title}. ${badge.text === 'DRAW' ? 'Draw' : `${badge.text} won`}. ${line}. See the result.`}
      onPress={() => {
        track('cta_tapped', { cta: 'rivalry_meeting', event_id: meeting.event_id });
        router.push(eventHref(meeting.event_id));
      }}
      className="min-h-touch flex-row items-center gap-space-4 border-b border-line py-space-5"
      testID={`rivalry-meeting-${meeting.event_id}`}
    >
      <View className="w-[80px]">
        <DisplayText size="xs" style={{ fontVariant: ['tabular-nums'] }}>
          {date}
        </DisplayText>
      </View>
      <View className="flex-1 gap-space-1">
        <Text variant="title">{title}</Text>
        {line ? (
          <Text variant="body-sm" muted>
            {line}
          </Text>
        ) : null}
      </View>
      <View className="self-center">
        <Badge tone={badge.tone}>{badge.text}</Badge>
      </View>
    </Pressable>
  );
}

function RematchSection({
  id,
  view,
  block,
  online,
  last,
}: {
  id: string;
  view: RivalryViewRow;
  block: RematchBlock;
  online: boolean;
  last: RivalryMeetingRow | null;
}) {
  const toast = useToast();
  const accept = useAcceptRematch(id);
  const decline = useDeclineRematch(id);
  const runItBack = useRunItBack(id);
  const lastTime = lastTimeLine(view) ?? 'NO RESULT YET';
  const lastMeeting = last ? { starts_at: last.starts_at, time_zone: last.time_zone } : null;
  const busy = accept.isPending || decline.isPending || runItBack.isPending;
  const error = accept.error ?? decline.error ?? runItBack.error;

  if (block.kind === 'none') {
    return view.i_am_in ? null : (
      <Situation id="after" className="gap-space-3 p-space-6" testID="rivalry-spectator">
        <Text variant="body-sm" muted>
          {`Only ${view.a_name} and ${view.b_name} can ask for a rematch. When they do, it shows here.`}
        </Text>
      </Situation>
    );
  }

  if (block.kind === 'scheduled') {
    return (
      <Situation id="after" className="gap-space-4 p-space-6" testID="rivalry-scheduled">
        <Text variant="overline">{`LAST TIME · ${lastTime}`}</Text>
        <Text variant="body">The next meeting is on. Past results stay exactly as they are.</Text>
        <View className="self-start">
          <Button variant="secondary" href={eventHref(block.eventId)} testID="rivalry-next-event">
            SEE THE NEXT MEETING
          </Button>
        </View>
      </Situation>
    );
  }

  if (block.kind === 'answer') {
    return (
      <View testID="rivalry-rematch-answer">
        <Rematch
          requester={block.requester}
          opponent={block.opponent}
          discipline={block.discipline}
          lastResult={lastTime}
          note={block.note ?? undefined}
          onAccept={() => {
            if (busy) return;
            accept.mutate(block.callOutId, {
              onSuccess: (state) => {
                if (state.event_id) router.push(eventHref(state.event_id));
              },
            });
          }}
          onDecline={() => {
            if (busy) return;
            decline.mutate(block.callOutId, {
              onSuccess: () => toast.show({ kind: 'neutral', message: `Not yet. ${block.requester} can ask again any time.` }),
            });
          }}
          testID="rivalry-rematch"
        />
        <Footer
          promise={rematchPromise(true, lastMeeting)}
          link={{ label: 'See the Call-Out', href: callOutHref(block.callOutId) }}
          error={error}
          online={online}
          busy={busy}
        />
      </View>
    );
  }

  if (block.kind === 'waiting' || block.kind === 'pending') {
    return (
      <View testID={`rivalry-rematch-${block.kind}`}>
        <RematchHead lastTime={lastTime}>
          {block.kind === 'waiting'
            ? `You asked for a rematch. Waiting on ${block.opponent}.`
            : `${block.requester} asked for a rematch.`}
        </RematchHead>
        <Footer
          promise={rematchPromise(block.kind === 'pending', lastMeeting)}
          link={{ label: 'See the Call-Out', href: callOutHref(block.callOutId) }}
          error={null}
          online={online}
          busy={false}
        />
      </View>
    );
  }

  // offer
  return (
    <View testID="rivalry-rematch-offer">
      <RematchHead lastTime={lastTime}>{`Ask ${block.opponent} to go again: ${block.discipline}, same rules, two weeks on.`}</RematchHead>
      <Situation id="after" className="px-space-6 pb-space-2">
        <View className="self-start">
          <Button
            variant="primary"
            loading={runItBack.isPending}
            disabled={busy}
            onPress={() =>
              runItBack.mutate(block.eventId, {
                onSuccess: (state) => {
                  if (state.accepted && state.event_id) {
                    router.push(eventHref(state.event_id));
                    return;
                  }
                  toast.show({ kind: 'success', message: `Rematch sent. ${block.opponent} sees it now.` });
                },
              })
            }
            testID="rivalry-run-it-back"
          >
            RUN IT BACK
          </Button>
        </View>
      </Situation>
      <Footer promise={rematchPromise(false, lastMeeting)} link={null} error={error} online={online} busy={busy} />
    </View>
  );
}

/** The Mark in signal ink: read inside the after Situation, not the live screen around it. */
function SignalMark() {
  const signal = useThemeColor('signal');
  return <Graphic kind="mark" size={64} color={signal} />;
}

/** The after-ground heading for the rematch states the Rematch component doesn't cover. */
function RematchHead({ lastTime, children }: { lastTime: string; children: string }) {
  return (
    <Situation id="after" className="gap-space-5 p-space-6 pb-space-4" role="region">
      <Text variant="overline">{`LAST TIME · ${lastTime}`}</Text>
      <View className="flex-row items-center justify-between gap-space-3">
        <DisplayText size="lg" className="shrink">
          REMATCH?
        </DisplayText>
        <SignalMark />
      </View>
      <Text variant="body">{children}</Text>
    </Situation>
  );
}

function Footer({
  promise,
  link,
  error,
  online,
  busy,
}: {
  promise: string;
  link: { label: string; href: Href } | null;
  error: unknown;
  online: boolean;
  busy: boolean;
}) {
  return (
    <Situation id="after" className="gap-space-3 px-space-6 pb-space-10 pt-space-2">
      <Text variant="body-sm" muted testID="rivalry-promise">
        {promise}
      </Text>
      {link ? (
        <Pressable
          role="link"
          onPress={() => router.push(link.href)}
          className="min-h-touch justify-center self-start"
          testID="rivalry-call-out-link"
        >
          <Text variant="body" style={{ textDecorationLine: 'underline' }}>
            {link.label}
          </Text>
        </Pressable>
      ) : null}
      {error && !busy ? <InlineError message={errorMessage(ojoroErrorOf(error))} testID="rivalry-rematch-error" /> : null}
      {!online ? (
        <Text variant="caption" muted>
          Offline. Your answer goes through when you're back.
        </Text>
      ) : null}
    </Situation>
  );
}

function RivalryUnavailable({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const e = ojoroErrorOf(error);
  const gone = !error || e.code === 'rivalry_not_found';
  return (
    <View className="gap-space-4 px-space-5 pt-space-8" testID="rivalry-unavailable">
      {gone ? (
        <>
          <Text variant="title">We can't find this rivalry.</Text>
          <Text variant="body-sm" muted>
            It shows once you can see one of its events.
          </Text>
          <View className="self-start">
            <Button variant="secondary" onPress={() => router.replace('/compete' as Href)}>
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
