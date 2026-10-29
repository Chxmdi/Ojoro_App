/**
 * Pure rules for `Rematch` (web reference `function Rematch`;
 * components/Rematch.md). No React Native imports.
 */

export type RematchModel = {
  /** "LAST TIME · CHIMDI BY 43S". */
  overline: string;
  /** "Rematch. Marcus wants a rematch with Chimdi, the 5K." */
  accessibilityLabel: string;
  /** The line after the bold name: " wants the 5K again. Same loop, two weeks." */
  sentence: string;
};

export function rematchModel(p: {
  requester: string;
  opponent: string;
  discipline: string;
  lastResult: string;
  note?: string | undefined;
}): RematchModel {
  const note = p.note?.trim();
  return {
    overline: `LAST TIME · ${p.lastResult}`.toUpperCase(),
    accessibilityLabel: `Rematch. ${p.requester} wants a rematch with ${p.opponent}, ${p.discipline}. Last time: ${p.lastResult}.${note ? ` ${note}` : ''}`,
    sentence: ` wants ${p.discipline} again.${note ? ` ${note}` : ''}`,
  };
}
