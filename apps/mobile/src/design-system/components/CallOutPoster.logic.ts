/**
 * Pure rules for `CallOutPoster` (web reference `function CallOutPoster`;
 * components/CallOutPoster.md). No React Native imports.
 */
import { capitalize } from './word';

/**
 * The spec's four words, plus WITHDRAWN (the challenger took it back) and EXPIRED (nobody answered
 * in time): the contract's other call-out states (docs/DESIGN_DECISIONS.md, Step 5 screens: A).
 */
export const CALL_OUT_STATUSES = ['PENDING', 'ACCEPTED', 'COUNTERED', 'DECLINED', 'WITHDRAWN', 'EXPIRED'] as const;
export type CallOutStatus = (typeof CALL_OUT_STATUSES)[number];

export type CallOutModel = {
  status: CallOutStatus;
  /** ACCEPTED is filled (something is happening); the rest are outlined. The word carries it. */
  badgeTone: 'signal' | 'neutral';
  /** Names as set: display type is uppercase. */
  challenger: string;
  opponent: string;
  /** "Call-out. Marcus versus Chimdi, 5K. Pending." */
  accessibilityLabel: string;
};

export function callOutModel(p: {
  challenger: { name: string };
  opponent: { name: string };
  discipline: string;
  when?: string | undefined;
  status?: CallOutStatus | undefined;
}): CallOutModel {
  const status: CallOutStatus =
    p.status && (CALL_OUT_STATUSES as readonly string[]).includes(p.status) ? p.status : 'PENDING';
  const when = p.when ? `, ${p.when}` : '';
  return {
    status,
    badgeTone: status === 'ACCEPTED' ? 'signal' : 'neutral',
    challenger: p.challenger.name.toUpperCase(),
    opponent: p.opponent.name.toUpperCase(),
    accessibilityLabel: `Call-out. ${p.challenger.name} versus ${p.opponent.name}, ${p.discipline}${when}. ${capitalize(status.toLowerCase())}.`,
  };
}
