/** Home reads (contract, Screens: Main). Everything sits under ['home'] so one invalidation refreshes it. */
import { invitesSubscription } from '@ojoro/contracts';
import { useQuery } from '@tanstack/react-query';

import { useRealtimeRefetch } from '@/lib/realtime';
import { rpc } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

import { check, checkRows, type PlanCard } from '../plans/data';


export function useDownsNearby() {
  return useQuery({ queryKey: ['home', 'downs'], queryFn: () => rpc('down_for_nearby', {}) });
}

export function usePlansNearby() {
  return useQuery({ queryKey: ['home', 'nearby'], queryFn: () => rpc('plans_nearby', {}) });
}

/** Plans you're in that are still forming or on (GAME ON reached while you were elsewhere shows here). */
export function useMyPlans(userId: string | null) {
  return useQuery({
    queryKey: ['home', 'mine', userId],
    enabled: userId !== null,
    queryFn: async (): Promise<PlanCard[]> => {
      const plans = checkRows(
        await supabase
          .from('plan_cards')
          .select('*')
          .eq('i_am_in', true)
          .in('effective_status', ['forming', 'game_on'])
          .gt('starts_at', new Date(Date.now() - 3 * 3600_000).toISOString())
          .order('starts_at')
          .limit(10),
      );
      // A plan stays game_on when its game is called off or over; leave those to the Activity.
      const activityIds = plans.map((p) => p.activity_id).filter((a): a is string => a !== null);
      if (activityIds.length === 0) return plans;
      const games = checkRows(
        await supabase.from('activity_cards').select('id, effective_status').in('id', activityIds),
      );
      const done = new Set(
        games.filter((g) => g.effective_status !== 'confirmed').map((g) => g.id),
      );
      return plans.filter((p) => !p.activity_id || !done.has(p.activity_id));
    },
  });
}

/** Plans someone pulled you into (pending invites). The invitee sees who's in, the time and the place. */
export function useInvitedPlans(userId: string | null) {
  return useQuery({
    queryKey: ['home', 'invites', userId],
    enabled: userId !== null,
    queryFn: async (): Promise<PlanCard[]> => {
      const invites = checkRows(
        await supabase
          .from('plan_invites')
          .select('plan_id')
          .eq('invitee_id', userId ?? '')
          .eq('status', 'pending'),
      );
      if (invites.length === 0) return [];
      return checkRows(
        await supabase
          .from('plan_cards')
          .select('*')
          .in(
            'id',
            invites.map((i) => i.plan_id),
          )
          .eq('effective_status', 'forming')
          .order('starts_at'),
      );
    },
  });
}

/** Your last game's recap (through your newest Passport stamp), with the activity's title. */
export function useLastRecap(userId: string | null) {
  return useQuery({
    queryKey: ['home', 'recap', userId],
    enabled: userId !== null,
    queryFn: async () => {
      const entry = check(
        await supabase
          .from('passport_entries')
          .select('activity_id, occurred_at')
          .eq('user_id', userId ?? '')
          .order('occurred_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      );
      if (!entry) return null;
      const [recap, activity] = await Promise.all([
        supabase.from('recaps').select('*').eq('activity_id', entry.activity_id).maybeSingle(),
        supabase.from('activity_cards').select('title, sport_name').eq('id', entry.activity_id).maybeSingle(),
      ]);
      const r = check(recap);
      if (!r) return null;
      const a = check(activity);
      return { recap: r, title: a?.title ?? a?.sport_name ?? null };
    },
  });
}

/** Invites addressed to you refresh Home (contract, Realtime: Home). */
export function useHomeRealtime(userId: string | null) {
  useRealtimeRefetch(userId ? invitesSubscription(userId) : null, [['home']]);
}
