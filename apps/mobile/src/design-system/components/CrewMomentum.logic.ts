/** Faces shown before +N (web `max: 5`). */
export const CREW_CLUSTER_MAX = 5;

export type CrewMomentumModel = {
  overline: string;
  rhythmLabel: string;
  accessibilityLabel: string;
  /** NONE: no next row · OPEN: I'M DOWN · JOINED: YOU'RE DOWN. */
  join: 'none' | 'view' | 'open' | 'joined';
};

/**
 * Port of `function CrewMomentum` (bundle.js): "CREW · 14" over the name, the
 * rhythm labelled with its real week count, and a NEXT row whose I'M DOWN
 * joins the next plan directly.
 */
export function crewMomentumModel(p: {
  crew: string;
  memberCount: number;
  weeks: readonly number[];
  next?: string | undefined;
  canJoin: boolean;
  joined?: boolean | undefined;
}): CrewMomentumModel {
  const n = Math.max(0, Math.floor(p.memberCount));
  const join = !p.next ? 'none' : p.joined ? 'joined' : p.canJoin ? 'open' : 'view';
  return {
    overline: `CREW · ${n}`,
    rhythmLabel: p.weeks.length
      ? `RHYTHM · ${p.weeks.length} WEEK${p.weeks.length === 1 ? '' : 'S'}`
      : 'RHYTHM',
    accessibilityLabel: `${p.crew} crew, ${n} member${n === 1 ? '' : 's'}`,
    join,
  };
}
