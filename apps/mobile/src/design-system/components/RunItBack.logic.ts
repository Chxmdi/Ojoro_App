/**
 * Pure rules for `RunItBack` (web reference `function RunItBack`;
 * components/RunItBack.md). No React Native imports, so it runs in Node.
 */

/** Avatars shown before +N (web: `max: 7`). */
export const RUN_IT_BACK_CLUSTER_MAX = 7;

export type RunItBackModelInput = {
  activity: string;
  crew: string;
  lastDate: string;
  count: number;
  suggested: string;
};

export type RunItBackModel = {
  /** "LAST TUE 6 OCT · 8 PLAYED". */
  overline: string;
  /** The question, one line each: RUN IT / BACK?. */
  question: readonly ['RUN IT', 'BACK?'];
  /** "Run it back. Football with Thursday FC + 2, Tue 13 Oct, 7:30 at Jeanne-Mance". */
  accessibilityLabel: string;
  /**
   * What RUN IT BACK does, for screen readers (RunItBack.md, PRD §9.8): it
   * opens a NEW plan and invites the same people; it never copies attendance.
   */
  runHint: string;
};

export function runItBackModel({
  activity,
  crew,
  lastDate,
  count,
  suggested,
}: RunItBackModelInput): RunItBackModel {
  return {
    overline: `LAST ${lastDate} · ${count} PLAYED`.toUpperCase(),
    question: ['RUN IT', 'BACK?'],
    accessibilityLabel: `Run it back. ${activity} with ${crew}, ${suggested}.`,
    runHint: "Opens a new plan and invites the same people. Nobody is in until they tap I'M DOWN.",
  };
}
