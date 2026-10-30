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
  // Step 8: the AI Concierge. The server records concierge_ai_decided (no words); taps only here.
  conciergeStartTapped: 'concierge_start_tapped',
  createOptionOpened: 'create_option_opened',
  planFormSubmitted: 'plan_form_submitted',
  planFormInvalid: 'plan_form_invalid',
  // Step 4: Updates, the bell, the action feed, notification settings. The server records
  // notification_acted and the messaging events; the client sends taps only, never words.
  bellTapped: 'bell_tapped',
  notificationOpened: 'notification_opened',
  notificationActionTapped: 'notification_action_tapped',
  homeCardOpened: 'home_card_opened',
  notificationSettingChanged: 'notification_setting_changed',
  notificationTypeChanged: 'notification_type_changed',
  notificationUnmuted: 'notification_unmuted',
  pushPromptAnswered: 'push_prompt_answered',
  // Step 4: crew chat, Make This a Game, crews, activity chat, Live. The server records
  // message_sent, chat_suggestion_*, make_this_a_game, crew_*, score_logged, live_update_posted
  // and activity_followed; the client sends taps only, never message words or recipients.
  chatMessageSent: 'chat_message_sent',
  chatMessageQueued: 'chat_message_queued',
  chatMessageFailed: 'chat_message_failed',
  chatMessageEdited: 'chat_message_edited',
  chatMessageDeleted: 'chat_message_deleted',
  chatMessageActionsOpened: 'chat_message_actions_opened',
  chatOlderLoaded: 'chat_older_loaded',
  chatSuggestionShown: 'chat_suggestion_shown',
  chatSuggestionNotNowTapped: 'chat_suggestion_not_now_tapped',
  makeThisAGameOpened: 'make_this_a_game_opened',
  makeThisAGameTapped: 'make_this_a_game_tapped',
  crewPlanOpened: 'crew_plan_opened',
  crewCreateTapped: 'crew_create_tapped',
  crewJoinTapped: 'crew_join_tapped',
  crewLeaveTapped: 'crew_leave_tapped',
  crewCodeShared: 'crew_code_shared',
  crewCodeRotated: 'crew_code_rotated',
  reactionTapped: 'reaction_tapped',
  liveScoreLoggedTapped: 'live_score_logged_tapped',
  liveUpdatePostedTapped: 'live_update_posted_tapped',
  liveReplyTapped: 'live_reply_tapped',
  liveShared: 'live_shared',
  activityFollowTapped: 'activity_follow_tapped',
  activityUnfollowTapped: 'activity_unfollow_tapped',
  // Step 5: Compete, Call-Outs, Challenge Events, Rivalry. The server records callout_*,
  // challenge_*, prediction_cast/changed, backing_selected and the rematch events
  // (docs/COMPETITION_CONTRACT.md §Analytics); the client sends taps and what only it sees.
  // Call-Out taps go through cta_tapped (call_out_accept, call_out_counter, call_out_pass,
  // call_out_withdraw, call_out_send).
  challengeShared: 'challenge_shared',
  challengeLiveViewed: 'challenge_live_viewed',
  predictionMade: 'prediction_made',
  crowdBacked: 'crowd_backed',
  rematchRequested: 'rematch_requested',
  rematchAccepted: 'rematch_accepted',
  // Step 6: HostHome, HostSeries, HostRoster, HostRequests, HostPeople, HostAnnounce. The server
  // records host_program_created, host_series_created/updated, host_session_skipped/restored,
  // host_session_joined, host_join_requested/decided, host_waitlist_promoted, host_spot_added,
  // host_checked_in, host_rules_changed, host_tags_set, host_note_saved, host_invite_back_sent and
  // host_announcement_sent (docs/HOSTS_CONTRACT.md §Analytics); the client sends views and taps
  // only, never note or announcement words.
  hostHomeViewed: 'host_home_viewed',
  hostNeedsYouTapped: 'host_needs_you_tapped',
  hostSeriesViewed: 'host_series_viewed',
  hostRosterViewed: 'host_roster_viewed',
  hostRequestsViewed: 'host_requests_viewed',
  hostRequestUndoTapped: 'host_request_undo_tapped',
  hostPeopleViewed: 'host_people_viewed',
  hostPeopleFilterChanged: 'host_people_filter_changed',
  hostPersonExpanded: 'host_person_expanded',
  hostAnnounceViewed: 'host_announce_viewed',
  hostAnnounceTemplatePicked: 'host_announce_template_picked',
  askToJoinTapped: 'ask_to_join_tapped',
  // Step 6: CrewHome, Clan, Clash. The server records ritual_*, clan_*, clan_run_*, clash_*,
  // crew_rhythm_set and down_for_joined (docs/COMMUNITIES_CONTRACT.md §Analytics); the client
  // sends taps and what only it sees. Backing a clan reuses crowd_backed.
  crewViewed: 'crew_viewed',
  crewNextJoined: 'crew_next_joined',
  crewChatOpened: 'crew_chat_opened',
  ritualSkipTapped: 'ritual_skip_tapped',
  makeThisARitualTapped: 'make_this_a_ritual_tapped',
  clanViewed: 'clan_viewed',
  clanRunStartedTapped: 'clan_run_started_tapped',
  clanInviteShared: 'clan_invite_shared',
  clashViewed: 'clash_viewed',
  clashShared: 'clash_shared',
  // Step 6: HostMembership, HostSeason, HostInsights. The server records host_pass_created,
  // host_pass_granted, host_paid_at_field, host_refund_requested, host_refund_decided,
  // host_membership_cancelled, host_league_created, host_league_result_submitted,
  // host_league_result_confirmed, host_league_result_disputed, host_league_referee_asked and
  // host_insights_exported (docs/HOSTS_OPS_CONTRACT.md §Analytics); the client sends views and taps.
  hostMoneyViewed: 'host_money_viewed',
  hostRefundDecisionUndone: 'host_refund_decision_undone',
  hostSeasonViewed: 'host_season_viewed',
  hostInsightsViewed: 'host_insights_viewed',
  hostInsightsTableToggled: 'host_insights_table_toggled',
  // Step 7: Passport. The server records passport_entry_added, personal_best_set, goal_set,
  // goal_updated, goal_cleared, goal_achieved and goals_visibility_set (docs/PASSPORT_CONTRACT.md
  // §Analytics); the client sends views and taps.
  passportViewed: 'passport_viewed',
  passportFilterChanged: 'passport_filter_changed',
  goalSheetOpened: 'goal_sheet_opened',
  // Step 7: Pulse and Place. The server records pulse_viewed and place_viewed
  // (docs/PLACES_CONTRACT.md §Analytics); the client sends taps.
  pulseOpened: 'pulse_opened',
  pulseFilterChanged: 'pulse_filter_changed',
  pulseMarkerSelected: 'pulse_marker_selected',
  pulseViewToggled: 'pulse_view_toggled',
  placeOpened: 'place_opened',
  createHereTapped: 'create_here_tapped',
  placeDirectionsTapped: 'place_directions_tapped',
  placeShared: 'place_shared',
  // Step 8: Payments (Stripe, test mode). The server records payments_* (docs/PAYMENTS_CONTRACT.md
  // §Analytics); the client sends the hosted-page opens and the return view, never amounts.
  paymentCheckoutOpened: 'payment_checkout_opened',
  paymentReturnViewed: 'payment_return_viewed',
  hostConnectOpened: 'host_connect_opened',
  // Step 8: Trust. The server records report_submitted, case_resolved, content_hidden,
  // content_restored, account_paused, account_restored, appeal_submitted, appeal_decided and
  // reputation_voided (docs/TRUST_CONTRACT.md §Analytics); the client sends the appeal taps.
  pausedScreenViewed: 'paused_screen_viewed',
  appealOpened: 'appeal_opened',
  appealSent: 'appeal_sent',
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
