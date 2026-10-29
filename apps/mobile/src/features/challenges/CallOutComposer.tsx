/**
 * CALL OUT (undesigned; kept minimal from the design system; docs/DESIGN_DECISIONS.md, Step 5
 * screens: A). Opened from Compete, and from a profile (`?opponent=<user id>&name=`) or a crew
 * (`?crew=<crew id>&crewName=`). Who (someone you've played with, an open call-out, or a crew), the
 * sport and what it is ("5K"), how it is scored and the distance, when (at least an hour out), the
 * place and course, who can watch, and your line. No stakes, ever.
 *
 * One call-out per CALL OUT tap: the key is made on the tap and reused on every retry.
 */
import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import {
  Button,
  Chip,
  ChipRow,
  DisplayText,
  Input,
  loadingProps,
  Screen,
  Skeleton,
  Stepper,
  Text,
} from '@/design-system';
import { CALL_OUT_MESSAGE_MAX_LENGTH } from '@ojoro/contracts';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { useOnline } from '../activities/data';
import { goBack } from '../activities/ui';
import { usePlaces, useSportCatalog } from '../create/data';
import { useMyCrews, usePlayedWith } from '../crews/data';
import { useMySportIds } from '../home/data';
import { TopBar } from '../plans/parts';
import { DEFAULT_TIME_ZONE } from '../plans/time';
import { InlineError, OfflineNote } from '../profile/states';
import { useCreateCallOut } from './data';
import {
  AUDIENCE_CHOICES,
  composerArgs,
  composerSummary,
  COURSE_MAX,
  defaultScoring,
  hasErrors,
  initialComposer,
  SCORING_CHOICES,
  shortName,
  SIDE_SIZE_MAX,
  SIDE_SIZE_MIN,
  targetField,
  TITLE_MAX,
  validateComposer,
  type ComposerErrors,
  type ComposerState,
  type Target,
} from './logic';
import { Field, WhenChips } from './ui';

export type ComposerParams = {
  opponent?: string | undefined;
  name?: string | undefined;
  crew?: string | undefined;
  crewName?: string | undefined;
};

function initialTarget(p: ComposerParams): Target | null {
  if (p.opponent) return { kind: 'person', id: p.opponent, name: p.name ?? 'Them' };
  if (p.crew) return { kind: 'crew', id: p.crew, name: p.crewName ?? null };
  return null;
}

export function CallOutComposer(params: ComposerParams) {
  const auth = useAuth();
  const userId = auth.status === 'signed-in' ? auth.session.user.id : null;
  const online = useOnline();
  const fixed = initialTarget(params);
  const [form, setForm] = useState<ComposerState>(() => initialComposer(fixed));
  const [errors, setErrors] = useState<ComposerErrors>({});
  const [now] = useState(() => new Date());
  const sports = useSportCatalog();
  const places = usePlaces();
  const mySports = useMySportIds(userId).data;
  const people = usePlayedWith();
  const crews = useMyCrews();
  const create = useCreateCallOut();

  const place = (places.data ?? []).find((p) => p.id === form.placeId) ?? null;
  const tz = place?.time_zone ?? DEFAULT_TIME_ZONE;
  const myAdminCrews = (crews.data ?? []).filter(
    (c) => (c.role === 'owner' || c.role === 'admin') && c.crew_id !== (form.target?.kind === 'crew' ? form.target.id : null),
  );
  const sportRows = useMemo(() => {
    const all = sports.data ?? [];
    const myIds = mySports ?? [];
    return [...myIds.map((id) => all.find((s) => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s), ...all.filter((s) => !myIds.includes(s.id))];
  }, [sports.data, mySports]);
  const placeRows = (places.data ?? []).filter((p) => !form.sportId || (p.sport_ids ?? []).includes(form.sportId));
  const field = targetField(form.scoring);

  const set = (patch: Partial<ComposerState>) => {
    setForm((f) => ({ ...f, ...patch }));
    if (hasErrors(errors)) setErrors({});
  };

  const submit = () => {
    const at = new Date();
    const e = validateComposer(form, at, tz);
    setErrors(e);
    const args = composerArgs(form, at, tz);
    if (!args) return;
    create.send(args, {
      onSuccess: (id) => {
        if (id) router.replace(`/challenge/${id}` as Href);
      },
    });
  };

  const sendError = create.error ? ojoroErrorOf(create.error) : null;
  const loading = sports.isPending || places.isPending;

  return (
    <Screen situation="live" scroll gutter={false}>
      <TopBar title="CALL OUT" onBack={() => goBack('/compete' as Href)} backIcon="close" backLabel="Close" />
      <View className="gap-space-8 px-space-5 pb-space-10 pt-space-4" testID="call-out-composer">
        <View className="gap-space-3">
          <DisplayText size="lg" accessibilityRole="header">
            {fixed?.kind === 'person'
              ? `CALL OUT ${shortName(fixed.name).toUpperCase()}.`
              : fixed?.kind === 'crew' && fixed.name
                ? `CALL OUT ${fixed.name.toUpperCase()}.`
                : 'CALL SOMEONE OUT.'}
          </DisplayText>
          <Text variant="body">Set the rules. They accept, counter or pass. Bragging rights only.</Text>
        </View>

        {!online ? (
          <OfflineNote dataUpdatedAt={places.dataUpdatedAt} what="the places" extra="Sending a Call-Out needs a connection." />
        ) : null}

        {loading ? (
          <View className="gap-space-4" {...loadingProps('Loading the form')}>
            <Skeleton kind="text" lines={2} />
            <Skeleton kind="strip" />
            <Skeleton kind="strip" />
          </View>
        ) : sports.isError && !sports.data ? (
          <InlineError message={errorMessage(ojoroErrorOf(sports.error))} action="RETRY" onAction={() => void sports.refetch()} />
        ) : (
          <>
            {fixed ? null : (
              <Field
                label="WHO"
                error={errors.target}
                hint="People you've played with, or an open Call-Out anyone nearby can accept."
                testID="composer-who"
              >
                <ChipRow label="Who" layout="wrap">
                  <Chip selected={form.target?.kind === 'open'} onPress={() => set({ target: { kind: 'open' } })} testID="who-open">
                    Anyone
                  </Chip>
                  {myAdminCrews.length > 0 ? (
                    <Chip
                      selected={form.target?.kind === 'crew'}
                      onPress={() => set({ target: { kind: 'crew', id: null, name: null } })}
                      testID="who-crew"
                    >
                      Any crew
                    </Chip>
                  ) : null}
                  {(people.data ?? []).map((p) => (
                    <Chip
                      key={p.user_id}
                      selected={form.target?.kind === 'person' && form.target.id === p.user_id}
                      onPress={() => set({ target: { kind: 'person', id: p.user_id, name: p.display_name } })}
                      testID={`who-${p.user_id}`}
                    >
                      {p.display_name}
                    </Chip>
                  ))}
                </ChipRow>
                {people.data && people.data.length === 0 ? (
                  <Text variant="caption" muted>
                    Nobody you&apos;ve played with yet. Send an open Call-Out, or play a game first.
                  </Text>
                ) : null}
              </Field>
            )}

            {form.target?.kind === 'crew' ? (
              <View className="gap-space-6">
                <Field label="YOUR CREW" error={errors.crew} hint="Only a crew's owner or admins can call out for it." testID="composer-crew">
                  {myAdminCrews.length > 0 ? (
                    <ChipRow label="Your crew" layout="wrap">
                      {myAdminCrews.map((c) => (
                        <Chip key={c.crew_id} selected={form.myCrewId === c.crew_id} onPress={() => set({ myCrewId: c.crew_id })} testID={`crew-${c.crew_id}`}>
                          {c.name}
                        </Chip>
                      ))}
                    </ChipRow>
                  ) : (
                    <Text variant="body-sm">You don&apos;t run a crew yet. Crew Call-Outs come from a crew&apos;s owner or admins.</Text>
                  )}
                </Field>
                <Stepper
                  label="A side"
                  hint="People on each side."
                  value={form.sideSize}
                  min={SIDE_SIZE_MIN}
                  max={SIDE_SIZE_MAX}
                  onChange={(sideSize) => set({ sideSize })}
                />
              </View>
            ) : null}

            <Field label="SPORT" error={errors.sport} testID="composer-sport">
              <ChipRow label="Sport" layout="wrap">
                {sportRows.map((s) => (
                  <Chip
                    key={s.id}
                    selected={form.sportId === s.id}
                    onPress={() => set({ sportId: s.id, scoring: defaultScoring(s.id), placeId: null })}
                    testID={`sport-${s.id}`}
                  >
                    {s.name}
                  </Chip>
                ))}
              </ChipRow>
            </Field>

            <Input
              label="What it is"
              value={form.title}
              onChangeText={(title) => set({ title })}
              maxLength={TITLE_MAX}
              placeholder="5K"
              hint="Short: 5K, 1v1, first to 3."
              error={errors.title}
              testID="composer-title"
            />

            <Field label="HOW IT'S WON" testID="composer-scoring">
              <ChipRow label="How it's won" layout="wrap">
                {SCORING_CHOICES.map((c) => (
                  <Chip key={c.id} selected={form.scoring === c.id} onPress={() => set({ scoring: c.id })} testID={`scoring-${c.id}`}>
                    {c.label}
                  </Chip>
                ))}
              </ChipRow>
            </Field>

            <Input
              label={field.label}
              value={form.target_text}
              onChangeText={(target_text) => set({ target_text })}
              keyboardType="decimal-pad"
              placeholder={field.placeholder}
              error={errors.target_text}
              testID="composer-target"
            />

            <Field label="WHEN" error={errors.time} testID="composer-when">
              <WhenChips
                dayOffset={form.dayOffset}
                minuteOfDay={form.minuteOfDay}
                onChange={(v) => set(v)}
                now={now}
                timeZone={tz}
                testID="composer"
              />
            </Field>

            <Field label="WHERE (OPTIONAL)" hint="Public places only. The area shows; no addresses." testID="composer-place">
              {placeRows.length > 0 ? (
                <ChipRow label="Place" layout="wrap">
                  {placeRows.map((p) => (
                    <Chip
                      key={p.id}
                      selected={form.placeId === p.id}
                      onPress={() => set({ placeId: form.placeId === p.id ? null : p.id })}
                      testID={`place-${p.id}`}
                    >
                      {p.name}
                    </Chip>
                  ))}
                </ChipRow>
              ) : (
                <Text variant="body-sm" muted>
                  No places for this sport yet. Say where in the course.
                </Text>
              )}
            </Field>

            <Input
              label="Course (optional)"
              value={form.courseNote}
              onChangeText={(courseNote) => set({ courseNote })}
              maxLength={COURSE_MAX}
              placeholder="From the Cartier monument, one loop"
              error={errors.course}
              testID="composer-course"
            />

            <Field label="WHO CAN WATCH" testID="composer-audience">
              <ChipRow label="Who can watch" layout="wrap">
                {AUDIENCE_CHOICES.map((a) => (
                  <Chip key={a.id} selected={form.audience === a.id} onPress={() => set({ audience: a.id })} testID={`audience-${a.id}`}>
                    {a.label}
                  </Chip>
                ))}
              </ChipRow>
              <Text variant="caption" muted>
                {form.audience === 'public'
                  ? 'People can follow, predict and back. Predictions are never money.'
                  : form.audience === 'friends'
                    ? "Only people who've played with you can follow it."
                    : 'Only the people competing see it. No crowd, no poster.'}
              </Text>
            </Field>

            <Input
              label="Your line (optional)"
              value={form.message}
              onChangeText={(message) => set({ message })}
              maxLength={CALL_OUT_MESSAGE_MAX_LENGTH}
              multiline
              placeholder="Saturday. Mount Royal. Bring your legs."
              hint={`${form.message.trim().length} of ${CALL_OUT_MESSAGE_MAX_LENGTH}.`}
              error={errors.message}
              testID="composer-message"
            />

            <View className="gap-space-3">
              {hasErrors(errors) ? <InlineError message="Check the fields marked above." testID="composer-invalid" /> : null}
              {sendError ? (
                <InlineError
                  message={errorMessage(sendError)}
                  testID="composer-error"
                  {...(sendError.code === 'call_out_pending' && sendError.detail
                    ? { action: 'OPEN IT', onAction: () => router.replace(`/challenge/${sendError.detail}` as Href) }
                    : null)}
                />
              ) : null}
              <Button block loading={create.isPending} disabled={!online} onPress={submit} testID="composer-send">
                CALL OUT
              </Button>
              <Text variant="caption" muted className="text-center">
                {composerSummary(form)}
              </Text>
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}
