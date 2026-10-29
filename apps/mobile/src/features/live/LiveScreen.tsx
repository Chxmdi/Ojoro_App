/**
 * LiveActivity (design-handoff/screens/LiveActivity.png, live situation): back · LIVE · the running
 * clock · share; the score with "Updated 20 s ago · logged by Ade (host)"; the updates feed
 * (Ojoro's and the host's posts as UPDATE cards, players' posts as comments); who's following and
 * the game's reactions; FULL TIME for the host. The clock and freshness run on the server's clock.
 * Only the LIVE dot and the clock pulse; the layout never moves.
 */
import { LIVE_UPDATE_MAX_LENGTH, type ReactionWord } from '@ojoro/contracts';
import { router, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Share, View } from 'react-native';

import {
  Button,
  Comment,
  Divider,
  HypePost,
  Icon,
  IconButton,
  Input,
  LiveClock,
  LiveIndicator,
  LiveScoreHeader,
  loadingProps,
  Modal,
  ReactionBar,
  Screen,
  Sheet,
  Skeleton,
  Stepper,
  Text,
  TextButton,
  useToast,
} from '@/design-system';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { newIdempotencyKey } from '@/lib/idempotency';
import { ojoroErrorOf } from '@/lib/rpc';
import { useReportBlock } from '@/features/safety';

import { timeZoneOf, useActivityCard, useActivityRoster, useOnline, usePlace } from '../activities/data';
import { clock } from '../activities/format';
import { goBack, InlineError } from '../activities/ui';
import { afterOverlay } from '../chat/ChatView';
import {
  useFollow,
  useFullTime,
  useLiveRealtime,
  useLiveState,
  useLogScore,
  usePostUpdate,
  useReact,
  useUpdatesFeed,
  type LiveState,
} from './data';
import {
  followingLine,
  fullTimeLine,
  isLive,
  liveAnchors,
  liveOverline,
  loggedByLabel,
  reactionRows,
  readCounts,
  SCORE_MAX,
  scoreSides,
  shareText,
  shortAge,
  updateView,
  validateUpdate,
  wordForLabel,
  type UpdateRow,
} from './logic';

/** Updates shown at first, and added per EARLIER UPDATES tap. */
const FEED_STEP = 4;

export function LiveScreen({ id }: { id: string }) {
  const online = useOnline();
  const toast = useToast();
  useLiveRealtime(id);
  const live = useLiveState(id);
  const data = live.data ?? null;
  const row = data?.row ?? null;
  const card = useActivityCard(id);
  const roster = useActivityRoster(id, !!row);
  const place = usePlace(id, card.data?.place_id);
  const tz = timeZoneOf(place.data);
  const hostName = roster.data?.find((r) => r.is_host)?.display_name ?? null;
  const status = row?.effective_status ?? 'live';
  const situation = status === 'live' ? 'live' : status === 'after' || status === 'complete' ? 'after' : 'calm';

  useEffect(() => {
    track('screen_viewed', { screen: 'live', activity_id: id });
  }, [id]);

  // The host who just blew FULL TIME goes to After; others see FULL TIME here.
  const ended = useRef(false);

  const share = async () => {
    if (!row) return;
    track('live_shared', { activity_id: id });
    try {
      await Share.share({ message: shareText(row) });
    } catch {
      toast.show({ kind: 'error', message: "Sharing isn't available here." });
    }
  };

  const anchors = data ? liveAnchors(data.row, data.receivedAt) : { startedAt: null, updatedAt: null };

  return (
    <Screen situation={situation} scroll gutter={false}>
      <View className="flex-row items-center gap-space-3 px-space-2 pt-space-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => goBack(`/activity/${id}` as Href)}
          className="size-[44px] items-center justify-center"
          testID="header-back"
        >
          <Icon name="back" />
        </Pressable>
        {row && isLive(status) ? (
          <>
            <LiveIndicator testID="live-indicator" />
            {anchors.startedAt !== null ? <LiveClock startedAt={anchors.startedAt} testID="live-clock" /> : null}
          </>
        ) : row ? (
          <Text variant="label" testID="live-ended">
            FULL TIME
          </Text>
        ) : null}
        <View className="flex-1" />
        <IconButton icon="share" label="Share the score" onPress={() => void share()} disabled={!row} testID="live-share" />
      </View>

      {live.isPending && !row ? (
        <View className="gap-space-6 px-space-5 pt-space-6" {...loadingProps('Loading the game')}>
          <Skeleton kind="object" />
          <Skeleton kind="strip" />
        </View>
      ) : !row ? (
        <LiveUnavailable error={live.error} onRetry={() => void live.refetch()} />
      ) : (
        <LiveBody
          id={id}
          row={row}
          anchors={anchors}
          online={online}
          tz={tz}
          hostName={hostName}
          onEnded={() => {
            ended.current = true;
            router.replace(`/activity/${id}/after` as Href);
          }}
        />
      )}
    </Screen>
  );
}

function LiveBody({
  id,
  row,
  anchors,
  online,
  tz,
  hostName,
  onEnded,
}: {
  id: string;
  row: LiveState;
  anchors: { startedAt: number | null; updatedAt: number | null };
  online: boolean;
  tz: string;
  hostName: string | null;
  onEnded: () => void;
}) {
  const live = isLive(row.effective_status);
  const sides = scoreSides(row);
  const react = useReact(id);
  const follow = useFollow(id);
  const fullTime = useFullTime(id);
  const feed = useUpdatesFeed(id);
  const reportBlock = useReportBlock();
  const [sheet, setSheet] = useState<'score' | 'post' | null>(null);
  const [confirmFullTime, setConfirmFullTime] = useState(false);
  // The newest few, as designed; the rest a tap away, so the reactions stay near the score.
  const [shown, setShown] = useState(FEED_STEP);
  const following = followingLine(row);
  const player = row.can_post || row.is_host;
  const reactable = row.effective_status === 'live' || row.effective_status === 'after';
  const reactions = reactionRows({ counts: readCounts(row.reaction_counts), mine: row.my_reaction });
  const now = Date.now();

  const onReact = (label: string) => {
    const word = wordForLabel(label);
    if (word) react.mutate({ word, updateId: null });
  };

  return (
    <View className="gap-space-8 px-space-5 pb-space-10 pt-space-6" testID="live-screen">
      <LiveScoreHeader
        overline={liveOverline(row)}
        a={sides.a}
        b={sides.b}
        updatedAt={anchors.updatedAt ?? anchors.startedAt ?? now}
        loggedBy={loggedByLabel(row)}
        offline={!online}
        testID="live-score"
      />

      {live && (row.can_log_score || row.can_post) ? (
        <View className="flex-row flex-wrap gap-space-3" testID="live-host-actions">
          {row.can_log_score ? (
            <Button variant="secondary" onPress={() => setSheet('score')} disabled={!online} testID="live-log-score">
              LOG THE SCORE
            </Button>
          ) : null}
          {row.can_post ? (
            <Button variant="ghost" onPress={() => setSheet('post')} disabled={!online} testID="live-post-update">
              POST AN UPDATE
            </Button>
          ) : null}
        </View>
      ) : null}

      <View className="gap-space-4" role="region" aria-label="Updates">
        <Divider label="UPDATES" />
        {feed.isPending ? (
          <View {...loadingProps('Loading updates')} className="gap-space-4">
            <Skeleton kind="strip" />
            <Skeleton kind="strip" />
          </View>
        ) : feed.isError && feed.updates.length === 0 ? (
          <InlineError message={errorMessage(ojoroErrorOf(feed.error))} action="RETRY" onAction={() => void feed.refetch()} />
        ) : feed.updates.length === 0 ? (
          <Text variant="body-sm" muted testID="live-feed-empty">
            No updates yet. The host posts the score as it changes.
          </Text>
        ) : (
          <View className="gap-space-4" testID="live-feed">
            {feed.updates.slice(0, shown).map((u) => (
              <UpdateItem
                key={u.id}
                update={u}
                tz={tz}
                now={now}
                reactable={reactable && online}
                onRespect={() => react.mutate({ word: 'respect' as ReactionWord, updateId: u.id })}
                onReply={() => {
                  track('live_reply_tapped', { activity_id: id });
                  router.push(`/activity/${id}/chat` as Href);
                }}
                canReply={player}
                onMore={() =>
                  reportBlock.open({
                    subjectKind: 'update',
                    subjectId: u.id,
                    personName: u.author_name ?? 'this person',
                    ...(u.author_id ? { personId: u.author_id } : null),
                  })
                }
              />
            ))}
            {feed.updates.length > shown || feed.hasNextPage ? (
              <View className="self-start">
                <TextButton
                  onPress={() => {
                    const next = shown + FEED_STEP;
                    setShown(next);
                    if (next > feed.updates.length && feed.hasNextPage) void feed.fetchNextPage();
                  }}
                  disabled={feed.isFetchingNextPage}
                  testID="live-earlier"
                >
                  EARLIER UPDATES
                </TextButton>
              </View>
            ) : null}
          </View>
        )}
      </View>

      <View className="gap-space-3" role="region" aria-label="Following">
        {following ? (
          <Text variant="label" muted testID="live-following">
            {following}
          </Text>
        ) : null}
        <ReactionBar
          reactions={reactions}
          onReact={(label) => onReact(label)}
          disabled={!reactable || !online}
          testID="live-reactions"
        />
        {react.isError ? (
          <Text variant="caption" muted>
            {`Your reaction didn't go through. ${errorMessage(ojoroErrorOf(react.error))}`}
          </Text>
        ) : null}
        {!player && live ? (
          <View className="gap-space-2">
            <View className="self-start">
              <Button
                variant="secondary"
                onPress={() => follow.mutate(!row.i_follow)}
                disabled={!online}
                testID="live-follow"
              >
                {row.i_follow ? 'FOLLOWING' : 'FOLLOW'}
              </Button>
            </View>
            <Text variant="caption" muted>
              {row.i_follow
                ? 'You get the score and updates. Tap again to stop.'
                : 'Followers see the score and updates, never who is here or where they are.'}
            </Text>
          </View>
        ) : null}
      </View>

      {live ? (
        <View className="gap-space-3" testID="live-full-time">
          <Text variant="body" muted>
            {fullTimeLine(row.is_host, hostName)}
          </Text>
          {row.is_host ? (
            <Button
              variant="secondary"
              block
              onPress={() => setConfirmFullTime(true)}
              loading={fullTime.isPending}
              disabled={!online}
              testID="live-full-time-button"
            >
              FULL TIME
            </Button>
          ) : null}
          {fullTime.isError ? <InlineError message={errorMessage(ojoroErrorOf(fullTime.error))} /> : null}
          {!online ? (
            <Text variant="caption" muted>
              Offline. Scores, updates and FULL TIME need a connection.
            </Text>
          ) : null}
        </View>
      ) : (
        <View className="gap-space-3" testID="live-finished">
          <Text variant="body">
            {row.effective_status === 'cancelled'
              ? 'This game was called off.'
              : 'Full time. Players confirm the score in After.'}
          </Text>
          {player && row.effective_status === 'after' ? (
            <Button block href={`/activity/${id}/after` as Href} testID="live-to-after">
              CONFIRM THE SCORE
            </Button>
          ) : null}
        </View>
      )}

      <LogScoreSheet
        visible={sheet === 'score'}
        onClose={() => setSheet(null)}
        id={id}
        a={sides.a}
        b={sides.b}
      />
      <PostUpdateSheet visible={sheet === 'post'} onClose={() => setSheet(null)} id={id} />
      <Modal
        visible={confirmFullTime}
        title="FULL TIME?"
        body={`The game ends at ${sides.a.score}–${sides.b.score}. After opens for 24 hours to confirm the score and add photos. Location sharing stops.`}
        confirm="FULL TIME"
        cancel="KEEP PLAYING"
        onCancel={() => setConfirmFullTime(false)}
        onConfirm={() => {
          setConfirmFullTime(false);
          fullTime.mutate(undefined, { onSuccess: () => afterOverlay(onEnded) });
        }}
      />
      {reportBlock.sheet}
    </View>
  );
}

function UpdateItem({
  update,
  tz,
  now,
  reactable,
  onRespect,
  onReply,
  canReply,
  onMore,
}: {
  update: UpdateRow;
  tz: string;
  now: number;
  reactable: boolean;
  onRespect: () => void;
  onReply: () => void;
  canReply: boolean;
  onMore: () => void;
}) {
  const view = updateView(update);
  if (view === 'hidden') return null;
  if (view === 'card') {
    return (
      <HypePost kind="system" body={(update.body ?? '').toUpperCase()} time={clock(update.created_at, tz)} testID={`live-update-${update.kind}`} />
    );
  }
  const counts = readCounts(update.reaction_counts);
  return (
    <View className="flex-row items-start" testID="live-comment">
      <View className="flex-1">
        <Comment
          author={update.author_name ?? 'Someone'}
          body={update.body ?? ''}
          time={shortAge(update.created_at, now)}
          respect={counts.respect ?? 0}
          respected={update.my_reaction === 'respect'}
          {...(canReply ? { onReply } : null)}
          {...(reactable ? { onRespect } : null)}
        />
      </View>
      <IconButton icon="more" label={`Report or block ${update.author_name ?? 'this post'}`} onPress={onMore} />
    </View>
  );
}

function LogScoreSheet({
  visible,
  onClose,
  id,
  a,
  b,
}: {
  visible: boolean;
  onClose: () => void;
  id: string;
  a: { name: string; score: number };
  b: { name: string; score: number };
}) {
  const [left, setLeft] = useState(a.score);
  const [right, setRight] = useState(b.score);
  const log = useLogScore(id);
  useEffect(() => {
    if (visible) {
      setLeft(a.score);
      setRight(b.score);
      log.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset to the live score on open only.
  }, [visible]);
  const name = (n: string) => n.charAt(0) + n.slice(1).toLowerCase();
  const same = left === a.score && right === b.score;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Log the score"
      actions={
        <Button
          block
          loading={log.isPending}
          disabled={same}
          onPress={() => log.mutate({ a: left, b: right }, { onSuccess: onClose })}
          testID="log-score-save"
        >
          SAVE THE SCORE
        </Button>
      }
    >
      <View className="gap-space-5 pb-space-3">
        <Stepper label={name(a.name)} value={left} min={0} max={SCORE_MAX} onChange={setLeft} />
        <Stepper label={name(b.name)} value={right} min={0} max={SCORE_MAX} onChange={setRight} />
        <Text variant="caption" muted>
          {same ? 'This is the score now. Change a side to log it.' : 'Followers see it at once. The final result is confirmed in After.'}
        </Text>
        {log.isError ? <InlineError message={errorMessage(ojoroErrorOf(log.error))} testID="log-score-error" /> : null}
      </View>
    </Sheet>
  );
}

function PostUpdateSheet({ visible, onClose, id }: { visible: boolean; onClose: () => void; id: string }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const post = usePostUpdate(id);
  const key = useRef<string | null>(null);
  const submit = () => {
    const valid = validateUpdate(text, LIVE_UPDATE_MAX_LENGTH);
    if (!valid.ok) {
      setError(valid.error);
      return;
    }
    key.current ??= newIdempotencyKey();
    post.mutate(
      { body: valid.body, key: key.current },
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
      title="Post an update"
      actions={
        <Button block loading={post.isPending} onPress={submit} testID="post-update-send">
          POST
        </Button>
      }
    >
      <View className="gap-space-3 pb-space-3">
        <Input
          label="Update"
          value={text}
          onChangeText={(t) => {
            setText(t);
            if (error) setError(undefined);
          }}
          multiline
          maxLength={LIVE_UPDATE_MAX_LENGTH}
          placeholder="Goal, Marcus. Lights lead 3–2."
          hint={`${text.trim().length} of ${LIVE_UPDATE_MAX_LENGTH}. Followers see it.`}
          error={error}
          testID="post-update-input"
        />
      </View>
    </Sheet>
  );
}

function LiveUnavailable({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const e = ojoroErrorOf(error);
  const gone = !error || e.code === 'activity_not_found';
  return (
    <View className="gap-space-4 px-space-5 pt-space-8" testID="live-unavailable">
      {gone ? (
        <>
          <Text variant="title">We can't find that game.</Text>
          <Text variant="body-sm" muted>
            It may have been removed, or it isn't open to you.
          </Text>
          <View className="self-start">
            <Button variant="secondary" onPress={() => router.replace('/')}>
              BACK TO HOME
            </Button>
          </View>
        </>
      ) : (
        <InlineError message={errorMessage(e)} action="RETRY" onAction={onRetry} testID="screen-error" />
      )}
    </View>
  );
}
