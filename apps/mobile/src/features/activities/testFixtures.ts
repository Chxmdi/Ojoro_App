/** Sample rows for unit tests (sample content from the designs). */
import type { ActivityCard, RosterRow } from './model';

// A 7:30 PM game on Tue 27 Oct 2026 (Montréal), 90 minutes.
export function card(over: Partial<ActivityCard> = {}): ActivityCard {
  return {
    id: 'act',
    plan_id: 'plan',
    sport_id: 'football',
    sport_name: 'Football',
    title: 'Pickup football',
    starts_at: '2026-10-27T23:30:00Z',
    ends_at: '2026-10-28T01:00:00Z',
    capacity: 8,
    confirmed_count: 8,
    waitlist_count: 2,
    checked_in_count: 0,
    host_id: 'ade',
    place_id: 'place',
    place_name: 'Jeanne-Mance Park',
    place_area: 'Plateau',
    level_label: 'Mixed level',
    team_a_label: 'Lights',
    team_b_label: 'Darks',
    teams_note: 'Lights vs Darks. Bring both shirts.',
    kit_note: 'Ball and bibs: Ade. Turf boots.',
    cost_cents: 0,
    currency: 'CAD',
    attendance_rule: 'check_in_host_confirms',
    check_in_opens_at: '2026-10-27T23:00:00Z',
    check_in_closes_at: '2026-10-28T01:00:00Z',
    check_in_radius_m: 150,
    status: 'confirmed',
    effective_status: 'confirmed',
    live_at: null,
    ended_at: null,
    after_closes_at: '2026-10-29T01:00:00Z',
    cancelled_at: null,
    my_attendance: 'confirmed',
    ...over,
  };
}

export function row(over: Partial<RosterRow> = {}): RosterRow {
  return {
    user_id: 'u',
    display_name: 'Someone S',
    avatar_path: null,
    status: 'confirmed',
    team: null,
    is_host: false,
    is_me: false,
    checked_in_at: null,
    waitlisted_at: null,
    games_with_me: null,
    invited_by_me: false,
    position: null,
    ...over,
  };
}

