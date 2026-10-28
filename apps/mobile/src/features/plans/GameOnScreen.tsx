/**
 * GAME ON (GameOn.png, confirmed situation): the takeover when the plan fills. The poster arrives
 * by Breakthrough with the success haptic (`celebrate`; reduced motion cross-fades and the headline
 * still changes). OPEN THE GAME goes to the Activity. ADD TO CALENDAR and DIRECTIONS are device
 * hand-offs (undesigned): an .ics file or the share sheet, and the device's maps app.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { Linking, Platform, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, GameOnPoster, IconButton, Situation, Text, useToast } from '@/design-system';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { ojoroErrorOf } from '@/lib/rpc';

import {
  useActivityCard,
  useMeetingPoint,
  useNow,
  usePlanCard,
  usePlanRoster,
  useTimeZone,
  type PlanCard,
} from './data';
import { ErrorState, PlanSkeleton, routes } from './parts';
import { directionsUrl, displayStatus, gameOnNote, gameOnOverline, icsEvent, type RosterRow } from './planLogic';
import { planTitle, planWhen } from './time';

export function GameOnScreen({ id, celebrate }: { id: string; celebrate: boolean }) {
  const insets = useSafeAreaInsets();
  const card = usePlanCard(id);
  const plan = card.data;

  useFocusEffect(
    useCallback(() => {
      track('screen_viewed', { screen: 'game_on', plan_id: id, celebrate });
    }, [id, celebrate]),
  );

  return (
    <Situation id="confirmed" className="flex-1" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      {card.isPending ? <PlanSkeleton label="Loading the game" /> : null}
      {card.isError && !plan ? <ErrorState error={ojoroErrorOf(card.error)} onRetry={() => void card.refetch()} /> : null}
      {plan ? <GameOn plan={plan} celebrate={celebrate} /> : null}
    </Situation>
  );
}

function GameOn({ plan, celebrate }: { plan: PlanCard; celebrate: boolean }) {
  const id = plan.id;
  const router = useRouter();
  const toast = useToast();
  const auth = useAuth();
  const userId = auth.status === 'signed-in' ? auth.session.user.id : null;
  const tz = useTimeZone(plan.place_id);
  const now = useNow([]);
  const roster = usePlanRoster(id);
  const activity = useActivityCard(id, plan.activity_id);
  const member = Boolean(plan.i_am_in) || plan.host_id === userId;
  const meeting = useMeetingPoint(id, member);
  const status = displayStatus(plan, now);

  // Not GAME ON (yet, or any more): this route has nothing to show; go to the plan.
  useEffect(() => {
    if (status !== 'game_on') router.replace(routes.plan(id));
  }, [status, router, id]);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace(routes.plan(id));
  };

  const rows = (roster.data ?? []) as RosterRow[];
  const last = [...rows].sort((a, b) => Date.parse(b.joined_at) - Date.parse(a.joined_at))[0];
  const people = rows.map((r) => ({ name: r.display_name, isNew: celebrate && r.user_id === last?.user_id }));
  const overline = (celebrate ? gameOnOverline(rows, plan.member_count, now) : null) ?? `PLAN · ${planTitle(plan, now, tz)}`;
  const when = planWhen(plan.starts_at, now, tz);
  const place = plan.place_name ?? 'Place to be agreed';
  const opensAt = activity.data?.check_in_opens_at ?? null;

  const addToCalendar = async () => {
    track('cta_tapped', { cta: 'add_to_calendar', plan_id: id });
    const title = `${plan.sport_name}${plan.place_name ? `, ${plan.place_name}` : ''}`;
    const location = [meeting.data?.label, plan.place_name].filter(Boolean).join(', ') || null;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const ics = icsEvent({
        uid: id,
        title,
        startsAt: plan.starts_at,
        durationMinutes: plan.duration_minutes,
        location,
        now: new Date(),
      });
      const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ojoro-game.ics';
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    try {
      await Share.share({ message: `${title}. ${when}.${location ? ` ${location}.` : ''}` });
    } catch {
      toast.show({ kind: 'neutral', message: "Your calendar isn't available here." });
    }
  };

  const directions = async () => {
    track('cta_tapped', { cta: 'directions', plan_id: id });
    const point =
      meeting.data?.lat != null && meeting.data.lng != null
        ? { lat: meeting.data.lat, lng: meeting.data.lng, label: meeting.data.label }
        : { lat: plan.place_lat, lng: plan.place_lng, label: plan.place_name };
    const url = directionsUrl(Platform.OS, point);
    if (!url) {
      toast.show({ kind: 'neutral', message: 'The place is still to be agreed.' });
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      toast.show({ kind: 'neutral', message: "Maps isn't available here." });
    }
  };

  return (
    <View className="flex-1" testID="game-on">
      <View className="flex-row items-center justify-between pl-space-5 pr-space-2 pt-space-2">
        <Text variant="overline" className="shrink" testID="game-on-overline">
          {overline}
        </Text>
        <IconButton icon="close" label="Close" onPress={close} />
      </View>
      <GameOnPoster
        activity={plan.sport_name}
        time={when}
        place={place}
        count={plan.member_count}
        people={people}
        celebrate={celebrate}
      />
      <View className="mt-auto gap-space-2 px-space-5 pb-space-8">
        <Text variant="body-sm" muted className="mb-space-2">
          {gameOnNote(plan.member_count, opensAt, tz)}
        </Text>
        <Button
          variant="primary"
          block
          disabled={!plan.activity_id}
          onPress={() => {
            track('cta_tapped', { cta: 'open_the_game', plan_id: id });
            if (plan.activity_id) router.replace(routes.activity(plan.activity_id));
          }}
          testID="open-the-game"
        >
          OPEN THE GAME
        </Button>
        <View className="flex-row gap-space-2">
          <View className="flex-1">
            <Button variant="secondary" block onPress={() => void addToCalendar()}>
              ADD TO CALENDAR
            </Button>
          </View>
          <View className="flex-1">
            <Button variant="secondary" block onPress={() => void directions()}>
              DIRECTIONS
            </Button>
          </View>
        </View>
      </View>
    </View>
  );
}
