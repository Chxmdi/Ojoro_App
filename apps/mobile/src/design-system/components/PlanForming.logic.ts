/**
 * Pure rules for `PlanForming` (web reference `planVariant()` and
 * `function PlanForming`; components/PlanForming.md). No React Native imports,
 * so it runs in Node.
 */
import { capitalize, word } from './word';

export const PLAN_VARIANTS = ['early', 'viable', 'almost', 'need-one-more', 'game-on', 'expired'] as const;
export type PlanVariant = (typeof PLAN_VARIANTS)[number];

export type PlanSituation = 'forming' | 'confirmed' | 'calm';

/** What the plan's one button does. */
export type PlanAction = 'commit' | 'invite' | 'open' | null;

/** Avatars shown before +N inside a plan. */
export const PLAN_CLUSTER_MAX = 6;
/** At most this many dashed open spots, however many are left. */
export const PLAN_OPEN_SPOTS_MAX = 2;

/**
 * Port of `planVariant(c, cap, expired)`: expired wins, then full is GAME ON,
 * one short is NEED ONE MORE, ≥75% almost, ≥50% viable, else early.
 */
export function planVariant(count: number, capacity: number, expired?: boolean): PlanVariant {
  if (expired) return 'expired';
  if (count >= capacity) return 'game-on';
  if (capacity - count === 1) return 'need-one-more';
  if (count / capacity >= 0.75) return 'almost';
  if (count / capacity >= 0.5) return 'viable';
  return 'early';
}

export type PlanModelInput = {
  activity: string;
  count: number;
  capacity: number;
  time: string;
  variant?: PlanVariant | undefined;
  expired?: boolean | undefined;
};

export type PlanModel = {
  variant: PlanVariant;
  /** The situation the object sets on its own root. */
  situation: PlanSituation;
  /** Spots still open (never negative). */
  left: number;
  /** PLAN FORMING · CONFIRMED · PLAN. */
  overline: string;
  /** "Football · Tonight 7:30". */
  meta: string;
  /** "6 / 8". */
  countText: string;
  /** 2 MORE · NEED ONE MORE · GAME ON · EXPIRED. */
  head: string;
  /** NEED ONE MORE and GAME ON are display-md; the rest display-sm. */
  headSize: 'display-md' | 'display-sm';
  /** Dashed open spots in the cluster. */
  openSpots: number;
  action: PlanAction;
  /** Progress label: "6 of 8 committed". */
  progressLabel: string;
  /** The spec sentence: "Football plan forming. Seven of eight participants committed. One more participant needed." */
  accessibilityLabel: string;
  /** Dimmed with opacity-expired. */
  dimmed: boolean;
};

export function planModel({ activity, count, capacity, time, variant, expired }: PlanModelInput): PlanModel {
  const v = variant ?? planVariant(count, capacity, expired);
  const left = Math.max(0, capacity - count);
  const gameOn = v === 'game-on';
  const isExpired = v === 'expired';
  return {
    variant: v,
    situation: gameOn ? 'confirmed' : isExpired ? 'calm' : 'forming',
    left,
    overline: gameOn ? 'CONFIRMED' : isExpired ? 'PLAN' : 'PLAN FORMING',
    meta: `${activity} · ${time}`,
    countText: `${count} / ${capacity}`,
    head: gameOn ? 'GAME ON' : v === 'need-one-more' ? 'NEED ONE MORE' : isExpired ? 'EXPIRED' : `${left} MORE`,
    headSize: gameOn || v === 'need-one-more' ? 'display-md' : 'display-sm',
    openSpots: gameOn || isExpired ? 0 : Math.min(left, PLAN_OPEN_SPOTS_MAX),
    action: v === 'need-one-more' ? 'invite' : gameOn ? 'open' : isExpired ? null : 'commit',
    progressLabel: `${count} of ${capacity} committed`,
    accessibilityLabel: planAccessibilityLabel(activity, count, capacity, v),
    dimmed: isExpired,
  };
}

/**
 * The web's `aria-label`, with each sentence starting in capitals as in the
 * spec ("Seven of eight", where the web wrote "seven of eight").
 */
export function planAccessibilityLabel(
  activity: string,
  count: number,
  capacity: number,
  variant: PlanVariant,
): string {
  const left = Math.max(0, capacity - count);
  const state = variant === 'game-on' ? 'confirmed. Game on.' : variant === 'expired' ? 'expired.' : 'forming.';
  const committed = `${capitalize(word(count))} of ${word(capacity)} participants committed.`;
  const needed =
    left && variant !== 'expired'
      ? ` ${capitalize(word(left))} more participant${left > 1 ? 's' : ''} needed.`
      : '';
  return `${activity} plan ${state} ${committed}${needed}`;
}

/**
 * Breakthrough plays when a plan that was gathering (any forming variant)
 * becomes GAME ON. Not on first render, not from expired, not GAME ON → GAME ON.
 */
export function isBreakthrough(previous: PlanVariant | undefined, next: PlanVariant): boolean {
  return previous !== undefined && next === 'game-on' && previous !== 'game-on' && previous !== 'expired';
}

/** Gather plays on the count when it goes up and the plan is still gathering. */
export function isGather(previous: number | undefined, next: number): boolean {
  return previous !== undefined && next > previous;
}
