/**
 * Make This a Game in CrewChat (PRD §9.11): the GameSuggestion card, the sheet that asks only what
 * the chat didn't settle (time options, the place or "agree later", how many), and after the tap
 * the crew plan's time poll inline with a link to the plan. Nothing is created until the tap.
 */
import { isRetryable } from '@ojoro/contracts';
import { router, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import {
  Button,
  Chip,
  Divider,
  GameSuggestion,
  Poll,
  Sheet,
  Stepper,
  Text,
  TextButton,
} from '@/design-system';
import { track } from '@/lib/analytics';
import { useUserId } from '@/lib/auth';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { InlineError } from '../activities/ui';
import { usePlanCard, usePlanPoll, useVoteTime, useNow } from '../plans/data';
import { displayStatus, pollClosed, pollModel } from '../plans/planLogic';
import { planWhen } from '../plans/time';
import {
  useDismissSuggestion,
  useMakeThisAGame,
  useSportsCatalog,
  newIdempotencyKey,
  type Suggestion,
} from './data';
import {
  clampCapacity,
  closesText,
  defaultDraft,
  freeLine,
  makeGameNote,
  MAX_CAPACITY,
  MIN_CAPACITY,
  pollQuestion,
  suggestionBody,
  suggestionTitle,
  timeChoiceLabel,
  toggleTime,
  validateDraft,
  type MakeGameDraft,
} from './logic';

type CardProps = {
  crewId: string;
  suggestion: Suggestion;
  timeZone: string;
  online: boolean;
  /** Accepted suggestions can't be dismissed on the server; NOT NOW hides the card here. */
  onHide: () => void;
};

/** The suggestion card. Open: MAKE THIS A GAME opens the sheet. Accepted: it opens the plan. */
export function SuggestionCard({ crewId, suggestion, timeZone, online, onHide }: CardProps) {
  const [asking, setAsking] = useState(false);
  const dismiss = useDismissSuggestion(crewId);
  const accepted = suggestion.status === 'accepted' && !!suggestion.plan_id;
  const shown = useRef(false);
  useEffect(() => {
    if (!shown.current) {
      shown.current = true;
      track('chat_suggestion_shown', { crew_id: crewId, status: suggestion.status });
    }
  }, [crewId, suggestion.status]);

  return (
    <>
      <GameSuggestion
        title={suggestionTitle(suggestion)}
        body={suggestionBody(suggestion)}
        offline={!online}
        onAccept={() => {
          if (accepted) {
            track('make_this_a_game_tapped', { crew_id: crewId, already: true });
            router.push(`/plan/${suggestion.plan_id}` as Href);
          } else {
            track('make_this_a_game_opened', { crew_id: crewId });
            setAsking(true);
          }
        }}
        onDismiss={() => {
          if (accepted) {
            track('chat_suggestion_not_now_tapped', { crew_id: crewId, accepted: true });
            onHide();
          } else dismiss.mutate(suggestion.id);
        }}
        error={dismiss.isError ? errorMessage(ojoroErrorOf(dismiss.error)) : undefined}
        testID="game-suggestion"
      />
      {!accepted ? (
        <MakeGameSheet
          crewId={crewId}
          suggestion={suggestion}
          timeZone={timeZone}
          visible={asking}
          onClose={() => setAsking(false)}
        />
      ) : null}
    </>
  );
}

function MakeGameSheet({
  crewId,
  suggestion,
  timeZone,
  visible,
  onClose,
}: {
  crewId: string;
  suggestion: Suggestion;
  timeZone: string;
  visible: boolean;
  onClose: () => void;
}) {
  const now = new Date();
  const sports = useSportsCatalog();
  const capacityDefault =
    sports.data?.find((s) => s.id === suggestion.sport_id)?.default_capacity ?? 10;
  const [draft, setDraft] = useState<MakeGameDraft>(() => defaultDraft(suggestion, capacityDefault, now));
  const [touchedCapacity, setTouchedCapacity] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const make = useMakeThisAGame(crewId);
  // One key per intention: made on the first tap, reused on retries, dropped after an answer.
  const key = useRef<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (!touchedCapacity) setDraft((d) => ({ ...d, capacity: clampCapacity(capacityDefault) }));
  }, [capacityDefault, touchedCapacity]);
  useEffect(() => {
    if (visible) setError(null);
  }, [visible]);

  const times = useMemo(
    () => [...suggestion.proposed_times].sort((a, b) => Date.parse(a) - Date.parse(b)),
    [suggestion.proposed_times],
  );

  const submit = () => {
    // A second tap while the first is on its way does nothing (the key would make it a no-op anyway).
    if (make.isPending || busy.current) return;
    const check = validateDraft(draft, new Date());
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setError(null);
    key.current ??= newIdempotencyKey();
    busy.current = true;
    make.mutate(
      { suggestionId: suggestion.id, draft, key: key.current },
      {
        onSettled: () => {
          busy.current = false;
        },
        onSuccess: () => {
          key.current = null;
          onClose();
        },
        onError: (e) => {
          const err = ojoroErrorOf(e);
          if (!isRetryable(err)) key.current = null;
          setError(errorMessage(err));
        },
      },
    );
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Make this a game"
      actions={
        <Button block loading={make.isPending} onPress={submit} testID="make-game-confirm">
          MAKE THIS A GAME
        </Button>
      }
    >
      <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
        <View className="gap-space-5 pb-space-3">
          <Text variant="body-sm">{suggestionTitle(suggestion).replace(/\?$/, '.')}</Text>

          <View className="gap-space-2" role="group" aria-label="What time">
            <Divider label="WHAT TIME?" />
            <Text variant="caption" muted>
              Pick one time, or up to four for the crew to vote on.
            </Text>
            <View className="flex-row flex-wrap gap-space-2">
              {times.map((t) => {
                const past = Date.parse(t) <= now.getTime();
                return (
                  <Chip
                    key={t}
                    selected={draft.times.includes(t)}
                    disabled={past}
                    onPress={() => setDraft((d) => ({ ...d, times: toggleTime(d.times, t) }))}
                    testID={`make-game-time-${t}`}
                  >
                    {timeChoiceLabel(t, now, timeZone)}
                  </Chip>
                );
              })}
            </View>
          </View>

          <View className="gap-space-2" role="radiogroup" aria-label="Where">
            <Divider label="WHERE?" />
            <View className="flex-row flex-wrap gap-space-2">
              {suggestion.place_ids.map((placeId, i) => (
                <Chip
                  key={placeId}
                  selected={draft.placeId === placeId}
                  onPress={() => setDraft((d) => ({ ...d, placeId }))}
                  testID={`make-game-place-${i}`}
                >
                  {suggestion.place_names[i] ?? 'A place'}
                </Chip>
              ))}
              <Chip
                selected={draft.placeId === null}
                onPress={() => setDraft((d) => ({ ...d, placeId: null }))}
                testID="make-game-place-later"
              >
                Agree it later
              </Chip>
            </View>
          </View>

          <Stepper
            label="How many"
            hint="Including you. The plan locks GAME ON when it fills."
            value={draft.capacity}
            min={MIN_CAPACITY}
            max={MAX_CAPACITY}
            onChange={(capacity) => {
              setTouchedCapacity(true);
              setDraft((d) => ({ ...d, capacity }));
            }}
          />

          <Text variant="caption" muted>
            {makeGameNote(draft)}
          </Text>
          {error ? <InlineError message={error} testID="make-game-error" /> : null}
        </View>
      </ScrollView>
    </Sheet>
  );
}

/**
 * The crew plan's time poll (CrewChat): the free-time caption, WHAT TIME SATURDAY?, one-tap votes
 * (any crew member), where things stand on the place, and SEE THE PLAN.
 */
export function CrewPlanPoll({ suggestion, timeZone }: { suggestion: Suggestion; timeZone: string }) {
  const planId = suggestion.plan_id!;
  const userId = useUserId();
  const plan = usePlanCard(planId);
  const poll = usePlanPoll(planId, userId);
  const vote = useVoteTime(planId);
  const card = plan.data ?? null;
  const now = useNow([card?.poll_closes_at, card?.deadline_at]);
  const free = freeLine(suggestion, timeZone);

  if (!card) {
    return plan.isError ? (
      <InlineError message={errorMessage(ojoroErrorOf(plan.error))} action="RETRY" onAction={() => void plan.refetch()} />
    ) : null;
  }
  const status = displayStatus(card, now);
  const pm = pollModel(poll.data?.options ?? [], poll.data?.mine ?? null, timeZone);
  const closed = pollClosed(card, status, now);

  return (
    <View className="gap-space-4" testID="crew-plan-poll">
      {pm.options.length >= 2 ? (
        <View className="gap-space-2">
          {free ? (
            <Text variant="body-sm" muted testID="crew-free-line">
              {free}
            </Text>
          ) : null}
          <Poll
            question={pollQuestion(suggestion.day_label)}
            options={pm.options}
            voted={pm.voted}
            closes={closesText(card.poll_closes_at ?? card.deadline_at, now, timeZone)}
            closed={closed}
            {...(closed
              ? null
              : {
                  onVote: (index: number) => {
                    const optionId = pm.ids[index];
                    if (!optionId) return;
                    track('time_voted', { plan_id: planId, from: 'crew_chat' });
                    vote.mutate(optionId);
                  },
                })}
            testID="time-poll"
          />
          {vote.isError ? <InlineError message={errorMessage(ojoroErrorOf(vote.error))} /> : null}
        </View>
      ) : (
        <View className="gap-space-1">
          <Text variant="title-sm">{`${suggestionTitle(suggestion).replace(/\?$/, '')} · ${planWhen(card.starts_at, now, timeZone)}`}</Text>
          <Text variant="body-sm" muted>{`${card.member_count} of ${card.capacity} in.`}</Text>
        </View>
      )}

      <View className="gap-space-1" role="region" aria-label="Where">
        <Text variant="label" muted>
          WHERE
        </Text>
        <Text variant="body-sm" testID="crew-plan-where">
          {card.place_name
            ? card.place_name
            : suggestion.place_names.length > 0
              ? `To be agreed. The chat named ${suggestion.place_names.join(' and ')}.`
              : 'To be agreed.'}
        </Text>
      </View>

      <View className="self-start">
        <TextButton
          onPress={() => {
            track('crew_plan_opened', { plan_id: planId });
            router.push(`/plan/${planId}` as Href);
          }}
          testID="see-the-plan"
        >
          SEE THE PLAN
        </TextButton>
      </View>
    </View>
  );
}
