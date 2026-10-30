import type { GoalKind, GoalView } from '@ojoro/contracts';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { Button, Chip, ChipRow, Input, Sheet, Text, TextButton, useToast } from '@/design-system';
import { useProfileSports } from '@/features/profile/data';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { useClearGoal, useSetGoal } from './data';
import {
  dateOptions,
  draftFrom,
  fieldOfDetail,
  targetField,
  validateGoal,
  type GoalDraft,
  type GoalField,
} from './logic';

const KINDS: { kind: GoalKind; label: string }[] = [
  { kind: 'personal_best', label: 'A personal best' },
  { kind: 'sessions', label: 'Sessions' },
  { kind: 'places', label: 'New places' },
];

/**
 * SET A GOAL / CHANGE (not designed; built from Sheet, Chip and Input). One goal at a time (PRD
 * §9.17): what kind, the sport and distance for a personal best, the target, an optional month end,
 * (who sees it is in Settings → Who sees what). CLEAR GOAL ends the active one. Progress is never typed in: it comes from the
 * Passport.
 */
export function GoalSheet({
  visible,
  onClose,
  userId,
  goal,
  from,
}: {
  visible: boolean;
  onClose: () => void;
  userId: string;
  goal: GoalView | null;
  from: 'you' | 'passport';
}) {
  const toast = useToast();
  const sports = useProfileSports(userId, visible);
  const mySports = useMemo(() => sports.data ?? [], [sports.data]);
  const mainSport = mySports.find((s) => s.is_main)?.sport_id ?? mySports[0]?.sport_id ?? null;
  const [draft, setDraft] = useState<GoalDraft>(() => draftFrom(goal, mainSport));
  const [errors, setErrors] = useState<Partial<Record<GoalField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const setGoal = useSetGoal(userId);
  const clearGoal = useClearGoal(userId);

  // Each opening is a new intention: fresh draft, fresh idempotency key.
  useEffect(() => {
    if (!visible) return;
    setDraft(draftFrom(goal, mainSport));
    setErrors({});
    setFormError(null);
    setGoal.begin();
    track('goal_sheet_opened', { from, has_goal: Boolean(goal) });
    // Only on open: later goal refetches must not reset what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Sports arrive after the sheet opens: pick the main one if none is picked yet.
  useEffect(() => {
    if (visible && draft.kind === 'personal_best' && !draft.sportId && mainSport) {
      setDraft((d) => ({ ...d, sportId: mainSport }));
    }
  }, [visible, mainSport, draft.kind, draft.sportId]);

  const dates = useMemo(() => dateOptions(new Date(), 6, undefined, goal?.target_date ?? null), [goal?.target_date]);
  const field = targetField(draft);
  const update = (patch: Partial<GoalDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setErrors({});
    setFormError(null);
  };

  const save = () => {
    const checked = validateGoal(draft);
    if (!checked.ok) {
      setErrors({ [checked.field]: checked.message });
      return;
    }
    setGoal.save(checked.args, {
      onSuccess: () => {
        toast.show({ kind: 'success', message: goal ? 'Goal changed.' : 'Goal set.' });
        onClose();
      },
      onError: (e) => {
        const err = ojoroErrorOf(e);
        const at = err.code === 'goal_invalid' ? fieldOfDetail(err.detail) : err.code === 'sport_unknown' ? 'sport' : null;
        if (at && at !== 'kind') setErrors({ [at]: errorMessage(err) });
        else setFormError(errorMessage(err));
      },
    });
  };

  const clear = () => {
    clearGoal.mutate(undefined, {
      onSuccess: () => {
        toast.show({ kind: 'success', message: 'Goal cleared.' });
        onClose();
      },
      onError: (e) => setFormError(errorMessage(ojoroErrorOf(e))),
    });
  };

  const sportChips = (optional: boolean) => (
    <View className="gap-space-2">
      <Text variant="label">{optional ? 'SPORT (OPTIONAL)' : 'SPORT'}</Text>
      {mySports.length === 0 ? (
        <Text variant="body-sm" muted>
          {sports.isPending ? 'Loading your sports.' : 'Add a sport to your profile first.'}
        </Text>
      ) : (
        <ChipRow label="Sport" layout="wrap" testID="goal-sport">
          {optional ? (
            <Chip selected={!draft.sportId} onPress={() => update({ sportId: null })}>
              Any sport
            </Chip>
          ) : null}
          {mySports.map((s) => (
            <Chip key={s.sport_id} selected={draft.sportId === s.sport_id} onPress={() => update({ sportId: s.sport_id })}>
              {s.sport_name}
            </Chip>
          ))}
        </ChipRow>
      )}
      {errors.sport ? <FieldError message={errors.sport} /> : null}
    </View>
  );

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={goal ? 'Change your goal' : 'Set a goal'}
      actions={
        <View className="gap-space-2">
          <Button variant="primary" block onPress={save} loading={setGoal.isPending} testID="goal-save">
            {goal ? 'SAVE GOAL' : 'SET GOAL'}
          </Button>
          {goal ? (
            <TextButton onPress={clear} className="self-center" testID="goal-clear">
              CLEAR GOAL
            </TextButton>
          ) : null}
        </View>
      }
    >
      <View className="gap-space-6" testID="goal-sheet">
        <Text variant="body-sm" muted>
          One goal at a time. Ojoro counts it from your Passport and suggests games that move it on.
        </Text>

        <View className="gap-space-2">
          <Text variant="label">GOAL</Text>
          <ChipRow label="Kind of goal" layout="wrap" testID="goal-kind">
            {KINDS.map((k) => (
              <Chip
                key={k.kind}
                selected={draft.kind === k.kind}
                onPress={() =>
                  update({
                    kind: k.kind,
                    target: '',
                    sportId: k.kind === 'places' ? null : k.kind === 'personal_best' ? (draft.sportId ?? mainSport) : draft.sportId,
                  })
                }
                testID={`goal-kind-${k.kind}`}
              >
                {k.label}
              </Chip>
            ))}
          </ChipRow>
        </View>

        {draft.kind === 'personal_best' ? (
          <>
            {sportChips(false)}
            <Input
              label="Distance or event"
              hint="Like 5K or 10K. Results come from Challenges in it."
              value={draft.discipline}
              onChangeText={(t) => update({ discipline: t })}
              autoCapitalize="characters"
              maxLength={24}
              error={errors.discipline}
              testID="goal-discipline"
            />
            <View className="gap-space-2">
              <Text variant="label">BEAT</Text>
              <ChipRow label="Scoring" layout="wrap">
                <Chip selected={draft.scoring === 'time'} onPress={() => update({ scoring: 'time', target: '' })}>
                  A time
                </Chip>
                <Chip selected={draft.scoring === 'distance'} onPress={() => update({ scoring: 'distance', target: '' })}>
                  A distance
                </Chip>
              </ChipRow>
            </View>
          </>
        ) : draft.kind === 'sessions' ? (
          sportChips(true)
        ) : null}

        <Input
          label={field.label}
          hint={field.hint}
          value={draft.target}
          onChangeText={(t) => update({ target: t })}
          keyboardType={field.numeric ? 'decimal-pad' : 'numbers-and-punctuation'}
          placeholder={draft.kind === 'personal_best' && draft.scoring === 'time' ? '22:00' : undefined}
          error={errors.target}
          testID="goal-target"
        />

        <View className="gap-space-2">
          <Text variant="label">BY</Text>
          <ChipRow label="By when" layout="wrap" testID="goal-date">
            <Chip selected={!draft.date} onPress={() => update({ date: null })}>
              No date
            </Chip>
            {dates.map((d) => (
              <Chip key={d.value} selected={draft.date === d.value} onPress={() => update({ date: d.value })}>
                {d.label}
              </Chip>
            ))}
          </ChipRow>
          {errors.date ? <FieldError message={errors.date} /> : null}
        </View>

        {formError ? <FieldError message={formError} /> : null}
      </View>
    </Sheet>
  );
}

/** An error in words with the alert rule (never colour only). */
function FieldError({ message }: { message: string }) {
  return (
    <View className="border-l-4 border-text pl-space-3" accessibilityLiveRegion="polite" aria-live="polite">
      <Text variant="body-sm">{`Error: ${message}`}</Text>
    </View>
  );
}
