/**
 * Settings → Notifications (undesigned; PRD §9.19 granular controls). The privacy and blocked
 * settings patterns: a back button, a display title, a sentence, then switches that save as you
 * tap. Quiet hours (on, start, end), lock-screen details (off by default), push per type and the
 * objects you muted with UNMUTE. In-app Updates always show everything; these govern pushes.
 */
import type { NotificationType } from '@ojoro/contracts';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import {
  Chip,
  ChipRow,
  DisplayText,
  Divider,
  IconButton,
  loadingProps,
  Screen,
  Skeleton,
  Strip,
  StripList,
  Switch,
  Text,
  TextButton,
  useToast,
} from '@/design-system';
import { InlineError, OfflineNote, useIsOnline } from '@/features/profile/states';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { DEFAULT_TIME_ZONE } from '../plans/time';
import { useMutes, useNotificationPrefs, useSetPrefs, useSetType, useUnmute, type PrefsChange } from './data';
import {
  hhmm,
  muteKindLabel,
  muteUntilLabel,
  pushOn,
  QUIET_ENDS,
  QUIET_STARTS,
  quietOptions,
  quietTime,
  TYPE_SETTINGS,
} from './logic';

export function NotificationSettingsScreen() {
  const auth = useAuth();
  const userId = auth.status === 'signed-in' ? auth.session.user.id : null;
  const online = useIsOnline();
  const toast = useToast();
  const prefs = useNotificationPrefs();
  const mutes = useMutes(userId);
  const setPrefs = useSetPrefs();
  const setType = useSetType();
  const unmute = useUnmute();
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    track('screen_viewed', { screen: 'settings_notifications' });
  }, []);

  const p = prefs.data;
  const tz = p?.time_zone ?? DEFAULT_TIME_ZONE;
  const disabled = !online;

  const savePrefs = (change: PrefsChange, what: string) => {
    setProblem(null);
    if (change.p_quiet_start !== undefined && hhmm(change.p_quiet_start) === hhmm(p?.quiet_end)) {
      setProblem('Quiet hours need different start and end times.');
      return;
    }
    if (change.p_quiet_end !== undefined && hhmm(change.p_quiet_end) === hhmm(p?.quiet_start)) {
      setProblem('Quiet hours need different start and end times.');
      return;
    }
    track('notification_setting_changed', { setting: what });
    setPrefs.mutate(change, {
      onSuccess: () => toast.show({ kind: 'success', message: 'Saved.' }),
      onError: (e) => {
        const err = ojoroErrorOf(e);
        const message =
          err.code === 'invalid_argument' ? 'Quiet hours need different start and end times.' : errorMessage(err);
        setProblem(message);
        toast.show({ kind: 'error', message });
      },
    });
  };

  const saveType = (type: NotificationType, push: boolean) => {
    track('notification_type_changed', { type, push });
    setType.mutate(
      { type, push },
      {
        onSuccess: () => toast.show({ kind: 'success', message: 'Saved.' }),
        onError: (e) => toast.show({ kind: 'error', message: errorMessage(ojoroErrorOf(e)) }),
      },
    );
  };

  return (
    <Screen situation="calm" scroll gutter={false}>
      <View className="flex-row items-center pl-space-2 pt-space-2">
        <IconButton
          icon="back"
          label="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/you'))}
        />
      </View>
      <View className="gap-space-8 px-space-5 pb-space-10 pt-space-4" testID="notification-settings">
        <View className="gap-space-3">
          <DisplayText size="lg" accessibilityRole="header">
            NOTIFICATIONS
          </DisplayText>
          <Text variant="body">
            Updates always shows everything. These choose what reaches your phone. Changes save as you tap.
          </Text>
        </View>

        {!online && p ? (
          <OfflineNote dataUpdatedAt={prefs.dataUpdatedAt} what="your settings" extra="Changes need a connection." />
        ) : null}

        {p ? (
          <>
            <View className="gap-space-4" role="region" aria-label="Quiet hours">
              <Divider kind="strong" label="QUIET HOURS" />
              <Switch
                label="Quiet hours"
                description={
                  p.quiet_hours_enabled
                    ? `Pushes wait until ${quietTime(p.quiet_end)}. Updates still collect them.`
                    : 'Pushes can arrive at any hour.'
                }
                value={p.quiet_hours_enabled ?? true}
                disabled={disabled}
                onValueChange={(v) => savePrefs({ p_quiet_hours_enabled: v }, 'quiet_hours')}
              />
              {p.quiet_hours_enabled ? (
                <>
                  <View className="gap-space-2">
                    <Text variant="label">STARTS</Text>
                    <ChipRow label="Quiet hours start" layout="wrap">
                      {quietOptions(QUIET_STARTS, p.quiet_start).map((t) => (
                        <Chip
                          key={t}
                          selected={hhmm(p.quiet_start) === t}
                          disabled={disabled}
                          testID={`quiet-start-${t}`}
                          onPress={() => savePrefs({ p_quiet_start: t }, 'quiet_start')}
                        >
                          {quietTime(t)}
                        </Chip>
                      ))}
                    </ChipRow>
                  </View>
                  <View className="gap-space-2">
                    <Text variant="label">ENDS</Text>
                    <ChipRow label="Quiet hours end" layout="wrap">
                      {quietOptions(QUIET_ENDS, p.quiet_end).map((t) => (
                        <Chip
                          key={t}
                          selected={hhmm(p.quiet_end) === t}
                          disabled={disabled}
                          testID={`quiet-end-${t}`}
                          onPress={() => savePrefs({ p_quiet_end: t }, 'quiet_end')}
                        >
                          {quietTime(t)}
                        </Chip>
                      ))}
                    </ChipRow>
                  </View>
                  <Text variant="caption" muted>
                    {`In your time zone (${tz.replace(/_/g, ' ')}).`}
                  </Text>
                </>
              ) : null}
              {problem ? <InlineError message={problem} testID="quiet-error" /> : null}
            </View>

            <View className="gap-space-4" role="region" aria-label="Lock screen">
              <Divider kind="strong" label="LOCK SCREEN" />
              <Switch
                label="Show details on the lock screen"
                description={
                  p.show_details
                    ? 'Pushes say what the update is about. Anyone holding your phone can read them.'
                    : 'Pushes say "Ojoro" and a general line, never who or where.'
                }
                value={p.show_details ?? false}
                disabled={disabled}
                onValueChange={(v) => savePrefs({ p_show_details: v }, 'show_details')}
              />
            </View>

            <View className="gap-space-4" role="region" aria-label="Pushes by type">
              <Divider kind="strong" label="PUSHES" />
              {TYPE_SETTINGS.map((t) => (
                <Switch
                  key={t.type}
                  label={t.label}
                  description={t.description}
                  value={pushOn(p.push_off, t.type)}
                  disabled={disabled}
                  onValueChange={(v) => saveType(t.type, v)}
                />
              ))}
            </View>
          </>
        ) : prefs.isError ? (
          <InlineError
            message={errorMessage(ojoroErrorOf(prefs.error))}
            action="TRY AGAIN"
            onAction={() => void prefs.refetch()}
          />
        ) : (
          <View {...loadingProps('Loading your settings')}>
            <Skeleton kind="text" lines={8} />
          </View>
        )}

        <View className="gap-space-2" role="region" aria-label="Muted">
          <Divider kind="strong" label="MUTED" />
          {mutes.data && mutes.data.length > 0 ? (
            <StripList>
              {mutes.data.map((m) => (
                <Strip
                  key={`${m.object_kind}-${m.object_id}`}
                  title={m.name ?? `${muteKindLabel(m.object_kind)} you can't see any more`}
                  titleVariant="title-sm"
                  meta={`${muteKindLabel(m.object_kind)} · ${muteUntilLabel(m.until, tz)}`}
                  accessible={false}
                  testID={`mute-${m.object_id}`}
                  trailing={
                    <TextButton
                      disabled={disabled || unmute.isPending}
                      accessibilityLabel={`Unmute ${m.name ?? muteKindLabel(m.object_kind)}`}
                      onPress={() => {
                        track('notification_unmuted', { kind: m.object_kind });
                        unmute.mutate(m, {
                          onSuccess: () => toast.show({ kind: 'success', message: 'Unmuted.' }),
                          onError: (e) => toast.show({ kind: 'error', message: errorMessage(ojoroErrorOf(e)) }),
                        });
                      }}
                    >
                      UNMUTE
                    </TextButton>
                  }
                />
              ))}
            </StripList>
          ) : mutes.isError ? (
            <InlineError message={errorMessage(ojoroErrorOf(mutes.error))} action="TRY AGAIN" onAction={() => void mutes.refetch()} />
          ) : mutes.isPending ? (
            <View {...loadingProps('Loading muted plans')}>
              <Skeleton kind="strip" />
            </View>
          ) : (
            <Text variant="body-sm" muted testID="no-mutes">
              Nothing muted. A muted plan, game or crew still shows in Updates; it just doesn't push.
            </Text>
          )}
        </View>
      </View>
    </Screen>
  );
}
