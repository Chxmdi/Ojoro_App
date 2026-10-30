/**
 * HostSeries (`/host/[programId]/series/[id]`, HostSeries.png, PRD §13 recurring activities and
 * templates). Edit a recurring series once and every future session follows: name, place, start,
 * length, players, level, repeat days, end date, joining window, who gets in, price and refunds;
 * skip or restore the next 4 sessions; save, or save as a template. Calm.
 *
 * Dates and times are picked from chips in a sheet (the app's existing pattern: PlanForm, quiet
 * hours); Expo UI pickers would need a new dependency (docs/DESIGN_DECISIONS.md, Step 6 SCR-HOST-A).
 * Saving sends only what changed, against the version that was loaded (`seriesChanges`).
 */
import { REFUND_WINDOW_LABEL, LEVEL_LABEL, seriesChanges, type HostLevel, type HostRefundWindow, type SeriesView } from '@ojoro/contracts';
import { type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import {
  Badge,
  Button,
  Chip,
  ChipRow,
  DisplayText,
  Divider,
  Icon,
  Input,
  Screen,
  Sheet,
  Stepper,
  Strip,
  StripList,
  Switch,
  Text,
  TextButton,
  useToast,
  type IconName,
} from '@/design-system';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { useOnline } from '../activities/data';
import { goBack, InlineError, LoadingState, OfflineNote, ScreenHeader } from '../activities/ui';
import { usePlaces } from '../create/data';
import { useSaveTemplate, useSeriesSessions, useSeriesView, useSkipSession, useUpdateSeries } from './data';
import {
  durationChoices,
  durationLabel,
  formSettings,
  opensChoices,
  opensHint,
  opensLabel,
  playersHint,
  saveNote,
  seriesForm,
  seriesIntro,
  sessionHeadline,
  sessionRow,
  skippingHint,
  startTimeChoices,
  toggleDay,
  untilChoices,
  untilLabel,
  validateSeries,
  wallClock,
  zonedDate,
  type SeriesErrors,
  type SeriesForm,
} from './logic';
import { HostUnavailable } from './ui';

const LEVELS: HostLevel[] = ['beginners', 'mixed', 'competitive'];
const REFUNDS: HostRefundWindow[] = ['any_time', 'hours_12', 'hours_24', 'never'];
const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const DAY_LABEL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

type Picker = 'place' | 'start' | 'length' | 'until' | 'opens' | null;

export function HostSeriesScreen({ programId, seriesId }: { programId: string; seriesId: string }) {
  const online = useOnline();
  const toast = useToast();
  const series = useSeriesView(programId, seriesId);
  const loaded = series.data ?? null;
  const sessions = useSeriesSessions(programId, seriesId, !!loaded);
  const update = useUpdateSeries(programId, seriesId);
  const skip = useSkipSession(programId, seriesId);
  const template = useSaveTemplate(programId, seriesId);
  const places = usePlaces();
  const [form, setForm] = useState<SeriesForm | null>(null);
  const [base, setBase] = useState<SeriesView | null>(null);
  const [errors, setErrors] = useState<SeriesErrors>({});
  const [picker, setPicker] = useState<Picker>(null);
  const [confirmSkip, setConfirmSkip] = useState<{ id: string; date: string; people: number } | null>(null);
  const [skipReason, setSkipReason] = useState('');
  const now = new Date();

  useEffect(() => {
    track('host_series_viewed', { program_id: programId, series_id: seriesId });
  }, [programId, seriesId]);

  // The form starts from the first load, and again after a save or a reload; realtime refetches
  // never overwrite what the host is typing.
  useEffect(() => {
    if (loaded && !form) {
      setForm(seriesForm(loaded));
      setBase(loaded);
    }
  }, [loaded, form]);

  const changes = useMemo(() => {
    if (!form || !base) return {};
    return seriesChanges(base as never, formSettings(form));
  }, [form, base]);
  const dirty = Object.keys(changes).length > 0;
  const conflict = update.isError && ojoroErrorOf(update.error).code === 'series_version_conflict';

  const set = (patch: Partial<SeriesForm>) => {
    setForm((f) => (f ? { ...f, ...patch } : f));
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(patch)) delete next[k as keyof SeriesErrors];
      return next;
    });
  };

  const reload = async () => {
    const fresh = await series.refetch();
    if (fresh.data) {
      setForm(seriesForm(fresh.data));
      setBase(fresh.data);
      update.reset();
    }
  };

  const save = () => {
    if (!form || !base) return;
    const found = validateSeries(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    update.mutate(
      { changes, version: base.version },
      {
        onSuccess: (result) => {
          const told = result.people_notified ?? 0;
          toast.show({
            kind: 'success',
            message: `Saved. ${told > 0 ? `${told === 1 ? '1 person' : `${told} people`} told what changed.` : 'Nobody needed telling.'}`,
          });
          setForm(null);
          goBack(`/host/${programId}` as Href);
        },
      },
    );
  };

  const saveTemplate = () => {
    if (!form) return;
    template.mutate(form.name.trim() || (base?.name ?? 'Series'), {
      onSuccess: (t) => toast.show({ kind: 'success', message: `Saved as a template: ${t.name}.` }),
    });
  };

  const tz = loaded?.time_zone ?? 'America/Toronto';
  const placeRows = (places.data ?? []).filter((p) => !loaded || (p.sport_ids ?? []).includes(loaded.sport_id));
  const placeName =
    form && base && form.place_id !== base.place_id
      ? (places.data ?? []).find((p) => p.id === form.place_id)?.name ?? 'New place'
      : (base?.place_name ?? '');

  return (
    <Screen situation="calm" scroll gutter={false}>
      <ScreenHeader overline="SERIES" fallback={`/host/${programId}` as Href} />
      {series.isPending && !loaded ? (
        <LoadingState label="Loading the series" kinds={['text', 'strip', 'strip', 'strip']} />
      ) : !loaded || !form || !base ? (
        <HostUnavailable what="series" error={series.error} onRetry={() => void series.refetch()} />
      ) : (
        <View className="gap-space-10 px-space-5 pb-space-10 pt-space-4" testID="host-series">
          {!online ? <OfflineNote dataUpdatedAt={series.dataUpdatedAt} extra="Saving and skipping wait until you're back." /> : null}
          <View className="gap-space-3">
            <DisplayText size="lg" accessibilityRole="header">
              {sessionHeadline(form.name || base.name)}
            </DisplayText>
            <Text variant="body">{seriesIntro(base, now)}</Text>
            <View className="flex-row flex-wrap gap-space-2">
              {base.host_verified ? <Badge tone="verified">HOST VERIFIED</Badge> : null}
              <Badge>{`${base.sessions_run} ${base.sessions_run === 1 ? 'SESSION' : 'SESSIONS'} RUN`}</Badge>
            </View>
          </View>

          <View className="gap-space-5" role="region" aria-label="The session">
            <Divider kind="strong" label="THE SESSION" />
            <Input
              label="Name"
              value={form.name}
              onChangeText={(name) => set({ name })}
              error={errors.name}
              maxLength={60}
              testID="series-name"
            />
            <PickField
              label="Place"
              icon="pin"
              value={placeName}
              hint="People see the exact pitch once they're in."
              onPress={() => setPicker('place')}
              testID="series-place"
            />
            <View className="flex-row gap-space-3">
              <PickField
                className="flex-1"
                label="Starts"
                icon="clock"
                value={wallClock(form.start_time)}
                onPress={() => setPicker('start')}
                testID="series-start"
              />
              <PickField
                className="flex-1"
                label="Length"
                value={durationLabel(form.duration_minutes)}
                onPress={() => setPicker('length')}
                testID="series-length"
              />
            </View>
            <Stepper
              label="Players"
              hint={playersHint(form.capacity)}
              value={form.capacity}
              min={2}
              max={100}
              onChange={(capacity) => set({ capacity })}
            />
            <View className="gap-[10px]">
              <Text variant="title-sm">Level</Text>
              <ChipRow label="Level" layout="wrap">
                {LEVELS.map((l) => (
                  <Chip key={l} selected={form.level === l} onPress={() => set({ level: l })} testID={`series-level-${l}`}>
                    {LEVEL_LABEL[l]}
                  </Chip>
                ))}
              </ChipRow>
            </View>
          </View>

          <View className="gap-space-4" role="region" aria-label="Repeats">
            <Divider kind="strong" label="REPEATS" />
            <ChipRow label="Days" layout="wrap">
              {DAYS.map((d) => (
                <Chip
                  key={d}
                  selected={form.repeat_days.includes(d)}
                  onPress={() => set({ repeat_days: toggleDay(form.repeat_days, d) })}
                  testID={`series-day-${d}`}
                >
                  {DAY_LABEL[d - 1]}
                </Chip>
              ))}
            </ChipRow>
            {errors.repeat_days ? <InlineError message={errors.repeat_days} /> : null}
            <PickField
              label="Weekly until"
              value={untilLabel(form.until_on)}
              hint={skippingHint(base.skipped_upcoming)}
              onPress={() => setPicker('until')}
              testID="series-until"
            />
            <PickField
              label="Opens for joining"
              value={opensLabel(form.join_opens_days)}
              hint={opensHint(form, base.members_early_hours)}
              onPress={() => setPicker('opens')}
              testID="series-opens"
            />
          </View>

          <View role="region" aria-label="Who gets in">
            <Divider kind="strong" label="WHO GETS IN" />
            <View>
              <Switch
                label="Approve first-timers"
                description="People who've played with you before join straight away. New faces wait for your OK."
                value={form.approval_required}
                onValueChange={(approval_required) => set({ approval_required })}
              />
            </View>
            <View>
              <Switch
                label="Waitlist that fills itself"
                description="When someone drops, the next person is in and told straight away. Stops 2 hours before kick-off."
                value={form.waitlist_auto_fill}
                onValueChange={(waitlist_auto_fill) => set({ waitlist_auto_fill })}
              />
            </View>
            <View>
              <Switch
                label="Members first"
                description="Monthly members can join before it opens to everyone."
                value={form.members_first}
                onValueChange={(members_first) => set({ members_first })}
              />
            </View>
          </View>

          <View className="gap-space-4" role="region" aria-label="Price and cancelling">
            <Divider kind="strong" label="PRICE & CANCELLING" />
            <View className="flex-row gap-space-3">
              <Input
                className="flex-1"
                label="Drop-in"
                value={form.price}
                onChangeText={(price) => set({ price })}
                error={errors.price}
                inputMode="decimal"
                testID="series-price"
              />
              <Input
                className="flex-1"
                label="Members"
                value={form.member_price}
                onChangeText={(member_price) => set({ member_price })}
                error={errors.member_price}
                testID="series-member-price"
              />
            </View>
            <View className="gap-[10px]">
              <Text variant="title-sm">Full refund if they cancel</Text>
              <ChipRow label="Refund window" layout="wrap">
                {REFUNDS.map((r) => (
                  <Chip key={r} selected={form.refund_window === r} onPress={() => set({ refund_window: r })} testID={`series-refund-${r}`}>
                    {REFUND_WINDOW_LABEL[r]}
                  </Chip>
                ))}
              </ChipRow>
              <Text variant="caption" muted>
                If their spot gets filled from the waitlist, they're refunded whatever the timing. Nobody pays through Ojoro yet:
                payments aren't connected, and Ojoro's service fee isn't set.
              </Text>
            </View>
          </View>

          <View className="gap-space-1" role="region" aria-label="Next sessions">
            <Divider label="NEXT 4 SESSIONS" />
            {sessions.isPending ? (
              <LoadingState label="Loading the next sessions" kinds={['strip', 'strip']} />
            ) : sessions.isError ? (
              <InlineError message={errorMessage(ojoroErrorOf(sessions.error))} action="RETRY" onAction={() => void sessions.refetch()} />
            ) : (sessions.data ?? []).length === 0 ? (
              <Text variant="body-sm" muted className="py-space-4">
                No sessions coming up. Check the days and the end date.
              </Text>
            ) : (
              <StripList>
                {(sessions.data ?? []).map((s) => {
                  const row = sessionRow(s, tz, now);
                  return (
                    <Strip
                      key={s.session_id}
                      leading={
                        <View>
                          <DisplayText size="xs" muted={row.skipped}>
                            {row.day}
                          </DisplayText>
                          <Text variant="caption" muted>
                            {row.date}
                          </Text>
                        </View>
                      }
                      leadingLabel={row.date}
                      title={row.title}
                      titleVariant="title-sm"
                      meta={row.meta}
                      accessible={false}
                      trailing={
                        <TextButton
                          accessibilityLabel={row.actionLabel}
                          disabled={!online || skip.isPending}
                          onPress={() => {
                            if (row.skipped) skip.mutate({ sessionId: s.session_id, skip: false });
                            else if (s.in_count > 0) {
                              setSkipReason('');
                              setConfirmSkip({ id: s.session_id, date: row.date, people: s.in_count });
                            }
                            else skip.mutate({ sessionId: s.session_id, skip: true });
                          }}
                          testID={`series-session-${s.occurs_on}-${row.action.toLowerCase()}`}
                        >
                          {row.action}
                        </TextButton>
                      }
                      testID={`series-session-${s.occurs_on}`}
                    />
                  );
                })}
              </StripList>
            )}
            {skip.isError ? <InlineError message={errorMessage(ojoroErrorOf(skip.error))} /> : null}
          </View>

          <View className="gap-space-3" role="region" aria-label="Save">
            {conflict ? (
              <InlineError
                message="Someone else saved this series while you were editing. Reload to see their changes, then make yours again."
                action="RELOAD"
                onAction={() => void reload()}
                testID="series-conflict"
              />
            ) : update.isError ? (
              <InlineError message={errorMessage(ojoroErrorOf(update.error))} testID="series-save-error" />
            ) : null}
            {Object.keys(errors).length > 0 ? (
              <InlineError message="Some settings need a look before saving. They're marked above." />
            ) : null}
            <Button block onPress={save} disabled={!online || !dirty || conflict} loading={update.isPending} testID="series-save">
              SAVE CHANGES
            </Button>
            <Button variant="ghost" block onPress={saveTemplate} disabled={!online} loading={template.isPending} testID="series-template">
              SAVE AS A TEMPLATE
            </Button>
            {template.isError ? <InlineError message={errorMessage(ojoroErrorOf(template.error))} /> : null}
            <Text variant="caption" muted className="text-center">
              {dirty ? saveNote(base) : 'Nothing changed yet.'}
            </Text>
          </View>
        </View>
      )}

      {form ? (
        <>
          <PickSheet
            visible={picker === 'place'}
            title="Place"
            onClose={() => setPicker(null)}
            options={placeRows.map((p) => ({ key: p.id, label: p.name }))}
            selected={form.place_id}
            onPick={(place_id) => set({ place_id })}
          />
          <PickSheet
            visible={picker === 'start'}
            title="Starts"
            onClose={() => setPicker(null)}
            options={startTimeChoices(form.start_time).map((t) => ({ key: t, label: wallClock(t) }))}
            selected={form.start_time}
            onPick={(start_time) => set({ start_time })}
          />
          <PickSheet
            visible={picker === 'length'}
            title="Length"
            onClose={() => setPicker(null)}
            options={durationChoices(form.duration_minutes).map((m) => ({ key: String(m), label: durationLabel(m) }))}
            selected={String(form.duration_minutes)}
            onPick={(m) => set({ duration_minutes: Number(m) })}
          />
          <PickSheet
            visible={picker === 'until'}
            title="Weekly until"
            onClose={() => setPicker(null)}
            options={untilChoices(form.until_on, zonedDate(now, tz)).map((d) => ({ key: d ?? 'none', label: untilLabel(d) }))}
            selected={form.until_on ?? 'none'}
            onPick={(d) => set({ until_on: d === 'none' ? null : d })}
          />
          <PickSheet
            visible={picker === 'opens'}
            title="Opens for joining"
            onClose={() => setPicker(null)}
            options={opensChoices(form.join_opens_days).map((d) => ({ key: String(d), label: opensLabel(d) }))}
            selected={String(form.join_opens_days)}
            onPick={(d) => set({ join_opens_days: Number(d) })}
          />
        </>
      ) : null}
      <Sheet
        visible={!!confirmSkip}
        title={`Skip ${confirmSkip?.date.toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) ?? ''}`}
        onClose={() => setConfirmSkip(null)}
        actions={
          <>
            <Button
              block
              onPress={() => {
                if (confirmSkip) {
                  const reason = skipReason.trim();
                  skip.mutate({ sessionId: confirmSkip.id, skip: true, reason: reason || undefined });
                }
                setConfirmSkip(null);
              }}
              testID="skip-confirm"
            >
              SKIP IT
            </Button>
            <Button variant="ghost" block onPress={() => setConfirmSkip(null)} testID="skip-cancel">
              KEEP IT
            </Button>
          </>
        }
      >
        <View className="gap-space-4">
          <Text variant="body">
            {confirmSkip
              ? `${confirmSkip.people === 1 ? '1 person is' : `${confirmSkip.people} people are`} in. They're told it's off and keep their place if you restore it.`
              : ''}
          </Text>
          <Input
            label="Why (optional)"
            hint="What the people already in are told, like “Field booked for a tournament”."
            value={skipReason}
            onChangeText={setSkipReason}
            maxLength={120}
            testID="skip-reason"
          />
        </View>
      </Sheet>
    </Screen>
  );
}

/** A field that opens a choice sheet: the Input's look (label, sunk well, rule), pressable. */
function PickField({
  label,
  value,
  hint,
  icon,
  onPress,
  className,
  testID,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
  icon?: IconName;
  onPress: () => void;
  className?: string;
  testID?: string;
}) {
  return (
    <View className={['gap-space-2', className].filter(Boolean).join(' ')}>
      <Text variant="label" accessible={false}>
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        accessibilityHint={hint ? `${hint} Opens the choices.` : 'Opens the choices.'}
        onPress={onPress}
        className="min-h-[44px] flex-row items-center gap-space-2 rounded-t-[2px] border-b-2 border-line-strong bg-surface-sunk px-space-3 py-space-3"
        testID={testID}
      >
        {icon ? <Icon name={icon} size={20} /> : null}
        <Text variant="body" className="flex-1">
          {value}
        </Text>
      </Pressable>
      {hint ? (
        <Text variant="body-sm" muted>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function PickSheet({
  visible,
  title,
  options,
  selected,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: { key: string; label: string }[];
  selected: string;
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      <ChipRow label={title} layout="wrap">
        {options.map((o) => (
          <Chip
            key={o.key}
            selected={o.key === selected}
            onPress={() => {
              onPick(o.key);
              onClose();
            }}
            testID={`pick-${o.key}`}
          >
            {o.label}
          </Chip>
        ))}
      </ChipRow>
    </Sheet>
  );
}
