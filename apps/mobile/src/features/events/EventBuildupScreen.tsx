/**
 * EventBuildup (design-handoff/screens/EventBuildup.png, forming situation): the Challenge Event
 * before its day. ChallengeEventHero with the countdown; BUILD-UP, who follows, FOLLOW and the
 * POSTER link; WHO TAKES IT? (changeable until the start, locked at LIVE); THE CROWD backing (separate
 * from the prediction, never affects the result); the event's polls; the hype feed; the crowd's
 * comments and ADD TO THE CROWD. Social only: no money, points, odds or payouts anywhere.
 *
 * Also exports the header and the event menu (report, block, mute, unfollow) that EventToday uses.
 */
import {
  CHALLENGE_COMMENT_MAX_LENGTH,
  CHALLENGE_POST_MAX_LENGTH,
  type ChallengePollTemplate,
  type ChallengeSide,
} from '@ojoro/contracts';
import { type Href } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import {
  Badge,
  Button,
  Chip,
  ChallengeEventHero,
  Comment,
  CrowdSupport,
  Divider,
  HypePost,
  Icon,
  IconButton,
  Input,
  loadingProps,
  Poll,
  PredictionBar,
  Screen,
  Sheet,
  Skeleton,
  Text,
  TextButton,
  useToast,
} from '@/design-system';
import { useReportBlock } from '@/features/safety';
import { errorMessage } from '@/lib/errorMessages';
import { newIdempotencyKey } from '@/lib/idempotency';
import { ojoroErrorOf, rpc } from '@/lib/rpc';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useOnline } from '../activities/data';
import { goBack, InlineError, OfflineNote, PrivacyNote } from '../activities/ui';
import {
  eventKeys,
  retryNetwork,
  useBack,
  useComment,
  useEvent,
  useEventComments,
  useEventFeed,
  useEventPolls,
  useFollowEvent,
  useMuteComments,
  usePostToFeed,
  usePredict,
  useRespectComment,
  useVotePoll,
  type EventComment,
  type EventPoll,
  type EventView,
  type FeedPost,
} from './data';
import {
  commentBadge,
  countdownTarget,
  crewBackingLine,
  dateline,
  disciplineLabel,
  followingCount,
  hypeView,
  nextBacking,
  pollCloses,
  postAge,
  predictionNote,
  sideName,
  systemTime,
  validateComment,
  whenLine,
  fromShown,
  shownSides,
  toShown,
  type Orientation,
  type ShownSide,
} from './logic';

/** Feed posts and comments shown at first, and added per tap. */
const STEP = 5;

/**
 * The two sides as shown (yours first, contract rule 9): `a`/`b` are the shown names, `left`/`right`
 * the shown sides' facts, `o` maps shown and stored sides, `stored` the names by stored side.
 */
export type Sides = {
  a: string;
  b: string;
  left: ShownSide;
  right: ShownSide;
  o: Orientation;
  stored: { a: string; b: string };
};

/** The hero's stage on the build-up: its own stages, or today/soon when opened from EventToday. */
function heroStage(stage: string): 'accepted' | 'days' | 'today' | 'soon' {
  return stage === 'accepted' || stage === 'today' || stage === 'soon' ? stage : 'days';
}

export function sidesOf(row: EventView): Sides {
  const s = shownSides(row, row.my_side);
  const crew = row.format === 'crew_vs_crew';
  return {
    a: s.a.name,
    b: s.b.name,
    left: s.a,
    right: s.b,
    o: s.o,
    stored: { a: sideName(row.a_name, crew), b: sideName(row.b_name, crew) },
  };
}

export function EventBuildupScreen({ eventId }: { eventId: string }) {
  const event = useEvent(eventId);
  const data = event.data ?? null;
  if (!data) return null; // The stage router shows loading and errors before this mounts.
  return (
    <Buildup
      eventId={eventId}
      row={data.row}
      receivedAt={data.receivedAt}
      dataUpdatedAt={event.dataUpdatedAt}
    />
  );
}

function Buildup({
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
  const online = useOnline();
  const toast = useToast();
  const sides = sidesOf(row);
  const tz = row.time_zone ?? 'America/Toronto';
  const follow = useFollowEvent(eventId);
  const predict = usePredict(eventId);
  const back = useBack(eventId);
  const competitor = !!row.is_competitor;
  const locked = !!row.predictions_locked;
  // Picks and backing in shown positions ('a' = left = yours).
  const pick = toShown(row.my_prediction, sides.o) ?? null;
  const backing = toShown(row.my_backing, sides.o);
  const [menu, setMenu] = useState(false);
  const [postSheet, setPostSheet] = useState(false);
  const [pollSheet, setPollSheet] = useState(false);

  const onPick = (shown: ChallengeSide) => {
    const side = fromShown(shown, sides.o);
    if (competitor && row.my_side && side !== row.my_side) {
      toast.show({ kind: 'error', message: 'You can only pick yourself.' });
      return;
    }
    predict.mutate(side, {
      onError: (e) => toast.show({ kind: 'error', message: errorMessage(ojoroErrorOf(e)) }),
    });
  };
  const onBack = (shown: ChallengeSide) => {
    const side = fromShown(shown, sides.o);
    if (competitor && row.my_side && side !== row.my_side) {
      toast.show({ kind: 'error', message: 'You can only back your own side.' });
      return;
    }
    back.mutate(nextBacking((row.my_backing ?? null) as ChallengeSide | null, side), {
      onError: (e) => toast.show({ kind: 'error', message: errorMessage(ojoroErrorOf(e)) }),
    });
  };

  const following = followingCount(row.follower_count);

  return (
    <Screen situation="forming" scroll gutter={false}>
      <EventHeader
        title={dateline(row.starts_at, tz, row.place_name ?? row.place_area)}
        eventId={eventId}
        row={row}
        onMore={() => setMenu(true)}
      />
      <View testID="event-buildup">
        <ChallengeEventHero
          a={{ name: sides.a }}
          b={{ name: sides.b }}
          discipline={disciplineLabel(row)}
          stage={heroStage(row.stage)}
          countdown={{
            label: 'STARTS IN',
            to: countdownTarget(row.starts_at, row.server_now, receivedAt),
          }}
          when={whenLine(row.starts_at, tz, row.place_name ?? row.course_note)}
          testID="event-hero"
        />

        <View className="gap-space-10 px-space-5 pb-space-10">
          {!online ? (
            <OfflineNote
              dataUpdatedAt={dataUpdatedAt}
              extra="Picks, backing and comments wait until you're back."
            />
          ) : null}

          <View className="gap-space-4" testID="event-follow-row">
            <View className="flex-row flex-wrap items-center gap-space-3">
              <Badge tone="signal">BUILD-UP</Badge>
              {following ? (
                <Text
                  variant="body-sm"
                  muted
                  testID="event-following-count"
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  {following}
                </Text>
              ) : null}
            </View>
            <View className="flex-row flex-wrap items-center gap-space-5">
              {/* Competitors follow too (EventBuildup.png: Chimdi, a competitor, is Following). */}
              {row.i_follow !== null ? (
                // A selected Chip, as the prototype draws it: inverse fill and a check when following.
                <Chip
                  selected={!!row.i_follow}
                  onPress={() => follow.mutate(!row.i_follow)}
                  testID="event-follow"
                >
                  {row.i_follow ? 'Following' : 'Follow'}
                </Chip>
              ) : null}
              {row.audience === 'public' ? (
                <Button
                  variant="ghost"
                  compact
                  href={`/event/${eventId}/poster` as Href}
                  accessibilityLabel="Share poster"
                  testID="event-poster-link"
                >
                  POSTER
                </Button>
              ) : null}
            </View>
            {follow.isError ? (
              <InlineError message={errorMessage(ojoroErrorOf(follow.error))} />
            ) : null}
          </View>

          <View className="gap-space-3" role="region" aria-label="Predictions">
            <PredictionBar
              a={{ name: sides.a.toUpperCase(), pct: sides.left.pct }}
              b={{ name: sides.b.toUpperCase(), pct: sides.right.pct }}
              {...(pick ? { picked: pick } : null)}
              locked={locked}
              {...(online ? { onPick } : null)}
              testID="event-prediction"
            />
            <Text variant="caption" muted testID="event-prediction-note">
              {predictionNote({
                myPick: pick ? (pick === 'a' ? sides.a : sides.b) : null,
                locked,
                count: row.prediction_count ?? 0,
                startsAt: row.starts_at,
                timeZone: tz,
                competitor,
              })}
            </Text>
          </View>

          <View className="gap-space-3">
            <CrowdSupport
              a={{ name: sides.a, count: sides.left.backing }}
              b={{ name: sides.b, count: sides.right.backing }}
              {...(backing ? { backing } : null)}
              onBack={onBack}
              disabled={!online || row.backing_open === false}
              testID="event-crowd"
            />
            <Text variant="body-sm" testID="event-crew-backing">
              {crewBackingLine({
                crewA: sides.left.crewBacking,
                crewB: sides.right.crewBacking,
                aName: sides.a,
                bName: sides.b,
              })}
            </Text>
          </View>

          <EventPolls
            eventId={eventId}
            tz={tz}
            online={online}
            canAdd={!!row.can_post && !locked}
            onAdd={() => setPollSheet(true)}
          />

          <HypeFeed
            eventId={eventId}
            row={row}
            sides={sides}
            tz={tz}
            onPost={row.can_post ? () => setPostSheet(true) : undefined}
          />

          <CrowdComments eventId={eventId} row={row} online={online} />
        </View>
      </View>

      <EventMenu eventId={eventId} row={row} visible={menu} onClose={() => setMenu(false)} />
      <PostSheet eventId={eventId} visible={postSheet} onClose={() => setPostSheet(false)} />
      <PollSheet eventId={eventId} visible={pollSheet} onClose={() => setPollSheet(false)} />
    </Screen>
  );
}

// Header and menu --------------------------------------------------------------------------------

/** Back · the dateline · one action (the event menu by default). */
export function EventHeader({
  title,
  eventId,
  row,
  onMore,
  right,
}: {
  title: string;
  eventId: string;
  row?: EventView | undefined;
  onMore?: (() => void) | undefined;
  right?: ReactNode;
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
      <Text
        variant="label"
        muted
        className="shrink text-center"
        accessibilityRole="header"
        testID="event-dateline"
      >
        {title}
      </Text>
      {right ??
        (row && onMore ? (
          <IconButton
            icon="more"
            label="Event options: report, block, mute"
            onPress={onMore}
            testID="header-more"
          />
        ) : (
          <View
            className="size-[44px]"
            accessibilityElementsHidden
            testID={`header-spacer-${eventId}`}
          />
        ))}
    </View>
  );
}

/**
 * The event's overflow (undesigned sheet; DESIGN_DECISIONS, Step 5 screens: B): report the event,
 * report or block each competitor who isn't you, mute comments, stop following.
 */
export function EventMenu({
  eventId,
  row,
  visible,
  onClose,
}: {
  eventId: string;
  row: EventView;
  visible: boolean;
  onClose: () => void;
}) {
  const reportBlock = useReportBlock({ onBlocked: () => goBack('/compete' as Href) });
  const mute = useMuteComments(eventId);
  const follow = useFollowEvent(eventId);
  const people = [
    { id: row.a_user_id, name: row.a_name, side: 'a' as const },
    { id: row.b_user_id, name: row.b_name, side: 'b' as const },
  ].filter((p) => p.id && p.side !== row.my_side);
  const then = (fn: () => void) => () => {
    onClose();
    fn();
  };
  return (
    <>
      <Sheet visible={visible} onClose={onClose} title="This event">
        <View className="gap-space-3 pb-space-4" testID="event-menu">
          {row.i_follow !== null ? (
            <Button
              variant="secondary"
              block
              onPress={then(() => mute.mutate(!row.comments_muted))}
              testID="event-menu-mute"
            >
              {row.comments_muted ? 'SHOW COMMENTS' : 'MUTE COMMENTS'}
            </Button>
          ) : null}
          {row.i_follow ? (
            <Button
              variant="secondary"
              block
              onPress={then(() => follow.mutate(false))}
              testID="event-menu-unfollow"
            >
              STOP FOLLOWING
            </Button>
          ) : null}
          {people.map((p) => (
            <Button
              key={p.side}
              variant="ghost"
              block
              onPress={then(() =>
                reportBlock.open({
                  subjectKind: 'challenge_event',
                  subjectId: eventId,
                  personName: p.name,
                  personId: p.id as string,
                }),
              )}
              testID={`event-menu-report-${p.side}`}
            >
              {`REPORT OR BLOCK ${p.name.toUpperCase()}`}
            </Button>
          ))}
          <Text variant="caption" muted>
            Reports go to Ojoro, not to the people in it. Blocking hides them from you everywhere.
          </Text>
        </View>
      </Sheet>
      {reportBlock.sheet}
    </>
  );
}

// Polls -----------------------------------------------------------------------------------------

function EventPolls({
  eventId,
  tz,
  online,
  canAdd,
  onAdd,
}: {
  eventId: string;
  tz: string;
  online: boolean;
  canAdd: boolean;
  onAdd: () => void;
}) {
  const polls = useEventPolls(eventId);
  const vote = useVotePoll(eventId);
  const list = polls.data ?? [];
  if (polls.isPending) return <Skeleton kind="strip" />;
  if (polls.isError && list.length === 0) {
    return (
      <InlineError
        message={errorMessage(ojoroErrorOf(polls.error))}
        action="RETRY"
        onAction={() => void polls.refetch()}
      />
    );
  }
  if (list.length === 0) {
    return canAdd ? (
      <View className="self-start">
        <TextButton onPress={onAdd} testID="event-add-poll">
          ADD A POLL
        </TextButton>
      </View>
    ) : null;
  }
  return (
    <View className="gap-space-8" testID="event-polls">
      {list.map((poll: EventPoll) => {
        const mine = poll.my_vote !== null && poll.my_vote >= 0 ? poll.my_vote : undefined;
        return (
          <Poll
            key={poll.id}
            question={poll.question.toUpperCase()}
            options={poll.options.map((label, i) => ({ label, votes: poll.vote_counts[i] ?? 0 }))}
            {...(mine !== undefined ? { voted: mine } : null)}
            {...(poll.is_closed ? { closed: true } : { closes: pollCloses(poll.closes_at, tz) })}
            {...(online && !poll.is_closed
              ? { onVote: (i: number) => vote.mutate({ pollId: poll.id, option: i }) }
              : null)}
            testID={`event-poll-${poll.template ?? 'poll'}`}
          />
        );
      })}
      {vote.isError ? <InlineError message={errorMessage(ojoroErrorOf(vote.error))} /> : null}
    </View>
  );
}

const POLL_TEMPLATES: { template: ChallengePollTemplate; label: string; hint: string }[] = [
  { template: 'margin', label: 'HOW CLOSE?', hint: 'Three margins to pick from.' },
  { template: 'winner', label: 'WHO WINS?', hint: 'The two sides.' },
  { template: 'rematch', label: 'RUN IT BACK?', hint: 'Would the crowd want a rematch.' },
];

/** Competitors and organizers add one of the contract's poll templates (undesigned sheet). */
function PollSheet({
  eventId,
  visible,
  onClose,
}: {
  eventId: string;
  visible: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (template: ChallengePollTemplate) =>
      rpc('create_challenge_poll', { p_event_id: eventId, p_template: template }),
    retry: retryNetwork,
    onSettled: () => qc.invalidateQueries({ queryKey: eventKeys.polls(eventId) }),
  });
  useEffect(() => {
    if (visible) create.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on open only.
  }, [visible]);
  return (
    <Sheet visible={visible} onClose={onClose} title="Add a poll">
      <View className="gap-space-3 pb-space-4">
        {POLL_TEMPLATES.map((t) => (
          <View key={t.template} className="gap-space-1">
            <Button
              variant="secondary"
              block
              loading={create.isPending && create.variables === t.template}
              onPress={() => create.mutate(t.template, { onSuccess: onClose })}
              testID={`poll-template-${t.template}`}
            >
              {t.label}
            </Button>
            <Text variant="caption" muted>
              {t.hint}
            </Text>
          </View>
        ))}
        <Text variant="caption" muted>
          It closes at the start. Votes are social only.
        </Text>
        {create.isError ? <InlineError message={errorMessage(ojoroErrorOf(create.error))} /> : null}
      </View>
    </Sheet>
  );
}

// Hype feed -------------------------------------------------------------------------------------

export function HypeFeed({
  eventId,
  row,
  sides,
  tz,
  onPost,
}: {
  eventId: string;
  row: EventView;
  sides: Sides;
  tz: string;
  onPost?: (() => void) | undefined;
}) {
  const feed = useEventFeed(eventId);
  const reportBlock = useReportBlock();
  const [shown, setShown] = useState(STEP);
  const now = Date.now();
  const names = sides.stored;
  return (
    <View className="gap-space-4" role="region" aria-label="Build-up">
      <Divider kind="mark" label="BUILD-UP" />
      {onPost ? (
        <View className="self-start">
          <Button variant="secondary" compact onPress={onPost} testID="event-post">
            POST TO THE BUILD-UP
          </Button>
        </View>
      ) : null}
      {feed.isPending ? (
        <View {...loadingProps('Loading the build-up')} className="gap-space-4">
          <Skeleton kind="strip" />
          <Skeleton kind="strip" />
        </View>
      ) : feed.isError && feed.posts.length === 0 ? (
        <InlineError
          message={errorMessage(ojoroErrorOf(feed.error))}
          action="RETRY"
          onAction={() => void feed.refetch()}
        />
      ) : feed.posts.length === 0 ? (
        <Text variant="body-sm" muted testID="event-feed-empty">
          {`Nothing yet. ${sides.a} and ${sides.b} post training and statements here; Ojoro posts the milestones.`}
        </Text>
      ) : (
        <View className="gap-space-4" testID="event-feed">
          {feed.posts.slice(0, shown).map((p: FeedPost) => {
            const v = hypeView(p, names);
            if (v.hidden) return null;
            return (
              <HypePost
                key={p.id}
                kind={v.kind}
                body={v.body}
                {...(v.kind === 'system'
                  ? { time: systemTime(p.created_at, now, tz) }
                  : {
                      author: p.author_name ?? 'Someone',
                      time: postAge(p.created_at, now),
                      side: v.side,
                      stats: v.stats,
                      onMore: p.is_mine
                        ? undefined
                        : () =>
                            reportBlock.open({
                              subjectKind: 'challenge_post',
                              subjectId: p.id,
                              personName: p.author_name ?? 'this person',
                              ...(p.author_id ? { personId: p.author_id } : null),
                            }),
                    })}
                testID={`event-post-${p.kind}`}
              />
            );
          })}
          {feed.posts.length > shown || feed.hasNextPage ? (
            <View className="self-start">
              <TextButton
                onPress={() => {
                  const next = shown + STEP;
                  setShown(next);
                  if (next > feed.posts.length && feed.hasNextPage) void feed.fetchNextPage();
                }}
                disabled={feed.isFetchingNextPage}
                testID="event-feed-earlier"
              >
                EARLIER POSTS
              </TextButton>
            </View>
          ) : null}
        </View>
      )}
      {reportBlock.sheet}
      {row.audience !== 'public' ? (
        <PrivacyNote>
          {row.audience === 'friends'
            ? 'Only friends of the two sides see this event.'
            : 'Only the people in it see this event.'}
        </PrivacyNote>
      ) : null}
    </View>
  );
}

function PostSheet({
  eventId,
  visible,
  onClose,
}: {
  eventId: string;
  visible: boolean;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const post = usePostToFeed(eventId);
  const key = useRef<string | null>(null);
  const submit = () => {
    const valid = validateComment(text, CHALLENGE_POST_MAX_LENGTH);
    if (!valid.ok) {
      setError(valid.error);
      return;
    }
    key.current ??= newIdempotencyKey();
    post.mutate(
      { body: valid.body, key: key.current, kind: 'statement' },
      {
        onSuccess: () => {
          key.current = null;
          setText('');
          onClose();
        },
        onError: (e) => setError(errorMessage(ojoroErrorOf(e))),
      },
    );
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Post to the build-up"
      actions={
        <Button block loading={post.isPending} onPress={submit} testID="event-post-send">
          POST
        </Button>
      }
    >
      <View className="gap-space-3 pb-space-3">
        <Input
          label="Your post"
          value={text}
          onChangeText={(t) => {
            setText(t);
            if (error) setError(undefined);
          }}
          multiline
          maxLength={CHALLENGE_POST_MAX_LENGTH}
          placeholder="Rain or not, Saturday I run it."
          hint={`${text.trim().length} of ${CHALLENGE_POST_MAX_LENGTH}. Everyone who can see the event sees it.`}
          error={error}
          testID="event-post-input"
        />
      </View>
    </Sheet>
  );
}

// The crowd (comments) ---------------------------------------------------------------------------

function CrowdComments({
  eventId,
  row,
  online,
}: {
  eventId: string;
  row: EventView;
  online: boolean;
}) {
  const muted = !!row.comments_muted;
  const comments = useEventComments(eventId, !muted);
  const respect = useRespectComment(eventId);
  const mute = useMuteComments(eventId);
  const reportBlock = useReportBlock();
  const [shown, setShown] = useState(STEP);
  const [replyTo, setReplyTo] = useState<EventComment | null>(null);
  const now = Date.now();
  const count = row.comment_count ?? 0;

  return (
    <View className="gap-space-4" role="region" aria-label="The crowd">
      <View className="flex-row items-center justify-between gap-space-3">
        <Text
          variant="label"
          testID="event-comments-count"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {`THE CROWD · ${count}`}
        </Text>
        {row.i_follow !== null ? (
          <TextButton
            on={muted}
            onPress={() => mute.mutate(!muted)}
            disabled={!online}
            testID="event-mute-comments"
          >
            {muted ? 'SHOW COMMENTS' : 'MUTE COMMENTS'}
          </TextButton>
        ) : null}
      </View>

      {muted ? (
        <Text variant="body-sm" muted testID="event-comments-muted">
          Comments muted. You still get the build-up and the result.
        </Text>
      ) : comments.isPending ? (
        <View {...loadingProps('Loading comments')} className="gap-space-4">
          <Skeleton kind="strip" />
        </View>
      ) : comments.isError && comments.comments.length === 0 ? (
        <InlineError
          message={errorMessage(ojoroErrorOf(comments.error))}
          action="RETRY"
          onAction={() => void comments.refetch()}
        />
      ) : comments.comments.length === 0 ? (
        <Text variant="body-sm" muted testID="event-comments-empty">
          No comments yet. Say who you think takes it.
        </Text>
      ) : (
        <View testID="event-comments">
          {comments.comments.slice(0, shown).map((c) => {
            if (c.is_deleted || !c.body) return null;
            const badge = commentBadge(c.author_badge);
            return (
              <View key={c.id} className="flex-row items-start" testID="event-comment">
                <View className="flex-1">
                  <Comment
                    author={c.author_name ?? 'Someone'}
                    body={c.body}
                    time={postAge(c.created_at, now)}
                    {...(badge ? { badge } : null)}
                    respect={c.respect_count ?? 0}
                    respected={!!c.respected}
                    {...(c.parent_id ? { reply: true } : { replies: c.reply_count ?? 0 })}
                    {...(online && row.can_comment && !c.parent_id
                      ? { onReply: () => setReplyTo(c) }
                      : null)}
                    {...(online && !c.is_mine ? { onRespect: () => respect.mutate(c.id) } : null)}
                  />
                </View>
                {!c.is_mine ? (
                  <IconButton
                    icon="more"
                    label={`Report or block ${c.author_name ?? 'this comment'}`}
                    onPress={() =>
                      reportBlock.open({
                        subjectKind: 'challenge_comment',
                        subjectId: c.id,
                        personName: c.author_name ?? 'this person',
                        ...(c.author_id ? { personId: c.author_id } : null),
                      })
                    }
                  />
                ) : null}
              </View>
            );
          })}
          {comments.comments.length > shown || comments.hasNextPage ? (
            <View className="self-start pt-space-2">
              <TextButton
                onPress={() => {
                  const next = shown + STEP;
                  setShown(next);
                  if (next > comments.comments.length && comments.hasNextPage)
                    void comments.fetchNextPage();
                }}
                disabled={comments.isFetchingNextPage}
                testID="event-comments-earlier"
              >
                EARLIER COMMENTS
              </TextButton>
            </View>
          ) : null}
          {respect.isError ? (
            <Text variant="caption" muted>
              {`Your respect didn't go through. ${errorMessage(ojoroErrorOf(respect.error))}`}
            </Text>
          ) : null}
        </View>
      )}

      {row.can_comment ? (
        <CommentComposer
          eventId={eventId}
          online={online}
          replyTo={replyTo}
          onReplied={() => setReplyTo(null)}
        />
      ) : (
        <PrivacyNote>Only people who can see this event comment on it.</PrivacyNote>
      )}
      {reportBlock.sheet}
    </View>
  );
}

function CommentComposer({
  eventId,
  online,
  replyTo,
  onReplied,
}: {
  eventId: string;
  online: boolean;
  replyTo: EventComment | null;
  onReplied: () => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const comment = useComment(eventId);
  const key = useRef<string | null>(null);
  const submit = () => {
    const valid = validateComment(text, CHALLENGE_COMMENT_MAX_LENGTH);
    if (!valid.ok) {
      setError(valid.error);
      return;
    }
    key.current ??= newIdempotencyKey();
    comment.mutate(
      { body: valid.body, key: key.current, parentId: replyTo?.id },
      {
        onSuccess: () => {
          key.current = null;
          setText('');
          onReplied();
        },
        onError: (e) => setError(errorMessage(ojoroErrorOf(e))),
      },
    );
  };
  return (
    <View className="gap-space-3 pt-space-4" testID="event-composer">
      {replyTo ? (
        <View className="flex-row items-center gap-space-3">
          <Text variant="caption" muted className="flex-1">
            {`Replying to ${replyTo.author_name ?? 'a comment'}`}
          </Text>
          <TextButton onPress={onReplied}>CANCEL</TextButton>
        </View>
      ) : null}
      <Input
        label={replyTo ? 'Your reply' : 'Add to the crowd'}
        value={text}
        onChangeText={(t) => {
          setText(t);
          if (error) setError(undefined);
        }}
        maxLength={CHALLENGE_COMMENT_MAX_LENGTH}
        placeholder="Say something. Keep it friendly."
        returnKeyType="send"
        onSubmitEditing={submit}
        error={error}
        {...(!online ? { hint: "Offline. It sends when you're back." } : null)}
        testID="event-comment-input"
      />
      {text.trim() ? (
        <View className="self-end">
          <Button compact loading={comment.isPending} onPress={submit} testID="event-comment-send">
            POST
          </Button>
        </View>
      ) : null}
    </View>
  );
}
