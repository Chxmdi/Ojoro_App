/**
 * QUICK PLAN and ACTIVITY (undesigned; HANDOFF.md "Creation forms"). One `create_plan` form built
 * from Chip rows, Stepper and Input, with errors in words under each part. The exact meeting point
 * is for people in the plan only. Activity adds host details; "repeats" has no backend, so it isn't
 * offered. On success the plan opens.
 */
import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import {
  Button,
  Chip,
  ChipRow,
  DisplayText,
  Divider,
  Input,
  loadingProps,
  Screen,
  Skeleton,
  Stepper,
  Text,
  useToast,
} from '@/design-system';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { useMySportIds } from '../home/data';
import { useOnline } from '../plans/data';
import { ErrorState, InlineError, routes, TopBar } from '../plans/parts';
import { DEFAULT_TIME_ZONE } from '../plans/time';
import { OfflineNote } from '../profile/states';
import { formTimeFrom } from '../places/logic';
import { useCreatePlan, usePlaces, useSportCatalog } from './data';
import {
  AUDIENCE_CHOICES,
  CAPACITY_MAX,
  CAPACITY_MIN,
  dayChoices,
  DURATION_CHOICES,
  hasPlanErrors,
  initialPlanForm,
  planArgs,
  planSummary,
  timeChoicesFor,
  validatePlanForm,
  type PlanFormErrors,
  type PlanFormState,
  type PlanKind,
} from './planForm';

const TZ = DEFAULT_TIME_ZONE;

function Field({
  label,
  error,
  hint,
  children,
  testID,
}: {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  children: ReactNode;
  testID?: string;
}) {
  return (
    <View className="gap-space-2" role="group" aria-label={label} testID={testID}>
      <Text variant="label">{label}</Text>
      {hint ? (
        <Text variant="caption" muted>
          {hint}
        </Text>
      ) : null}
      {children}
      {error ? <InlineError message={error} testID={`${testID ?? 'field'}-error`} /> : null}
    </View>
  );
}

export function PlanFormScreen({
  kind,
  placeId = null,
  sportId = null,
  startsAt = null,
}: {
  kind: PlanKind;
  /** Prefilled place (CREATE ACTIVITY HERE on Place, CREATE HERE on Pulse). */
  placeId?: string | null;
  /** Prefilled sport, with a place. */
  sportId?: string | null;
  /** Suggested start (Place's busiest hour today), used when it fits the form's choices. */
  startsAt?: string | null;
}) {
  const auth = useAuth();
  const userId = auth.status === 'signed-in' ? auth.session.user.id : null;
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const sports = useSportCatalog();
  const places = usePlaces();
  const mine = useMySportIds(userId);
  const create = useCreatePlan();
  const [now] = useState(() => new Date());
  const [form, setForm] = useState<PlanFormState>(() => {
    const time = formTimeFrom(startsAt, now, TZ);
    const fits = time && timeChoicesFor(time.dayOffset, now, TZ).some((t) => t.minute === time.minuteOfDay);
    return { ...initialPlanForm(), placeId, sportId, ...(fits ? time : null) };
  });
  const [capacityTouched, setCapacityTouched] = useState(false);
  const [errors, setErrors] = useState<PlanFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const activity = kind === 'activity';

  // A prefilled sport takes its default capacity once the catalogue loads.
  const prefillSport = sportId ? sports.data?.find((s) => s.id === sportId) : undefined;
  useEffect(() => {
    if (!prefillSport) return;
    setForm((f) =>
      f.sportId === prefillSport.id
        ? { ...f, capacity: Math.min(CAPACITY_MAX, Math.max(CAPACITY_MIN, prefillSport.default_capacity)) }
        : f,
    );
  }, [prefillSport]);

  const set = (patch: Partial<PlanFormState>) => {
    setForm((f) => ({ ...f, ...patch }));
    setSubmitError(null);
    if (hasPlanErrors(errors)) setErrors({});
  };

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/create'));

  const myIds = mine.data ?? [];
  const sportRows = [
    ...myIds.map((id) => sports.data?.find((s) => s.id === id)).filter((s): s is NonNullable<typeof s> => Boolean(s)),
    ...(sports.data ?? []).filter((s) => !myIds.includes(s.id)),
  ];
  const forSport = (places.data ?? []).filter((p) => !form.sportId || (p.sport_ids ?? []).includes(form.sportId));
  const placeRows = forSport.length > 0 ? forSport : (places.data ?? []);
  const placeFits = (id: string | null, sport: string) =>
    !!id && (places.data ?? []).some((p) => p.id === id && (p.sport_ids ?? []).includes(sport));
  const days = dayChoices(now, TZ);
  const times = timeChoicesFor(form.dayOffset, now, TZ);
  const dayText = days.find((d) => d.offset === form.dayOffset)?.label ?? 'Today';

  const submit = () => {
    const at = new Date();
    const problems = validatePlanForm(form, kind, at, TZ);
    setErrors(problems);
    if (hasPlanErrors(problems)) {
      track('plan_form_invalid', { kind, fields: Object.keys(problems).join(',') });
      setSubmitError('Fix the parts marked above, then start it.');
      return;
    }
    const args = planArgs(form, kind, at, TZ);
    if (!args) return;
    track('plan_form_submitted', { kind, sport: args.p_sport_id, capacity: args.p_capacity, audience: form.audience });
    create.tap(args, {
      onSuccess: (state) => {
        if (!state.plan_id) return;
        toast.show({ kind: 'success', message: "Plan started. You're in." });
        router.replace(routes.plan(state.plan_id));
      },
      onError: (e) => setSubmitError(errorMessage(ojoroErrorOf(e))),
    });
  };

  const loading = sports.isPending || places.isPending;
  const failed = (sports.isError && !sports.data) || (places.isError && !places.data);

  return (
    <Screen situation="calm" scroll gutter={false}>
      <TopBar title={activity ? 'CREATE · ACTIVITY' : 'CREATE · QUICK PLAN'} onBack={leave} />
      <View className="gap-space-8 px-space-5 pb-space-10 pt-space-4" testID="plan-form">
        <View className="gap-space-3">
          <DisplayText size="lg" accessibilityRole="header">
            {activity ? 'SET UP THE GAME.' : "WHAT'S THE PLAN?"}
          </DisplayText>
          <Text variant="body">
            {activity
              ? 'You host. Add the details people ask about before they say yes.'
              : 'A sport, a time and a place. People nearby see it and say I’M DOWN.'}
          </Text>
        </View>

        {!online ? (
          <OfflineNote dataUpdatedAt={places.dataUpdatedAt} what="the places" extra="Starting a plan needs a connection." />
        ) : null}

        {loading ? (
          <View className="gap-space-4" {...loadingProps('Loading the form')}>
            <Skeleton kind="text" lines={2} />
            <Skeleton kind="strip" />
            <Skeleton kind="strip" />
          </View>
        ) : failed ? (
          <ErrorState
            error={ojoroErrorOf(sports.error ?? places.error)}
            onRetry={() => {
              void sports.refetch();
              void places.refetch();
            }}
          />
        ) : (
          <>
            <Field label="SPORT" error={errors.sport} testID="field-sport">
              <ChipRow label="Sport" layout="wrap">
                {sportRows.map((s) => (
                  <Chip
                    key={s.id}
                    selected={form.sportId === s.id}
                    onPress={() =>
                      set({
                        sportId: s.id,
                        // A prefilled place stays when it is for this sport too.
                        placeId: placeFits(form.placeId, s.id) ? form.placeId : null,
                        ...(capacityTouched ? null : { capacity: Math.min(CAPACITY_MAX, Math.max(CAPACITY_MIN, s.default_capacity)) }),
                      })
                    }
                    testID={`sport-${s.id}`}
                  >
                    {s.name}
                  </Chip>
                ))}
              </ChipRow>
            </Field>

            <Field label="WHEN" error={errors.time} testID="field-time">
              <ChipRow label="Day">
                {days.map((d) => (
                  <Chip
                    key={d.offset}
                    selected={form.dayOffset === d.offset}
                    onPress={() => set({ dayOffset: d.offset, minuteOfDay: null })}
                    testID={`day-${d.offset}`}
                  >
                    {d.label}
                  </Chip>
                ))}
              </ChipRow>
              {times.length > 0 ? (
                <ChipRow label="Start time">
                  {times.map((t) => (
                    <Chip
                      key={t.minute}
                      selected={form.minuteOfDay === t.minute}
                      onPress={() => set({ minuteOfDay: t.minute })}
                      testID={`time-${t.minute}`}
                    >
                      {t.label}
                    </Chip>
                  ))}
                </ChipRow>
              ) : (
                <Text variant="body-sm">Too late to gather people today. Pick tomorrow or later.</Text>
              )}
            </Field>

            <Field label="WHERE" error={errors.place} hint="Public places only. Your area shows; your address never does." testID="field-place">
              <ChipRow label="Place" layout="wrap">
                {placeRows.map((p) => (
                  <Chip key={p.id} selected={form.placeId === p.id} onPress={() => set({ placeId: p.id })} testID={`place-${p.id}`}>
                    {p.name}
                  </Chip>
                ))}
              </ChipRow>
            </Field>

            <View className="gap-space-2">
              <Stepper
                label="Capacity"
                hint="It locks at this many. That's GAME ON."
                value={form.capacity}
                min={CAPACITY_MIN}
                max={CAPACITY_MAX}
                onChange={(capacity) => {
                  setCapacityTouched(true);
                  set({ capacity });
                }}
              />
              {errors.capacity ? <InlineError message={errors.capacity} /> : null}
            </View>

            <Field label="WHO CAN SEE IT" testID="field-audience">
              <ChipRow label="Who can see it" layout="wrap">
                {AUDIENCE_CHOICES.map((a) => (
                  <Chip key={a.id} selected={form.audience === a.id} onPress={() => set({ audience: a.id })} testID={`audience-${a.id}`}>
                    {a.label}
                  </Chip>
                ))}
              </ChipRow>
            </Field>

            <Input
              label="Meeting point (optional)"
              value={form.meetingPoint}
              onChangeText={(meetingPoint) => set({ meetingPoint })}
              placeholder="North pitch, by the lights"
              hint="Only people in the plan see this. Everyone else sees the place."
              error={errors.meetingPoint}
              maxLength={140}
              testID="meeting-point"
            />

            {activity ? (
              <View className="gap-space-6" role="region" aria-label="Host details">
                <Divider label="HOST DETAILS" />
                <Input
                  label="Title (optional)"
                  value={form.title}
                  onChangeText={(title) => set({ title })}
                  placeholder="Thursday 7-a-side"
                  error={errors.title}
                  maxLength={70}
                  testID="activity-title"
                />
                <Field label="HOW LONG" testID="field-duration">
                  <ChipRow label="How long" layout="wrap">
                    {DURATION_CHOICES.map((m) => (
                      <Chip
                        key={m}
                        selected={form.durationMinutes === m}
                        onPress={() => set({ durationMinutes: form.durationMinutes === m ? null : m })}
                      >
                        {`${m} min`}
                      </Chip>
                    ))}
                  </ChipRow>
                </Field>
                <View className="flex-row gap-space-3">
                  <View className="flex-1">
                    <Input label="Team A" value={form.teamA} onChangeText={(teamA) => set({ teamA })} placeholder="Lights" maxLength={30} />
                  </View>
                  <View className="flex-1">
                    <Input label="Team B" value={form.teamB} onChangeText={(teamB) => set({ teamB })} placeholder="Darks" maxLength={30} />
                  </View>
                </View>
                <Input
                  label="Cost per person (optional)"
                  value={form.cost}
                  onChangeText={(cost) => set({ cost })}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  hint="Shown on the plan. Payments aren't in Ojoro yet; settle it at the game."
                  error={errors.cost}
                  testID="activity-cost"
                />
                <Input label="Kit (optional)" value={form.kit} onChangeText={(kit) => set({ kit })} placeholder="Bring a light and a dark shirt" maxLength={120} />
                <Input label="Level (optional)" value={form.level} onChangeText={(level) => set({ level })} placeholder="Easy pace" maxLength={40} />
              </View>
            ) : null}

            <View className="gap-space-3">
              {submitError ? <InlineError message={submitError} testID="plan-form-error" /> : null}
              <Button block loading={create.isPending} disabled={!online} onPress={submit} testID="plan-form-submit">
                {activity ? 'START THE ACTIVITY' : 'START THE PLAN'}
              </Button>
              <Text variant="caption" muted className="text-center">
                {planSummary(form, dayText, now, TZ)}
              </Text>
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}
