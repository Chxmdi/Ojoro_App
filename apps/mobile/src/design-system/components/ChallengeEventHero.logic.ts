/**
 * Pure rules for `ChallengeEventHero` (web reference `STAGES` and
 * `function ChallengeEventHero`; components/ChallengeEventHero.md and the
 * design-system README, "Challenge Events: the escalation"). No React Native imports.
 */

export const CHALLENGE_STAGES = ['accepted', 'days', 'today', 'soon', 'live', 'complete'] as const;
export type ChallengeStage = (typeof CHALLENGE_STAGES)[number];

export type StageSituation = 'forming' | 'confirmed' | 'live' | 'after';

export type StageSpec = {
  /** The situation the hero sets on its root. It only ever moves forward. */
  situation: StageSituation;
  /** The poster headline at display-hero, or null. */
  head: string | null;
  /** The overline, or null (live leads with the LIVE pill). */
  over: string | null;
};

/** Stage → situation, headline, overline (web `STAGES`). */
export const STAGES: Record<ChallengeStage, StageSpec> = {
  accepted: { situation: 'forming', head: null, over: 'CHALLENGE ACCEPTED' },
  days: { situation: 'forming', head: null, over: 'CHALLENGE EVENT' },
  today: { situation: 'confirmed', head: 'TODAY.', over: 'CHALLENGE DAY' },
  soon: { situation: 'confirmed', head: 'ALMOST TIME.', over: 'CHECK-IN OPEN' },
  live: { situation: 'live', head: null, over: null },
  complete: { situation: 'after', head: null, over: 'RESULT · VERIFIED' },
};

export function stageSpec(stage: ChallengeStage | undefined): StageSpec {
  return STAGES[stage && stage in STAGES ? stage : 'accepted'];
}

/** The fact headline once verified: "CHIMDI WINS." (falls back to side a, as the web does). */
export function winnerHeadline(winner: string | undefined, fallback: string): string {
  return `${(winner || fallback).toUpperCase()} WINS.`;
}

/** The names block read as one heading: "Chimdi versus Marcus". */
export function versusLabel(a: string, b: string): string {
  return `${a} versus ${b}`;
}

/** The live progress read as one item: "Chimdi 3.4 KM, Marcus 3.1 KM". Missing progress is left out. */
export function progressLabel(
  a: { name: string; progress?: string | undefined },
  b: { name: string; progress?: string | undefined },
): string {
  return [a, b].map((s) => (s.progress ? `${s.name} ${s.progress}` : s.name)).join(', ');
}

export type HeroMoment = { stage: ChallengeStage; bothCheckedIn: boolean };

/**
 * The haptic for a change (README Haptics): Success when the result is
 * verified (the stage becomes `complete`), Medium when both competitors are
 * checked in. Only on a change while mounted: never on first render, so
 * revisiting a finished event doesn't buzz.
 */
export function heroHaptic(
  previous: HeroMoment | undefined,
  next: HeroMoment,
): 'resultVerified' | 'bothCheckedIn' | null {
  if (!previous) return null;
  if (next.stage === 'complete' && previous.stage !== 'complete') return 'resultVerified';
  if (next.bothCheckedIn && !previous.bothCheckedIn) return 'bothCheckedIn';
  return null;
}
