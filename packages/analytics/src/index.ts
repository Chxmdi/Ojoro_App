export const analyticsEvents = {
  screenViewed: 'screen_viewed',
  downForCreated: 'down_for_created',
  imDownCommitted: 'im_down_committed',
  planThresholdChanged: 'plan_threshold_changed',
  gameOnReached: 'game_on_reached',
  needOneMoreShown: 'need_one_more_shown',
  friendPulledIn: 'friend_pulled_in',
  activityOpened: 'activity_opened',
  activityStarted: 'activity_started',
  activityCompleted: 'activity_completed',
  recapViewed: 'recap_viewed',
  runItBack: 'run_it_back',
  crewMakeThisAGame: 'crew_make_this_a_game',
  challengeSent: 'challenge_sent',
  challengeAccepted: 'challenge_accepted',
  challengeCountered: 'challenge_countered',
  challengeCompleted: 'challenge_completed',
} as const;

export type AnalyticsEvent =
  (typeof analyticsEvents)[keyof typeof analyticsEvents];

export type AnalyticsPayload = Record<string, string | number | boolean | null>;

export function createAnalyticsEvent(
  name: AnalyticsEvent,
  payload: AnalyticsPayload = {},
) {
  return {
    name,
    payload,
    occurredAt: new Date().toISOString(),
  };
}
