/**
 * COUNTER (undesigned; docs/DESIGN_DECISIONS.md, Step 5 screens: A): a Sheet that starts from the
 * call-out's terms and sends only what changed (time, distance or the course), with an optional
 * line. Sides, format and scoring don't change in a counter (counter_call_out). The new call-out
 * goes back to the challenger; this one reads COUNTERED.
 */
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { Button, Chip, ChipRow, Input, Sheet, Text } from '@/design-system';
import { CALL_OUT_MESSAGE_MAX_LENGTH } from '@ojoro/contracts';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { usePlaces } from '../create/data';
import { DEFAULT_TIME_ZONE } from '../plans/time';
import { InlineError } from '../profile/states';
import { useCounterCallOut } from './data';
import {
  COURSE_MAX,
  counterArgs,
  counterDraft,
  shortName,
  targetField,
  TITLE_MAX,
  type CallOutFacts,
  type CounterDraft,
  type CounterResult,
} from './logic';
import { Field, WhenChips } from './ui';

export function CounterSheet({
  visible,
  onClose,
  callOut,
  online,
  onCountered,
}: {
  visible: boolean;
  onClose: () => void;
  callOut: CallOutFacts;
  online: boolean;
  onCountered: (counterId: string | null) => void;
}) {
  const tz = callOut.time_zone ?? DEFAULT_TIME_ZONE;
  const [now, setNow] = useState(() => new Date());
  const [draft, setDraft] = useState<CounterDraft>(() => counterDraft(callOut, now));
  const [errors, setErrors] = useState<Extract<CounterResult, { ok: false }>['errors']>({});
  const counter = useCounterCallOut(callOut.id);
  const places = usePlaces();
  const placeRows = useMemo(
    () => (places.data ?? []).filter((p) => !callOut.sport_id || (p.sport_ids ?? []).includes(callOut.sport_id)),
    [places.data, callOut.sport_id],
  );
  const field = targetField(callOut.scoring);

  useEffect(() => {
    if (!visible) return;
    const at = new Date();
    setNow(at);
    setDraft(counterDraft(callOut, at));
    setErrors({});
    counter.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start from the call-out's terms on open only.
  }, [visible]);

  const set = (patch: Partial<CounterDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setErrors({});
  };

  const submit = () => {
    const result = counterArgs(callOut, draft, new Date());
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    counter.counter(result.args, { onSuccess: onCountered });
  };

  const challenger = shortName(callOut.challenger_name, callOut.format === 'crew_vs_crew');

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Counter the Call-Out"
      actions={
        <View className="gap-space-2">
          {errors.nothing ? <InlineError message={errors.nothing} testID="counter-nothing" /> : null}
          {counter.isError ? (
            <InlineError message={errorMessage(ojoroErrorOf(counter.error))} testID="counter-error" />
          ) : null}
          <Button block loading={counter.isPending} disabled={!online} onPress={submit} testID="counter-send">
            SEND THE COUNTER
          </Button>
          <Text variant="caption" muted className="text-center">
            {online
              ? `${challenger} gets your terms and can accept, counter or pass.`
              : 'Offline. Countering needs a connection.'}
          </Text>
        </View>
      }
    >
      <View className="gap-space-6 pb-space-3" testID="counter-sheet">
        <Field label="WHEN" error={errors.time} testID="counter-when">
          <WhenChips
            dayOffset={draft.dayOffset}
            minuteOfDay={draft.minuteOfDay}
            onChange={(v) => set(v)}
            now={now}
            timeZone={tz}
            testID="counter"
          />
        </Field>
        <Input
          label="What it is"
          value={draft.title}
          onChangeText={(title) => set({ title })}
          maxLength={TITLE_MAX}
          placeholder="5K"
          error={errors.title}
          testID="counter-title"
        />
        <Input
          label={field.label}
          value={draft.target_text}
          onChangeText={(target_text) => set({ target_text })}
          keyboardType="decimal-pad"
          placeholder={field.placeholder}
          error={errors.target_text}
          testID="counter-target"
        />
        {placeRows.length > 0 ? (
          <Field label="WHERE" hint="Public places only. The area shows; no addresses." testID="counter-place">
            <ChipRow label="Place" layout="wrap">
              {placeRows.map((p) => (
                <Chip key={p.id} selected={draft.placeId === p.id} onPress={() => set({ placeId: p.id })} testID={`counter-place-${p.id}`}>
                  {p.name}
                </Chip>
              ))}
            </ChipRow>
          </Field>
        ) : null}
        <Input
          label="Course (optional)"
          value={draft.courseNote}
          onChangeText={(courseNote) => set({ courseNote })}
          maxLength={COURSE_MAX}
          placeholder="From the Cartier monument, one loop"
          error={errors.course}
          testID="counter-course"
        />
        <Input
          label="Your line (optional)"
          value={draft.message}
          onChangeText={(message) => set({ message })}
          maxLength={CALL_OUT_MESSAGE_MAX_LENGTH}
          multiline
          placeholder="Ten works better. Same loop."
          hint={`${draft.message.trim().length} of ${CALL_OUT_MESSAGE_MAX_LENGTH}.`}
          error={errors.message}
          testID="counter-message"
        />
      </View>
    </Sheet>
  );
}
