export const analyticsEvents = {
  screenViewed: 'screen_viewed',
  downForCreated: 'down_for_created',
  imDownTapped: 'im_down_tapped',
  imDownCommitted: 'im_down_committed',
  ctaTapped: 'cta_tapped',
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
  // Slice 01: auth, onboarding, profile, safety. Payloads never carry phone numbers or names.
  signInStarted: 'sign_in_started',
  signInCodeSent: 'sign_in_code_sent',
  signInCompleted: 'sign_in_completed',
  signInFailed: 'sign_in_failed',
  onboardingStepCompleted: 'onboarding_step_completed',
  onboardingCompleted: 'onboarding_completed',
  profileViewed: 'profile_viewed',
  visibilityChanged: 'visibility_changed',
  reportSheetOpened: 'report_sheet_opened',
  reportSent: 'report_sent',
  userBlocked: 'user_blocked',
  userUnblocked: 'user_unblocked',
  // Slice 01: activity, check-in, After, Recap, Run It Back. The server records activity_started,
  // activity_completed and run_it_back; the client sends taps and outcomes it alone sees.
  waitlistJoined: 'waitlist_joined',
  attendanceCancelled: 'attendance_cancelled',
  checkInTapped: 'check_in_tapped',
  checkedIn: 'checked_in',
  checkInFailed: 'check_in_failed',
  hostCheckedIn: 'host_checked_in',
  locationSharingStarted: 'location_sharing_started',
  locationSharingStopped: 'location_sharing_stopped',
  resultProposed: 'result_proposed',
  resultConfirmed: 'result_confirmed',
  resultVerified: 'result_verified',
  momentAdded: 'moment_added',
  momentUntagged: 'moment_untagged',
  momentRemoved: 'moment_removed',
  recapShared: 'recap_shared',
  runItBackTapped: 'run_it_back_tapped',
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
