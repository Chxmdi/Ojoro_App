/**
 * EventLive (design-handoff/screens/EventLive.png, live situation): back · CHIMDI VS MARCUS · 5K ·
 * share; LiveChallenge (LIVE, the race clock, both lanes, watching); how fresh the lanes are and who
 * logged them; LOCKED PREDICTIONS; CHEER THEM ON; THE CROWD. Competitors also get LOG PROGRESS and
 * WE’RE DONE (submit the result, NOT FINAL until the other side confirms).
 *
 * Until device data (PRD M10) the lanes are logged by the competitors, and the line says so: never
 * "GPS" or "device verified". The clock and freshness run on the server's clock. Predictions locked
 * when it went live (§20.2).
 */
import { CHALLENGE_COMMENT_MAX_LENGTH, isRetryable, type ChallengeSide, type ReactionWord } from '@ojoro/contracts';
import { type Href } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, Share, View } from 'react-native';

import {
  Badge,
  Button,
  ChatComposer,
  Comment,
  Divider,
  Icon,
  IconButton,
  Input,
  LiveChallenge,
  ReactionBar,
  Screen,
  Sheet,
  Text,
  TextButton,
  useToast,
} from '@/design-system';
import { useReportBlock, type ReportBlockTarget } from '@/features/safety';
import { errorMessage } from '@/lib/errorMessages';
import { newIdempotencyKey } from '@/lib/idempotency';
import { ojoroErrorOf } from '@/lib/rpc';
import { track } from '@/lib/analytics';

import { useOnline } from '../activities/data';
import { goBack, InlineError, LoadingState, OfflineNote } from '../activities/ui';
import { readCounts, shortAge, validateUpdate } from '../live/logic';
import { useComment, useEvent, useEventComments, useRespectComment, type EventComment, type EventView } from './data';
import { useCheer, useLogProgress, useSubmitResult } from './liveData';
import {
  cheerRows,
  elapsedClock,
  freshness,
  lanes,
  lockedPredictions,
  matchOverline,
  parseProgress,
  serverNow,
  sideName,
  validateResult,
  valueHint,
  valueWord,
  type StageFacts,
} from './liveLogic';

/** Comments shown at first, and added per EARLIER tap. */
const CROWD_STEP = 6;

/** The current time, ticking every `ms` (the race clock, freshness). */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** The view row as these screens read it. */
export function stageFacts(row: EventView): StageFacts {
  return row as unknown as StageFacts;
}

/**
 * Report or block from a Challenge (§11.1): competitors can block the other side's captain;
 * everyone else reports the event (and blocks people from their comments or profiles).
 */
export function eventReportTarget(row: EventView): ReportBlockTarget {
  const f = stageFacts(row);
  const mine = row.is_competitor ? row.my_side : null;
  if (mine && row.format === 'person_vs_person') {
    const theirs: ChallengeSide = mine === 'a' ? 'b' : 'a';
    const personId = theirs === 'a' ? row.a_user_id : row.b_user_id;
    return {
      subjectKind: 'challenge_event',
      subjectId: row.id,
      personName: theirs === 'a' ? row.a_name : row.b_name,
      ...(personId ? { personId } : null),
    };
  }
  return { subjectKind: 'challenge_event', subjectId: row.id, personName: `${sideName(f, 'a')} vs ${sideName(f, 'b')}` };
}

/** The header of the designs: back, the overline, then share (when given) and report/block. */
export function StageHeader({
  overline,
  onShare,
  shareLabel = 'Share',
  onMore,
  moreLabel = 'Report or block',
}: {
  overline: string;
  onShare?: (() => void) | undefined;
  shareLabel?: string;
  onMore?: (() => void) | undefined;
  moreLabel?: string;
}) {
  return (
    <View className="flex-row items-center justify-between px-space-2 pt-space-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => goBack('/compete' as Href)}
        className="size-[44px] items-center justify-center"
        testID="header-back"
      >
        <Icon name="back" />
      </Pressable>
      <Text variant="overline" className="shrink text-center" accessibilityRole="header" testID="stage-overline">
        {overline}
      </Text>
      <View className="flex-row">
        {onShare ? <IconButton icon="share" label={shareLabel} onPress={onShare} testID="header-share" /> : null}
        {onMore ? <IconButton icon="more" label={moreLabel} onPress={onMore} testID="header-more" /> : null}
        {!onShare && !onMore ? <View className="size-[44px]" /> : null}
      </View>
    </View>
  );
}

/** Loading, error and not-found for the stage screens, inside their own Screen. */
export function StageFallback({
  query,
  situation,
  label,
}: {
  query: ReturnType<typeof useEvent>;
  situation: 'live' | 'after';
  label: string;
}) {
  return (
    <Screen situation={situation} scroll gutter={false}>
      <StageHeader overline="CHALLENGE EVENT" />
      {query.isPending ? (
        <LoadingState label={label} kinds={['object', 'strip', 'strip']} />
      ) : query.isError ? (
        <View className="px-space-5 pt-space-8">
          <InlineError
            message={errorMessage(ojoroErrorOf(query.error))}
            action="RETRY"
            onAction={() => void query.refetch()}
            testID="screen-error"
          />
        </View>
      ) : (
        <View className="gap-space-4 px-space-5 pt-space-8" testID="not-found">
          <Text variant="title">We can't find that event.</Text>
          <Text variant="body-sm" muted>
            It may have been called off, or it isn't open to you.
          </Text>
        </View>
      )}
    </Screen>
  );
}

export function EventLiveScreen({ eventId }: { eventId: string }) {
  const event = useEvent(eventId);
  const data = event.data ?? null;
  if (!data) return <StageFallback query={event} situation="live" label="Loading the live event" />;
  return <LiveBody eventId={eventId} row={data.row} receivedAt={data.receivedAt} dataUpdatedAt={event.dataUpdatedAt} />;
}

function LiveBody({
  eventId,
  row,
  receivedAt,
  dataUpdatedAt,
}: {
  eventId: string;
  row: EventView;
  receivedAt: number;
  dataUpdatedAt: number;
}) {
  const f = stageFacts(row);
  const online = useOnline();
  const toast = useToast();
  const now = useNow();
  const reportBlock = useReportBlock();
  const cheer = useCheer(eventId);
  const [sheet, setSheet] = useState<'progress' | 'result' | null>(null);
  const serverMs = serverNow(row.server_now, receivedAt, now);
  const race = lanes(f);
  const fresh = freshness(f, serverMs);
  const captain = !!row.is_captain;
  const competitor = !!row.is_competitor;

  const share = async () => {
    track('cta_tapped', { cta: 'event_shared', event_id: eventId, from: 'live' });
    try {
      await Share.share({
        message: `${matchOverline(f)} is LIVE. ${race.a.name} ${race.a.value} ${race.unit}, ${race.b.name} ${race.b.value} ${race.unit}. On Ojoro.`,
      });
    } catch {
      toast.show({ kind: 'error', message: "Sharing isn't available here." });
    }
  };

  return (
    <Screen situation="live" scroll gutter={false}>
      <StageHeader
        overline={matchOverline(f)}
        onShare={row.audience === 'public' ? () => void share() : undefined}
        shareLabel="Share the race"
        onMore={() => reportBlock.open(eventReportTarget(row))}
      />
      <View className="pb-space-10" testID="event-live">
        <LiveChallenge
          a={race.a}
          b={race.b}
          discipline={f.title}
          unit={race.unit}
          target={race.target}
          elapsed={elapsedClock(row.live_at, serverMs) ?? undefined}
          watching={row.follower_count ?? undefined}
          testID="live-challenge"
        />

        <View className="gap-space-8 px-space-5">
          <View className="flex-row items-start gap-space-2" accessibilityLiveRegion="polite" testID="live-freshness">
            <Icon name={fresh.stale ? 'alert' : 'clock'} size={20} {...(fresh.stale ? { label: 'Stale' } : null)} />
            <Text variant="body-sm" muted={!fresh.stale} className="flex-1">
              {fresh.text}
            </Text>
          </View>

          {!online ? (
            <OfflineNote dataUpdatedAt={dataUpdatedAt} extra="The lanes catch up when you're back." />
          ) : null}

          {competitor ? (
            <View className="gap-space-3" testID="live-competitor-actions">
              <View className="flex-row flex-wrap gap-space-3">
                <Button variant="secondary" onPress={() => setSheet('progress')} disabled={!online} testID="live-log-progress">
                  LOG PROGRESS
                </Button>
                {captain ? (
                  <Button onPress={() => setSheet('result')} disabled={!online} testID="live-submit-result">
                    WE’RE DONE
                  </Button>
                ) : null}
              </View>
              <Text variant="caption" muted>
                {captain
                  ? 'Log the lanes as it goes. When you finish, send the result: it is not final until the other side confirms.'
                  : 'Log the lanes as it goes. Your captain sends the result.'}
              </Text>
            </View>
          ) : null}

          <View className="gap-space-3 bg-surface-raised p-space-5" testID="live-predictions" role="region" aria-label="Predictions">
            <View className="flex-row items-center gap-space-3">
              <Badge>LOCKED</Badge>
              <Text variant="label">PREDICTIONS</Text>
            </View>
            <Text variant="body">{lockedPredictions(f)}</Text>
          </View>

          <View className="gap-space-4" role="region" aria-label="Cheer them on">
            <Text variant="overline">CHEER THEM ON</Text>
            <ReactionBar
              reactions={cheerRows({ counts: readCounts(row.reaction_counts), mine: row.my_reaction })}
              onReact={(label) => {
                const word = cheerRows({ counts: {}, mine: null }).find((r) => r.label === label)?.value;
                if (word) cheer.mutate(word as ReactionWord);
              }}
              disabled={!online}
              testID="live-cheer"
            />
            {cheer.isError ? (
              <Text variant="caption" muted>
                {`Your cheer didn't go through. ${errorMessage(ojoroErrorOf(cheer.error))}`}
              </Text>
            ) : null}
          </View>

          <Crowd eventId={eventId} row={row} online={online} now={now} onReport={reportBlock.open} />
        </View>
      </View>

      <ProgressSheet visible={sheet === 'progress'} onClose={() => setSheet(null)} eventId={eventId} f={f} />
      <ResultSheet visible={sheet === 'result'} onClose={() => setSheet(null)} eventId={eventId} f={f} />
      {reportBlock.sheet}
    </Screen>
  );
}

/** THE CROWD: comments, RESPECT, replies indented once, and ADD TO THE CROWD. Shared with Result. */
export function Crowd({
  eventId,
  row,
  online,
  now,
  onReport,
  title = 'THE CROWD',
}: {
  eventId: string;
  row: EventView;
  online: boolean;
  now: number;
  onReport: (target: ReportBlockTarget) => void;
  title?: string;
}) {
  const comments = useEventComments(eventId);
  const respect = useRespectComment(eventId);
  const post = useComment(eventId);
  const [shown, setShown] = useState(CROWD_STEP);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [replyTo, setReplyTo] = useState<EventComment | null>(null);
  const key = useRef<string | null>(null);
  const visible = comments.comments.filter((c) => !c.is_deleted);

  const send = (body: string) => {
    const valid = validateUpdate(body, CHALLENGE_COMMENT_MAX_LENGTH);
    if (!valid.ok) {
      setError(valid.error.replace('update', 'comment').replace('Updates', 'Comments'));
      return;
    }
    key.current ??= newIdempotencyKey();
    post.mutate(
      { body: valid.body, key: key.current, parentId: replyTo?.parent_id ?? replyTo?.id ?? undefined },
      {
        onSuccess: () => {
          key.current = null;
          setText('');
          setReplyTo(null);
          setError(undefined);
        },
        onError: (e) => {
          const err = ojoroErrorOf(e);
          setError(errorMessage(err));
        },
      },
    );
  };

  return (
    <View className="gap-space-4" role="region" aria-label="The crowd" testID="event-crowd">
      <Divider label={title} />
      {comments.isPending ? (
        <LoadingState label="Loading the crowd" kinds={['strip', 'strip']} />
      ) : comments.isError && visible.length === 0 ? (
        <InlineError
          message={errorMessage(ojoroErrorOf(comments.error))}
          action="RETRY"
          onAction={() => void comments.refetch()}
        />
      ) : visible.length === 0 ? (
        <Text variant="body-sm" muted testID="crowd-empty">
          Nobody has said anything yet.
        </Text>
      ) : (
        <View className="gap-space-4" testID="crowd-list">
          {visible.slice(0, shown).map((c) => (
            <View key={c.id} className="flex-row items-start" testID="crowd-comment">
              <View className="flex-1">
                <Comment
                  author={c.author_name ?? 'Someone'}
                  body={c.body ?? ''}
                  time={shortAge(c.created_at, now)}
                  badge={c.author_badge ?? undefined}
                  respect={c.respect_count ?? 0}
                  respected={!!c.respected}
                  reply={!!c.parent_id}
                  {...(online ? { onRespect: () => respect.mutate(c.id) } : null)}
                  {...(row.can_comment && online ? { onReply: () => setReplyTo(c) } : null)}
                />
              </View>
              {c.is_mine ? null : (
                <IconButton
                  icon="more"
                  label={`Report or block ${c.author_name ?? 'this comment'}`}
                  onPress={() =>
                    onReport({
                      subjectKind: 'challenge_comment',
                      subjectId: c.id,
                      personName: c.author_name ?? 'this person',
                      ...(c.author_id ? { personId: c.author_id } : null),
                    })
                  }
                />
              )}
            </View>
          ))}
          {visible.length > shown || comments.hasNextPage ? (
            <View className="self-start">
              <TextButton
                onPress={() => {
                  const next = shown + CROWD_STEP;
                  setShown(next);
                  if (next > visible.length && comments.hasNextPage) void comments.fetchNextPage();
                }}
                disabled={comments.isFetchingNextPage}
                testID="crowd-earlier"
              >
                EARLIER
              </TextButton>
            </View>
          ) : null}
        </View>
      )}
      {row.can_comment ? (
        <View className="gap-space-2">
          {replyTo ? (
            <View className="flex-row items-center gap-space-2">
              <Text variant="caption" muted className="flex-1">
                {`Replying to ${replyTo.author_name ?? 'a comment'}`}
              </Text>
              <TextButton onPress={() => setReplyTo(null)}>CANCEL</TextButton>
            </View>
          ) : null}
          <ChatComposer
            label="ADD TO THE CROWD"
            placeholder="Say something to the crowd"
            value={text}
            onChangeText={(t) => {
              setText(t);
              if (error) setError(undefined);
            }}
            onSend={send}
            offline={!online}
            sending={post.isPending}
            error={error}
            maxLength={CHALLENGE_COMMENT_MAX_LENGTH}
            testID="crowd-composer"
          />
        </View>
      ) : (
        <Text variant="caption" muted>
          Comments are closed on this event.
        </Text>
      )}
    </View>
  );
}

function SheetBody({ children }: { children: ReactNode }) {
  return <View className="gap-space-4 pb-space-3">{children}</View>;
}

/** LOG PROGRESS: both lanes, in the event's unit. Set-to-state; blank keeps a lane as it is. */
function ProgressSheet({
  visible,
  onClose,
  eventId,
  f,
}: {
  visible: boolean;
  onClose: () => void;
  eventId: string;
  f: StageFacts;
}) {
  const log = useLogProgress(eventId);
  const race = lanes(f);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [errors, setErrors] = useState<{ a?: string; b?: string }>({});
  useEffect(() => {
    if (visible) {
      setA(f.a_progress !== null ? String(f.a_progress) : '');
      setB(f.b_progress !== null ? String(f.b_progress) : '');
      setErrors({});
      log.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset to the live lanes on open only.
  }, [visible]);

  const save = () => {
    const pa = a.trim() ? parseProgress(a, f.scoring, f.unit) : null;
    const pb = b.trim() ? parseProgress(b, f.scoring, f.unit) : null;
    const next: { a?: string; b?: string } = {};
    if (a.trim() && pa === null) next.a = `That isn't a number of ${race.unit.toLowerCase()}.`;
    if (b.trim() && pb === null) next.b = `That isn't a number of ${race.unit.toLowerCase()}.`;
    if (!a.trim() && !b.trim()) next.a = 'Add at least one lane.';
    setErrors(next);
    if (next.a || next.b) return;
    log.mutate({ a: pa, b: pb }, { onSuccess: onClose });
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Log progress"
      actions={
        <Button block loading={log.isPending} onPress={save} testID="progress-save">
          LOG IT
        </Button>
      }
    >
      <SheetBody>
        <Input
          label={`${race.a.name} · ${race.unit}`}
          value={a}
          onChangeText={setA}
          keyboardType="decimal-pad"
          error={errors.a}
          testID="progress-a"
        />
        <Input
          label={`${race.b.name} · ${race.unit}`}
          value={b}
          onChangeText={setB}
          keyboardType="decimal-pad"
          error={errors.b}
          testID="progress-b"
        />
        <Text variant="caption" muted>
          Everyone watching sees it at once, labelled as logged by you. The result is confirmed separately.
        </Text>
        {log.isError ? <InlineError message={errorMessage(ojoroErrorOf(log.error))} testID="progress-error" /> : null}
      </SheetBody>
    </Sheet>
  );
}

/** WE’RE DONE: both numbers. NOT FINAL until the other captain confirms (participant confirmation). */
export function ResultSheet({
  visible,
  onClose,
  eventId,
  f,
}: {
  visible: boolean;
  onClose: () => void;
  eventId: string;
  f: StageFacts;
}) {
  const submit = useSubmitResult(eventId);
  const names = { a: sideName(f, 'a'), b: sideName(f, 'b') };
  const word = valueWord(f.scoring);
  const [form, setForm] = useState({ a: '', b: '' });
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Partial<Record<'a' | 'b', string>>>({});
  const key = useRef<string | null>(null);
  const theirs = f.my_side === 'a' ? names.b : f.my_side === 'b' ? names.a : 'the other side';

  useEffect(() => {
    if (visible) {
      setErrors({});
      submit.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clear on open only.
  }, [visible]);

  const send = () => {
    const valid = validateResult(form, f.scoring, names);
    if (!valid.ok) {
      setErrors(valid.errors);
      return;
    }
    setErrors({});
    key.current ??= newIdempotencyKey();
    submit.mutate(
      { a: valid.a, b: valid.b, note: note.trim() || null, key: key.current },
      {
        onSuccess: () => {
          key.current = null;
          onClose();
        },
        onError: (e) => {
          if (!isRetryable(ojoroErrorOf(e))) key.current = null;
        },
      },
    );
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Send the result"
      actions={
        <Button block loading={submit.isPending} onPress={send} testID="result-send">
          SEND THE RESULT
        </Button>
      }
    >
      <SheetBody>
        <Input
          label={`${names.a}'s ${word.one}`}
          value={form.a}
          onChangeText={(t) => setForm((p) => ({ ...p, a: t }))}
          hint={valueHint(f.scoring)}
          error={errors.a}
          keyboardType="numbers-and-punctuation"
          testID="result-a"
        />
        <Input
          label={`${names.b}'s ${word.one}`}
          value={form.b}
          onChangeText={(t) => setForm((p) => ({ ...p, b: t }))}
          hint={valueHint(f.scoring)}
          error={errors.b}
          keyboardType="numbers-and-punctuation"
          testID="result-b"
        />
        <Input
          label="How it went (optional)"
          value={note}
          onChangeText={setNote}
          maxLength={280}
          multiline
          hint="Goes on the recap once it is verified."
          testID="result-note"
        />
        <Text variant="caption" muted>
          {`Not final: ${theirs} confirms ${word.both} before anyone is called the winner.`}
        </Text>
        {submit.isError ? <InlineError message={errorMessage(ojoroErrorOf(submit.error))} testID="result-error" /> : null}
      </SheetBody>
    </Sheet>
  );
}
