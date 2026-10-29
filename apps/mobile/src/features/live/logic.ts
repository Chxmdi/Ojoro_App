/**
 * Pure rules for LiveActivity (design-handoff/screens/LiveActivity.png): server-clock anchors for
 * the running clock and the freshness line, the header words, how each update is drawn, and the
 * reactions (one word per person per post or game: the same word takes it back, another replaces
 * it). docs/MESSAGING_CONTRACT.md, Live. No React Native imports.
 */
import { liveClockSeconds, liveFreshnessSeconds, reactionWords, type ReactionWord } from '@ojoro/contracts';

import { firstName } from '../chat/thread';

export type LiveFacts = {
  effective_status: string;
  server_now: string;
  live_at: string | null;
  last_update_at: string | null;
  sport_id: string;
  place_name: string | null;
  team_a_label: string | null;
  team_b_label: string | null;
  team_a_score: number | null;
  team_b_score: number | null;
  score_logged_by_name: string | null;
  score_logged_by_host: boolean | null;
  follower_count: number;
  i_follow: boolean;
  crew_following: string | null;
  playing_count: number;
  is_host: boolean;
  can_log_score: boolean;
  can_post: boolean;
  reaction_counts: unknown;
  my_reaction: ReactionWord | null;
};

/**
 * Device-clock instants (epoch ms) that LiveClock and LiveScoreHeader can count from, derived on
 * the server's clock: the elapsed time and the age at `receivedAt` come from `server_now`, so a
 * wrong device clock shifts nothing. Null when the game hasn't gone live or nothing was logged.
 */
export function liveAnchors(
  state: Pick<LiveFacts, 'server_now' | 'live_at' | 'last_update_at'>,
  receivedAt: number,
): { startedAt: number | null; updatedAt: number | null } {
  const at = new Date(receivedAt);
  const clock = liveClockSeconds(state, at, at);
  const fresh = liveFreshnessSeconds(state, at, at);
  return {
    startedAt: clock === null ? null : receivedAt - clock * 1000,
    updatedAt: fresh === null ? null : receivedAt - fresh * 1000,
  };
}

/** "Jeanne-Mance Park" → "JEANNE-MANCE": the area people say, never an address. */
export function shortPlace(name: string | null | undefined): string | null {
  if (!name) return null;
  const short = name.replace(/\s+(park|field|fields|court|courts|centre|center|pitch)$/i, '').trim();
  return (short || name).toUpperCase();
}

/** "FOOTBALL · JEANNE-MANCE · 8 PLAYING". */
export function liveOverline(s: Pick<LiveFacts, 'sport_id' | 'place_name' | 'playing_count'>): string {
  return [
    s.sport_id.replace(/_/g, ' ').toUpperCase(),
    shortPlace(s.place_name),
    s.playing_count > 0 ? `${s.playing_count} PLAYING` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** "Ade (host)", "Marcus". */
export function loggedByLabel(s: Pick<LiveFacts, 'score_logged_by_name' | 'score_logged_by_host'>): string | undefined {
  if (!s.score_logged_by_name) return undefined;
  return `${firstName(s.score_logged_by_name)}${s.score_logged_by_host ? ' (host)' : ''}`;
}

/** "THURSDAY FC IS FOLLOWING", else "6 FOLLOWING", else nothing. */
export function followingLine(s: Pick<LiveFacts, 'crew_following' | 'follower_count'>): string | null {
  if (s.crew_following) return `${s.crew_following.toUpperCase()} IS FOLLOWING`;
  if (s.follower_count > 0) return `${s.follower_count} FOLLOWING`;
  return null;
}

/** The FULL TIME section's line. */
export function fullTimeLine(isHost: boolean, hostName: string | null): string {
  const who = isHost ? 'You call' : `${hostName ? firstName(hostName) : 'The host'} calls`;
  return `${who} full time. Then the After window opens for 24 hours.`;
}

/** The game is still running for this screen. */
export function isLive(status: string): boolean {
  return status === 'live';
}

export type ScoreSides = { a: { name: string; score: number }; b: { name: string; score: number } };

export function scoreSides(s: Pick<LiveFacts, 'team_a_label' | 'team_b_label' | 'team_a_score' | 'team_b_score'>): ScoreSides {
  return {
    a: { name: (s.team_a_label ?? 'Team A').toUpperCase(), score: s.team_a_score ?? 0 },
    b: { name: (s.team_b_label ?? 'Team B').toUpperCase(), score: s.team_b_score ?? 0 },
  };
}

/** The share sheet's words: the score and where, no names. */
export function shareText(s: Pick<LiveFacts, 'sport_id' | 'place_name' | 'team_a_label' | 'team_b_label' | 'team_a_score' | 'team_b_score' | 'effective_status'>): string {
  const sides = scoreSides(s);
  const sport = s.sport_id.replace(/_/g, ' ');
  const where = s.place_name ? ` at ${s.place_name}` : '';
  const when = s.effective_status === 'live' ? 'live on Ojoro' : 'on Ojoro';
  const name = (n: string) => n.charAt(0) + n.slice(1).toLowerCase();
  return `${name(sides.a.name)} ${sides.a.score}–${sides.b.score} ${name(sides.b.name)}. ${sport.charAt(0).toUpperCase()}${sport.slice(1)}${where}, ${when}.`;
}

// Updates feed -----------------------------------------------------------------------------------

export type UpdateRow = {
  id: string;
  kind: 'kick_off' | 'score' | 'check_in' | 'full_time' | 'post';
  author_id: string | null;
  author_name: string | null;
  author_is_host: boolean | null;
  body: string | null;
  reaction_counts: unknown;
  my_reaction: ReactionWord | null;
  is_deleted: boolean;
  created_at: string;
};

/**
 * How a post is drawn: Ojoro's and the host's posts are UPDATE cards (HypePost `system`), a
 * player's post is a Comment (REPLY, RESPECT). Deleted posts aren't drawn.
 */
export function updateView(u: UpdateRow): 'card' | 'comment' | 'hidden' {
  if (u.is_deleted || !u.body) return 'hidden';
  if (u.kind !== 'post' || u.author_is_host || !u.author_id) return 'card';
  return 'comment';
}

/** "1m", "12m", "2h", "now" for a comment. */
export function shortAge(at: string, now: number): string {
  const s = Math.max(0, Math.floor((now - Date.parse(at)) / 1000));
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

// Reactions --------------------------------------------------------------------------------------

export type ReactionCounts = Partial<Record<ReactionWord, number>>;

/** `reaction_counts` jsonb as numbers, ignoring anything unknown. */
export function readCounts(json: unknown): ReactionCounts {
  const out: ReactionCounts = {};
  if (!json || typeof json !== 'object') return out;
  for (const { value } of reactionWords) {
    const n = (json as Record<string, unknown>)[value];
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) out[value] = Math.floor(n);
  }
  return out;
}

export type ReactionState = { counts: ReactionCounts; mine: ReactionWord | null };

/**
 * The optimistic answer to a tap, as the server will apply it: the same word takes yours back,
 * another word replaces it. Apply it again with the previous state to roll back.
 */
export function applyReaction(state: ReactionState, word: ReactionWord): ReactionState {
  const counts = { ...state.counts };
  const bump = (w: ReactionWord, by: number) => {
    const next = Math.max(0, (counts[w] ?? 0) + by);
    if (next === 0) delete counts[w];
    else counts[w] = next;
  };
  if (state.mine === word) {
    bump(word, -1);
    return { counts, mine: null };
  }
  if (state.mine) bump(state.mine, -1);
  bump(word, 1);
  return { counts, mine: word };
}

/** ReactionBar's rows: every word in order, its count, and whether it's yours. */
export function reactionRows(state: ReactionState): { label: string; count: number; mine: boolean; value: ReactionWord }[] {
  return reactionWords.map((w) => ({
    label: w.label,
    value: w.value,
    count: state.counts[w.value] ?? 0,
    mine: state.mine === w.value,
  }));
}

export function wordForLabel(label: string): ReactionWord | null {
  return reactionWords.find((w) => w.label === label)?.value ?? null;
}

// Score -------------------------------------------------------------------------------------------

export const SCORE_MAX = 99;

export function validScore(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= SCORE_MAX;
}

/** The update composer: 1–280 characters, trimmed. */
export function validateUpdate(text: string, max: number): { ok: true; body: string } | { ok: false; error: string } {
  const body = text.trim();
  if (!body) return { ok: false, error: 'Write the update first.' };
  if (body.length > max) return { ok: false, error: `Updates are 1 to ${max} characters.` };
  return { ok: true, body };
}
