export type PrototypeEvent =
  | 'screen_viewed'
  | 'im_down_committed'
  | 'plan_threshold_changed'
  | 'game_on_reached'
  | 'need_one_more_shown'
  | 'friend_pulled_in'
  | 'activity_started'
  | 'activity_completed'
  | 'run_it_back'
  | 'crew_make_this_a_game'
  | 'crew_plan_poll_confirmed'
  | 'challenge_accepted'
  | 'challenge_countered'
  | 'challenge_completed';

export function track(
  event: PrototypeEvent,
  payload: Record<string, string | number | boolean> = {},
) {
  if (__DEV__) {
    console.info('[ojoro:analytics]', event, payload);
  }
}
