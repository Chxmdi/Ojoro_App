/**
 * Pure rules for `VerificationBadge` (`VERIFY` map in bundle.js;
 * components/VerificationBadge.md). No React Native imports, so it runs in Node.
 */

export const VERIFICATION_LEVELS = ['checked-in', 'result', 'identity', 'host'] as const;
export type VerificationLevel = (typeof VERIFICATION_LEVELS)[number];

/** The word on the badge, exactly as the web reference writes it. */
export const VERIFY: Record<VerificationLevel, string> = {
  'checked-in': 'CHECKED IN',
  result: 'RESULT VERIFIED',
  identity: 'ID VERIFIED',
  host: 'TRUSTED HOST',
};

/** How the badge reads aloud: sentence case, so "ID" isn't spelt as a word in caps. */
const SPOKEN: Record<VerificationLevel, string> = {
  'checked-in': 'Checked in',
  result: 'Result verified',
  identity: 'ID verified',
  host: 'Trusted host',
};

export type VerificationModel = {
  word: string;
  spoken: string;
  /** Filled O = confirmed by Ojoro (result, host); outlined = confirmed by the person. */
  filled: boolean;
};

export function verificationModel(level: VerificationLevel | undefined): VerificationModel {
  const l: VerificationLevel = level && level in VERIFY ? level : 'checked-in';
  return { word: VERIFY[l], spoken: SPOKEN[l], filled: l === 'result' || l === 'host' };
}
