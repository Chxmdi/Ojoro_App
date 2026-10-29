/**
 * Updates (Notifications.png, `/updates`): NEEDS YOU · n / TODAY / EARLIER from `my_notifications()`,
 * each row a link to its object with at most one inline action, marked read on open, live over
 * `notifications:{me}`, ending with YOU'RE CAUGHT UP. and the quiet-hours caption. The header's
 * more button opens Settings → Notifications (the design has no per-row mute).
 */
import { groupNotifications } from '@ojoro/contracts';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import {
  Button,
  IconButton,
  loadingProps,
  NotificationGroup,
  Panel,
  Screen,
  Skeleton,
  Text,
} from '@/design-system';
import { clockTime, updatedAt } from '@/lib/age';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { usePushOffer } from '@/lib/push';
import { ojoroErrorOf } from '@/lib/rpc';

import { useNow, useOnline } from '../plans/data';
import { AsOf, ErrorState, OfflineBanner } from '../plans/parts';
import { DEFAULT_TIME_ZONE } from '../plans/time';
import {
  useMarkRead,
  useNotificationPrefs,
  useNotifications,
  useNotificationsRealtime,
} from './data';
import { hasUnread, newestUpdatedAt, quietCaption, seenUnread, stickyNeedsYou, withHeldNeedsYou } from './logic';
import { UpdateRow, useRowActions } from './UpdateRow';

export function UpdatesScreen() {
  const auth = useAuth();
  const userId = auth.status === 'signed-in' ? auth.session.user.id : null;
  const router = useRouter();
  const online = useOnline();
  const now = useNow([]);
  const list = useNotifications(userId !== null);
  const prefs = useNotificationPrefs();
  const markRead = useMarkRead();
  const actions = useRowActions('updates');
  const push = usePushOffer(userId !== null);
  useNotificationsRealtime(userId);

  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      track('screen_viewed', { screen: 'updates' });
      return () => setFocused(false);
    }, []),
  );

  const rows = list.data ?? [];
  const tz = prefs.data?.time_zone ?? DEFAULT_TIME_ZONE;

  // NEW stays on what was unread when you got here, after it has been marked read.
  const [seen, setSeen] = useState<ReadonlySet<string>>(new Set());
  const [held, setHeld] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (!list.data) return;
    setSeen((prev) => seenUnread(prev, list.data));
    setHeld((prev) => stickyNeedsYou(prev, list.data));
  }, [list.data]);

  // Mark read on open (and as new rows arrive while you're here): everything up to the newest row.
  const newest = newestUpdatedAt(rows);
  const unread = hasUnread(rows);
  const { mutate: mark } = markRead;
  useEffect(() => {
    if (focused && online && unread && newest) mark(newest);
  }, [focused, online, unread, newest, mark]);

  const groups = groupNotifications(withHeldNeedsYou(rows, held));
  const asOf = updatedAt(list.dataUpdatedAt);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <Screen situation="calm" scroll gutter={false}>
      <View className="flex-row items-center justify-between px-space-2 pt-space-2">
        <IconButton icon="back" label="Back" onPress={back} />
        <IconButton
          icon="more"
          label="Notification settings"
          testID="updates-settings"
          onPress={() => router.push('/settings/notifications')}
        />
      </View>

      <View className="px-space-5 pb-space-10 pt-space-2" style={{ gap: 32 }} testID="updates">
        <Text variant="display-lg" role="heading">
          UPDATES.
        </Text>

        {!online && asOf ? <AsOf at={asOf} what="Updates" /> : null}

        {push.offer ? (
          <Panel
            title="Get told when a plan needs you."
            titleVariant="title-sm"
            body="Pushes wait out your quiet hours, and lock-screen previews never show who or where."
            actions={
              <>
                <Button
                  variant="secondary"
                  compact
                  onPress={() => {
                    track('push_prompt_answered', { answer: 'ask' });
                    void push.ask();
                  }}
                >
                  TURN ON
                </Button>
                <Button
                  variant="ghost"
                  compact
                  onPress={() => {
                    track('push_prompt_answered', { answer: 'not_now' });
                    push.notNow();
                  }}
                >
                  NOT NOW
                </Button>
              </>
            }
          />
        ) : null}

        {list.isPending ? (
          <View className="gap-space-4" {...loadingProps('Loading updates')}>
            <Skeleton kind="strip" />
            <Skeleton kind="strip" />
            <Skeleton kind="strip" />
          </View>
        ) : list.isError && !list.data ? (
          <View className="-mx-space-5">
            <ErrorState error={ojoroErrorOf(list.error)} onRetry={() => void list.refetch()} />
          </View>
        ) : (
          <>
            {groups.needs_you.length > 0 ? (
              <NotificationGroup title="NEEDS YOU" count={groups.needs_you.length} strong testID="group-needs-you">
                {groups.needs_you.map((r) => (
                  <UpdateRow key={r.id} row={r} now={now} timeZone={tz} unread={seen.has(r.id) || !r.read_at} actions={actions} />
                ))}
              </NotificationGroup>
            ) : null}
            {groups.today.length > 0 ? (
              <NotificationGroup title="TODAY" testID="group-today">
                {groups.today.map((r) => (
                  <UpdateRow key={r.id} row={r} now={now} timeZone={tz} unread={seen.has(r.id) || !r.read_at} actions={actions} />
                ))}
              </NotificationGroup>
            ) : null}
            {groups.earlier.length > 0 ? (
              <NotificationGroup title="EARLIER" testID="group-earlier">
                {groups.earlier.map((r) => (
                  <UpdateRow key={r.id} row={r} now={now} timeZone={tz} unread={seen.has(r.id) || !r.read_at} actions={actions} />
                ))}
              </NotificationGroup>
            ) : null}

            <View className="items-center gap-space-2 pt-space-4" role="region" aria-label="End" testID="updates-end">
              <Text variant="display-sm" role="heading" className="text-center">
                {rows.length === 0 ? 'NOTHING YET.' : "YOU'RE CAUGHT UP."}
              </Text>
              {rows.length === 0 ? (
                <Text variant="body-sm" muted className="text-center">
                  Plans you're in, your crews and games you follow show up here.
                </Text>
              ) : null}
              <Text variant="body-sm" muted className="text-center" testID="quiet-caption">
                {quietCaption(prefs.data)}
              </Text>
            </View>
          </>
        )}
      </View>

      {!online ? (
        <OfflineBanner
          at={asOf}
          message={
            asOf
              ? `Offline. Showing updates from ${clockTime(asOf)}. Actions go through when you're back.`
              : "Offline. We'll load your updates when you're back."
          }
        />
      ) : null}
    </Screen>
  );
}
