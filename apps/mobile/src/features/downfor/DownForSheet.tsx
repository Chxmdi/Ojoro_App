/**
 * Say what you're down for. Undesigned (HANDOFF.md, "Creation forms: Down For"): built from Sheet,
 * Chip, Button and the inline error pattern. Sport, when, until when (required), who, how far.
 * Matching can put you straight into a plan; then we open it.
 */
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { Button, Chip, Sheet, Text, useToast } from '@/design-system';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { InlineError, routes } from '../plans/parts';
import { DEFAULT_TIME_ZONE } from '../plans/time';
import { useCreateDownFor, useSports } from './data';
import {
  AUDIENCES,
  downForArgs,
  expiryOptions,
  hasErrors,
  RADIUS_CHOICES,
  validateDownFor,
  windowOptions,
  type DownForErrors,
  type DownForForm,
  type WindowId,
} from './logic';

export type DownForSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Preset sport and window (e.g. TRY AGAIN THIS WEEKEND from an expired plan). */
  initialSportId?: string | null | undefined;
  initialWindowId?: WindowId | undefined;
  /** Your discovery radius, the default distance. */
  defaultRadiusKm?: number | undefined;
  /** Where it was opened from, for analytics. */
  source: string;
};

function Field({ label, error, children }: { label: string; error?: string | undefined; children: ReactNode }) {
  return (
    <View className="gap-space-2" role="group" aria-label={label}>
      <Text variant="label">{label}</Text>
      <View className="flex-row flex-wrap gap-space-2">{children}</View>
      {error ? <InlineError message={error} /> : null}
    </View>
  );
}

export function DownForSheet(props: DownForSheetProps) {
  // Remount the form each time it opens so it starts from the presets and the current time.
  if (!props.visible) return <Sheet title="Say what you're down for" visible={false} onClose={props.onClose} />;
  return <DownForForm {...props} />;
}

function DownForForm({
  visible,
  onClose,
  initialSportId,
  initialWindowId,
  defaultRadiusKm = 3,
  source,
}: DownForSheetProps) {
  const router = useRouter();
  const toast = useToast();
  const sports = useSports();
  const create = useCreateDownFor();
  const [now] = useState(() => new Date());
  const tz = DEFAULT_TIME_ZONE;
  const windows = windowOptions(now, tz);
  const [form, setForm] = useState<DownForForm>(() => {
    const windowId = windows.some((w) => w.id === initialWindowId) ? (initialWindowId ?? null) : (windows[0]?.id ?? null);
    return {
      sportId: initialSportId ?? null,
      windowId,
      expiryId: 'window-end',
      audience: 'public',
      radiusKm: (RADIUS_CHOICES as readonly number[]).includes(defaultRadiusKm) ? defaultRadiusKm : 3,
    };
  });
  const [errors, setErrors] = useState<DownForErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const window = windows.find((w) => w.id === form.windowId);
  const expiries = window ? expiryOptions(window, now, tz) : [];

  const update = (patch: Partial<DownForForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setServerError(null);
  };

  const submit = () => {
    const at = new Date();
    const found = validateDownFor(form, windows, at, tz);
    setErrors(found);
    if (hasErrors(found)) return;
    const rest = downForArgs(form, windows, at, tz);
    if (!rest) return;
    create.tap(rest, {
      onSuccess: (state) => {
        track('cta_tapped', { cta: 'down_for_send', source, sport: rest.p_sport_id, window: form.windowId });
        onClose();
        if (state.matched_plan_id) {
          toast.show({ kind: 'success', message: 'Ojoro matched you into a plan.' });
          router.push(routes.plan(state.matched_plan_id));
        } else {
          toast.show({
            kind: 'success',
            message: state.created === false ? "You're already down for that." : "You're down. It ends on its own.",
          });
        }
      },
      onError: (e) => setServerError(errorMessage(ojoroErrorOf(e))),
    });
  };

  return (
    <Sheet
      title="Say what you're down for"
      visible={visible}
      onClose={onClose}
      actions={
        <View className="gap-space-2">
          {serverError ? <InlineError message={serverError} testID="down-for-error" /> : null}
          <Button variant="commit" block loading={create.isPending} onPress={submit} testID="down-for-send">
            I'M DOWN
          </Button>
          <Text variant="caption" muted className="text-center">
            People near you see that you're down, never where you are. It ends on its own.
          </Text>
        </View>
      }
    >
      <ScrollView style={{ maxHeight: 440 }} contentContainerClassName="gap-space-5 pb-space-2">
        <Field label="Sport" error={errors.sport}>
          {(sports.data ?? []).map((s) => (
            <Chip
              key={s.id}
              selected={form.sportId === s.id}
              onPress={() => update({ sportId: s.id })}
              testID={`down-for-sport-${s.id}`}
            >
              {s.name}
            </Chip>
          ))}
          {sports.isPending ? <Text variant="body-sm" muted>Loading sports</Text> : null}
        </Field>
        <Field label="When" error={errors.window}>
          {windows.map((w) => (
            <Chip
              key={w.id}
              selected={form.windowId === w.id}
              onPress={() => update({ windowId: w.id, expiryId: 'window-end' })}
            >
              {w.label}
            </Chip>
          ))}
        </Field>
        <Field label="Until" error={errors.expiry}>
          {expiries.map((e) => (
            <Chip key={e.id} selected={form.expiryId === e.id} onPress={() => update({ expiryId: e.id })}>
              {e.label}
            </Chip>
          ))}
        </Field>
        <Field label="Who can see it">
          {AUDIENCES.map((a) => (
            <Chip key={a.id} selected={form.audience === a.id} onPress={() => update({ audience: a.id })}>
              {a.label}
            </Chip>
          ))}
        </Field>
        <Field label="How far">
          {RADIUS_CHOICES.map((km) => (
            <Chip key={km} selected={form.radiusKm === km} onPress={() => update({ radiusKm: km })}>
              {`${km} km`}
            </Chip>
          ))}
        </Field>
      </ScrollView>
    </Sheet>
  );
}
