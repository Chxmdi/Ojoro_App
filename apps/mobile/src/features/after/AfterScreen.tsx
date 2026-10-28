/**
 * After (design-handoff/screens/After.png, after): GOOD GAME., confirm or suggest a fix to the
 * score with the participant threshold as progress, moments from the people who played, the window
 * closing time, SEE THE RECAP. Results and moments are reportable from here.
 */
import * as ImagePicker from 'expo-image-picker';
import { router, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import {
  Button,
  DisplayText,
  Divider,
  haptics,
  Image,
  Input,
  Progress,
  Screen,
  Sheet,
  Stepper,
  Text,
  TextButton,
  VerificationBadge,
} from '@/design-system';
import { track } from '@/lib/analytics';
import { useUserId } from '@/lib/auth';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';
import { useReportBlock } from '@/features/safety';

import {
  timeZoneOf,
  useActivityCard,
  useActivityRealtime,
  useActivityRoster,
  useIntentKey,
  useNow,
  useOnline,
  usePlace,
} from '../activities/data';
import { displayName, myAttendance, statusOf, type ActivityCard, type RosterRow } from '../activities/model';
import {
  ErrorState,
  InlineError,
  LoadingState,
  NotFoundState,
  OfflineNote,
  QueuedNote,
  ScreenHeader,
} from '../activities/ui';
import {
  useAddMoment,
  useConfirmResult,
  useMomentActions,
  useMoments,
  useProposeResult,
  useResult,
  type MomentView,
  type PickedPhoto,
} from './data';
import {
  afterOverline,
  altTextError,
  confirmedBy,
  goodGameLine,
  justVerified,
  momentsNote,
  photoCredit,
  resultAction,
  scoreError,
  scoreOverline,
  SCORE_MAX,
  thresholdLine,
  type Proposal,
} from './logic';

export function AfterScreen({ id }: { id: string }) {
  const now = useNow(30_000);
  useActivityRealtime(id);
  const cardQ = useActivityCard(id);
  const card = cardQ.data ?? null;
  const placeQ = usePlace(id, card?.place_id);
  const tz = timeZoneOf(placeQ.data);

  return (
    <Screen situation="after" scroll gutter={false}>
      <ScreenHeader
        overline={card ? afterOverline(card.after_closes_at, now, tz) : 'AFTER'}
        fallback={`/activity/${id}` as Href}
      />
      {cardQ.isPending ? (
        <LoadingState label="Loading After" kinds={['object', 'text', 'text']} />
      ) : !card ? (
        cardQ.isError ? (
          <ErrorState error={cardQ.error} onRetry={() => void cardQ.refetch()} />
        ) : (
          <NotFoundState />
        )
      ) : (
        <AfterBody card={card} now={now} dataUpdatedAt={cardQ.dataUpdatedAt} />
      )}
    </Screen>
  );
}

function minutesOf(card: ActivityCard): number {
  const start = Date.parse(card.live_at ?? card.starts_at);
  const end = Date.parse(card.ended_at ?? card.ends_at);
  return Math.max(0, Math.round((end - start) / 60_000));
}

function AfterBody({ card, now, dataUpdatedAt }: { card: ActivityCard; now: Date; dataUpdatedAt: number }) {
  const userId = useUserId();
  const online = useOnline();
  const status = statusOf(card, now);
  const me = myAttendance(card);
  const iPlayed = me === 'checked-in';
  const inGame = iPlayed || me === 'player' || card.host_id === userId;
  const open = status === 'after' || status === 'live';
  const players = card.checked_in_count;
  const rosterQ = useActivityRoster(card.id);
  const roster = rosterQ.data ?? [];
  const reportBlock = useReportBlock();

  if (status === 'confirmed' || status === 'cancelled') {
    return (
      <View className="gap-space-4 px-space-5 pt-space-6" testID="after-not-yet">
        <DisplayText size="md">{status === 'cancelled' ? 'CALLED OFF.' : 'NOT OVER YET.'}</DisplayText>
        <Text variant="body">
          {status === 'cancelled'
            ? 'This game was called off, so there is no score or photos.'
            : 'After opens when the game ends. Then the players confirm the score and add photos.'}
        </Text>
        <Button variant="secondary" block onPress={() => router.push(`/activity/${card.id}` as Href)}>
          BACK TO THE GAME
        </Button>
      </View>
    );
  }

  return (
    <View className="gap-space-8 px-space-5 pb-space-8 pt-space-6" testID="after-screen">
      {!online ? <OfflineNote dataUpdatedAt={dataUpdatedAt} /> : null}
      <View accessibilityLabel="Good game" className="gap-space-3">
        <DisplayText size="xl">GOOD GAME.</DisplayText>
        <Text variant="body">{goodGameLine(minutesOf(card), players, status !== 'complete')}</Text>
      </View>

      <ResultCard
        card={card}
        roster={roster}
        userId={userId}
        iPlayed={iPlayed}
        open={open}
        players={players}
        onReport={(proposalId, proposerName) =>
          reportBlock.open({ subjectKind: 'result', subjectId: proposalId, personName: proposerName })
        }
      />

      {inGame ? (
        <Moments
          card={card}
          roster={roster}
          userId={userId}
          canAdd={iPlayed && open}
          players={players}
          online={online}
          onReport={(m, authorName) =>
            reportBlock.open({ subjectKind: 'moment', subjectId: m.id, personName: authorName, personId: m.authorId })
          }
        />
      ) : (
        <Text variant="body-sm" muted testID="moments-private">
          Photos from this game are shared with the people who played only.
        </Text>
      )}

      <Button block onPress={() => router.push(`/activity/${card.id}/recap` as Href)} testID="see-recap">
        SEE THE RECAP
      </Button>
      <View className="items-center">
        <MoreButtonRow
          onPress={() =>
            reportBlock.open({
              subjectKind: 'activity',
              subjectId: card.id,
              personName: roster.find((r) => r.is_host)?.display_name ?? 'the host',
              ...(card.host_id !== userId ? { personId: card.host_id } : null),
            })
          }
        />
      </View>
      {reportBlock.sheet}
    </View>
  );
}

function MoreButtonRow({ onPress }: { onPress: () => void }) {
  return (
    <TextButton onPress={onPress} accessibilityLabel="Report this game or block the host">
      REPORT THIS GAME
    </TextButton>
  );
}

function nameOf(roster: readonly RosterRow[], userId: string): string | null {
  const r = roster.find((x) => x.user_id === userId);
  return r ? displayName(r) : null;
}

function ResultCard({
  card,
  roster,
  userId,
  iPlayed,
  open,
  players,
  onReport,
}: {
  card: ActivityCard;
  roster: RosterRow[];
  userId: string;
  iPlayed: boolean;
  open: boolean;
  players: number;
  onReport: (proposalId: string, proposerName: string) => void;
}) {
  const resultQ = useResult(card.id, userId);
  const propose = useProposeResult(card.id);
  const confirm = useConfirmResult(card.id);
  const proposeIntent = useIntentKey();
  const confirmIntent = useIntentKey();
  const proposal: Proposal | null = resultQ.data?.proposal ?? null;
  const action = resultAction({ proposal, iConfirmed: !!resultQ.data?.iConfirmed, iPlayed, open });
  const [editing, setEditing] = useState(false);
  const [a, setA] = useState(0);
  const [b, setB] = useState(0);
  const teamA = card.team_a_label ?? 'Team A';
  const teamB = card.team_b_label ?? 'Team B';

  // The verified moment: haptic and event once, when this screen sees it happen.
  const lastStatus = useRef<string | null>(null);
  const status = proposal?.status ?? null;
  useEffect(() => {
    if (resultQ.isPending) return;
    if (justVerified(lastStatus.current, status)) {
      void haptics.resultVerified();
      track('result_verified', { activity_id: card.id });
    }
    lastStatus.current = status;
  }, [status, resultQ.isPending, card.id]);

  const startEdit = () => {
    setA(proposal?.team_a_score ?? 0);
    setB(proposal?.team_b_score ?? 0);
    setEditing(true);
  };
  const sendScore = () => {
    if (scoreError(a, b)) return;
    propose.mutate(
      { key: proposeIntent.key(), a, b },
      {
        onSettled: (_d, e) => proposeIntent.settle(e),
        onSuccess: () => setEditing(false),
      },
    );
  };
  const doConfirm = () => {
    if (!proposal) return;
    confirm.mutate(
      { key: confirmIntent.key(), proposalId: proposal.id },
      {
        onSettled: (_d, e) => confirmIntent.settle(e),
        onSuccess: (s) => {
          if (s.status === 'verified') {
            void haptics.resultVerified();
            track('result_verified', { activity_id: card.id });
            lastStatus.current = 'verified';
          }
        },
      },
    );
  };

  const error = propose.error ?? confirm.error;
  const proposer = proposal ? nameOf(roster, proposal.proposed_by) : null;

  return (
    <View accessibilityLabel="Confirm the result" className="gap-space-4 bg-surface-raised p-space-5" testID="result-card">
      {resultQ.isPending ? (
        <LoadingState label="Loading the score" kinds={['text']} />
      ) : resultQ.isError && !resultQ.data ? (
        <InlineError
          message={errorMessage(ojoroErrorOf(resultQ.error))}
          action="RETRY"
          onAction={() => void resultQ.refetch()}
        />
      ) : (
        <>
          <Text variant="overline">
            {proposal ? scoreOverline(proposer, proposal.proposed_by === userId) : 'FINAL SCORE'}
          </Text>

          {editing || action === 'log' ? (
            <View className="gap-space-4" testID="score-editor">
              {action === 'log' && !editing ? (
                <Text variant="body-sm">Nobody has logged the score yet. You played, so you can.</Text>
              ) : null}
              <Stepper label={teamA} value={a} min={0} max={SCORE_MAX} onChange={setA} />
              <Stepper label={teamB} value={b} min={0} max={SCORE_MAX} onChange={setB} />
              <View className="flex-row flex-wrap gap-space-2">
                <Button loading={propose.isPending && !propose.isPaused} onPress={sendScore} testID="send-score">
                  {action === 'log' ? 'LOG THE SCORE' : 'SEND THE FIX'}
                </Button>
                {editing ? (
                  <Button variant="secondary" onPress={() => setEditing(false)}>
                    CANCEL
                  </Button>
                ) : null}
              </View>
              {editing ? (
                <Text variant="caption" muted>
                  Your fix replaces the logged score, and confirmations start again from yours.
                </Text>
              ) : null}
            </View>
          ) : proposal ? (
            <>
              <View
                className="flex-row items-end justify-between"
                accessible
                accessibilityLabel={`${teamA} ${proposal.team_a_score}, ${teamB} ${proposal.team_b_score}`}
                testID="score"
              >
                <View>
                  <Text variant="label">{teamA.toUpperCase()}</Text>
                  <DisplayText size="lg">{String(proposal.team_a_score)}</DisplayText>
                </View>
                <Text variant="display-sm" muted>
                  –
                </Text>
                <View className="items-end">
                  <Text variant="label">{teamB.toUpperCase()}</Text>
                  <DisplayText size="lg">{String(proposal.team_b_score)}</DisplayText>
                </View>
              </View>

              {action === 'verified' ? (
                <View className="gap-space-2" testID="result-verified">
                  <VerificationBadge level="result" />
                  <Text variant="caption" muted>
                    {confirmedBy(proposal.confirmations_count, players)}
                  </Text>
                </View>
              ) : (
                <>
                  {action === 'confirm' ? (
                    <>
                      <Text variant="title-sm">Is this right?</Text>
                      <View className="flex-row flex-wrap gap-space-2">
                        <Button
                          loading={confirm.isPending && !confirm.isPaused}
                          onPress={doConfirm}
                          testID="confirm-result"
                        >
                          CONFIRM
                        </Button>
                        <Button variant="secondary" onPress={startEdit} testID="suggest-fix">
                          SUGGEST A FIX
                        </Button>
                      </View>
                    </>
                  ) : action === 'confirmed' ? (
                    <View className="flex-row flex-wrap items-center gap-space-3">
                      <Text variant="title-sm" testID="you-confirmed">
                        You confirmed this.
                      </Text>
                      <TextButton onPress={startEdit}>SUGGEST A FIX</TextButton>
                    </View>
                  ) : action === 'watch' ? (
                    <Text variant="body-sm" muted>
                      Only the people who checked in confirm the score.
                    </Text>
                  ) : (
                    <Text variant="body-sm" muted>
                      After has closed. The score stays as logged.
                    </Text>
                  )}
                  <Progress
                    value={proposal.confirmations_count}
                    max={Math.max(players, 1)}
                    label={`${proposal.confirmations_count} of ${players} confirmed`}
                  />
                  <Text variant="caption" muted testID="threshold-line">
                    {thresholdLine(proposal, players)}
                  </Text>
                </>
              )}
            </>
          ) : (
            <Text variant="body-sm" muted testID="no-score">
              {open ? 'Nobody has logged the score yet.' : 'No score was logged.'}
            </Text>
          )}

          {propose.isPaused ? <QueuedNote what="Your score" /> : null}
          {confirm.isPaused ? <QueuedNote what="Your confirmation" /> : null}
          {error && !propose.isPaused && !confirm.isPaused ? (
            <InlineError message={errorMessage(ojoroErrorOf(error))} testID="result-error" />
          ) : null}
          {proposal && proposal.proposed_by !== userId ? (
            <View className="self-start">
              <TextButton onPress={() => onReport(proposal.id, proposer ?? 'the player')}>REPORT THE SCORE</TextButton>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

function Moments({
  card,
  roster,
  userId,
  canAdd,
  players,
  online,
  onReport,
}: {
  card: ActivityCard;
  roster: RosterRow[];
  userId: string;
  canAdd: boolean;
  players: number;
  online: boolean;
  onReport: (m: MomentView, authorName: string) => void;
}) {
  const momentsQ = useMoments(card.id, userId, true);
  const add = useAddMoment(card.id, userId);
  const { untag, remove } = useMomentActions(card.id);
  const [picked, setPicked] = useState<PickedPhoto | null>(null);
  const [alt, setAlt] = useState('');
  const [altTouched, setAltTouched] = useState(false);
  const [pickProblem, setPickProblem] = useState<string | null>(null);
  const moments = momentsQ.data ?? [];

  const pick = async () => {
    setPickProblem(null);
    if (!online) {
      setPickProblem("You're offline. Add photos when you're back online.");
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setPickProblem('Adding a photo needs access to your photos. Turn it on for Ojoro, then try again.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    setAlt('');
    setAltTouched(false);
    add.reset();
    setPicked({ uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName });
  };
  const altError = altTouched ? altTextError(alt) : null;
  const submit = () => {
    setAltTouched(true);
    if (!picked || altTextError(alt)) return;
    add.mutate({ photo: picked, alt }, { onSuccess: () => setPicked(null) });
  };

  return (
    <View accessibilityLabel="Moments" className="gap-space-3" testID="moments">
      <Divider label={`MOMENTS · ${moments.length}`} />
      {momentsQ.isPending ? (
        <LoadingState label="Loading photos" kinds={['text']} />
      ) : momentsQ.isError && !momentsQ.data ? (
        <InlineError
          message={errorMessage(ojoroErrorOf(momentsQ.error))}
          action="RETRY"
          onAction={() => void momentsQ.refetch()}
        />
      ) : moments.length === 0 ? (
        <Text variant="body-sm" muted testID="moments-empty">
          No photos yet.
        </Text>
      ) : (
        <View className="flex-row flex-wrap justify-between gap-y-space-3">
          {moments.map((m) => {
            const author = nameOf(roster, m.authorId);
            const mine = m.authorId === userId;
            return (
              <View key={m.id} className="w-[48.5%] gap-space-1" testID="moment">
                <Image src={m.url ?? undefined} alt={m.alt} ratio="1:1" caption={photoCredit(author, mine)} />
                <View className="flex-row flex-wrap gap-x-space-2">
                  {m.taggedMe ? (
                    <TextButton onPress={() => untag.mutate(m.id)} accessibilityLabel="Untag me from this photo">
                      UNTAG ME
                    </TextButton>
                  ) : null}
                  {mine ? (
                    <TextButton
                      onPress={() => remove.mutate({ id: m.id, path: m.path })}
                      accessibilityLabel="Remove your photo"
                    >
                      REMOVE
                    </TextButton>
                  ) : (
                    <TextButton onPress={() => onReport(m, author ?? 'the player')} accessibilityLabel="Report this photo">
                      REPORT
                    </TextButton>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}
      {untag.isError || remove.isError ? (
        <InlineError message={errorMessage(ojoroErrorOf(untag.error ?? remove.error))} />
      ) : null}
      {canAdd ? (
        <Button variant="secondary" block onPress={() => void pick()} testID="add-photos">
          ADD PHOTOS
        </Button>
      ) : null}
      {pickProblem ? <InlineError message={pickProblem} /> : null}
      <Text variant="caption" muted>
        {momentsNote(players)}
      </Text>

      <Sheet
        title="Describe the photo"
        visible={!!picked}
        onClose={() => setPicked(null)}
        actions={
          <Button block loading={add.isPending} onPress={submit} testID="add-photo-submit">
            ADD PHOTO
          </Button>
        }
      >
        <View className="gap-space-4">
          {picked ? <Image src={picked.uri} alt={alt.trim() || 'The photo you picked'} ratio="4:5" /> : null}
          <Input
            label="What's happening in it"
            value={alt}
            onChangeText={setAlt}
            onBlur={() => setAltTouched(true)}
            hint="Read aloud to people who can't see it. Only the people who played see the photo."
            error={altError ?? undefined}
            testID="alt-input"
          />
          {add.isError ? <InlineError message={errorMessage(ojoroErrorOf(add.error))} /> : null}
        </View>
      </Sheet>
    </View>
  );
}
