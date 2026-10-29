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
  // Slice 01: Home, Down For, Plan, Pull Someone In, GAME ON. The server records down_for_created,
  // im_down_committed, plan_threshold_changed, game_on_reached and friend_pulled_in; the client
  // sends taps and what only it sees.
  downForWithdrawn: 'down_for_withdrawn',
  planLeft: 'plan_left',
  planShared: 'plan_shared',
  timeVoted: 'time_voted',
  gameOnShown: 'game_on_shown',
  imDownFailed: 'im_down_failed',
  // Step 3: Discover. The server records discover_searched, ojoro_now_served, latent_demand_shown,
  // surprise_me_served and demand_plan_created; the client sends taps only.
  discoverFilterChanged: 'discover_filter_changed',
  discoverResultOpened: 'discover_result_opened',
  ojoroNowItemOpened: 'ojoro_now_item_opened',
  makeItHappenTapped: 'make_it_happen_tapped',
  makeItHappenFailed: 'make_it_happen_failed',
  surpriseMeTapped: 'surprise_me_tapped',
  suggestionOpened: 'suggestion_opened',
  personCardOpened: 'person_card_opened',
  areaPromptTapped: 'area_prompt_tapped',
  // Step 3: Create, FirstHome, the area picker. The server records area_set, concierge_suggested,
  // latent_demand_shown, down_for_created, plan_created and demand_plan_created; taps only here.
  areaPicked: 'area_picked',
  quickDownForTapped: 'quick_down_for_tapped',
  furtherOutOpened: 'further_out_opened',
  inviteFriendsTapped: 'invite_friends_tapped',
  conciergeConfirmed: 'concierge_confirmed',
  conciergeMoreIdeasTapped: 'concierge_more_ideas_tapped',
  createOptionOpened: 'create_option_opened',
  planFormSubmitted: 'plan_form_submitted',
  planFormInvalid: 'plan_form_invalid',
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
