import type { OjoroError, OjoroErrorCode } from '@ojoro/contracts';

/**
 * What to tell people when a call fails: what happened, in words, without blame. Screens add the
 * one next step (a button) and show these with the alert icon, never in red. Codes come from
 * docs/SLICE01_CONTRACT.md; the type makes this list exhaustive.
 */
const messages: Record<OjoroErrorCode | 'permission_denied' | 'network' | 'unknown', string> = {
  not_authenticated: 'You are signed out. Sign in to carry on.',
  idempotency_key_required: "That didn't go through. Try again.",
  idempotency_key_reused: "That didn't go through. Try again.",
  invalid_argument: "Something in that isn't right. Check it and try again.",
  user_not_found: "We can't find that person.",
  subject_not_found: "We can't find that any more.",
  report_rate_limited: "You've sent a lot of reports in a short time. Try again later.",
  handle_taken: 'That name is taken. Try another.',
  radius_invalid: 'Pick a distance between 1 and 50 km.',
  sport_unknown: "We don't know that sport yet.",
  place_unknown: "We can't find that place.",
  capacity_invalid: 'Plans hold 2 to 12 people.',
  starts_at_invalid: 'Pick a time that is still to come.',
  deadline_invalid: 'The plan has to lock before it starts.',
  time_options_invalid: 'Give each time option a different time, all still to come.',
  expiry_required: 'Say until when you are down.',
  expiry_invalid: 'Pick an end time that is still to come.',
  window_invalid: 'The end time has to be after the start.',
  signal_not_found: 'That Down For has already ended.',
  plan_not_found: "We can't find that plan.",
  plan_unavailable: "This plan isn't open to you.",
  plan_full: 'The last spot went a moment before you.',
  plan_expired: "This plan didn't come together in time.",
  plan_cancelled: 'The host called this plan off.',
  plan_locked: "It's GAME ON already. Use the game to drop out.",
  not_member: "You aren't in this plan.",
  not_host: 'Only the host can do that.',
  poll_closed: 'The time vote has closed.',
  option_not_found: "That time isn't an option any more.",
  invite_not_allowed: "You can't invite them to this plan.",
  invite_quota_exceeded: "You've used your invites for this plan.",
  invite_rate_limited: "You've sent a lot of invites today. Try again tomorrow.",
  invite_not_found: 'That invite has ended.',
  activity_not_found: "We can't find that game.",
  activity_cancelled: 'This game was called off.',
  activity_started: 'The game has started.',
  activity_not_live: "The game isn't on yet.",
  activity_not_finished: "The game hasn't finished yet.",
  not_attending: "You aren't in this game.",
  check_in_not_open: "Check-in isn't open yet.",
  check_in_closed: 'Check-in has closed.',
  check_in_unavailable: "Check-in isn't available for this game.",
  location_required: 'Check-in needs your location, just this once.',
  too_far: "You're not at the game yet. Check in when you get there.",
  share_not_allowed: "Location sharing isn't on for this game.",
  not_player: 'Only people who played can do that.',
  result_not_open: "The score can't be changed now.",
  result_already_verified: 'The score is already confirmed.',
  proposal_not_found: "That score isn't there any more.",
  proposal_superseded: 'Someone suggested a different score. Check the new one.',
  moments_closed: 'Adding photos has closed for this game.',
  moment_path_invalid: "That photo didn't upload. Try again.",
  not_author: 'Only the person who added it can do that.',
  permission_denied: "You can't do that here.",
  network: "You're offline. We'll try again when you're back.",
  unknown: "That didn't work. Try again.",
};

export function errorMessage(error: OjoroError): string {
  return messages[error.code];
}

export const allErrorMessages: Readonly<Record<string, string>> = messages;
