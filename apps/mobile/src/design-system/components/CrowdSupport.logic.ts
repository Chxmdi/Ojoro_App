/**
 * Pure rules for `CrowdSupport` (web reference `function CrowdSupport`;
 * components/CrowdSupport.md). No React Native imports. Backing is social
 * only: it never affects the result and never involves money or points.
 */

export type CrowdSide = { name: string; count: number };
export type CrowdKey = 'a' | 'b';

export type CrowdSideModel = {
  /** The count as shown, whole and never negative. */
  count: string;
  /** Under the count: "BACK CHIMDI". */
  caption: string;
  /** BACKING on the side you back, otherwise "BACK CHIMDI". */
  button: string;
  /** Primary on the side you back, secondary otherwise. */
  variant: 'primary' | 'secondary';
  backing: boolean;
  /** The count read aloud: "78 people back Chimdi", "1 person backs Chimdi". */
  spoken: string;
  /** The button read aloud: "Back Chimdi", or "Backing Chimdi" (selected). */
  buttonLabel: string;
};

function whole(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function crowdSide(
  side: CrowdSide,
  key: CrowdKey,
  backing: CrowdKey | undefined,
): CrowdSideModel {
  const n = whole(side.count);
  const mine = backing === key;
  return {
    count: String(n),
    caption: `BACK ${side.name}`.toUpperCase(),
    button: mine ? 'BACKING' : `BACK ${side.name}`.toUpperCase(),
    variant: mine ? 'primary' : 'secondary',
    backing: mine,
    spoken: `${n} ${n === 1 ? 'person backs' : 'people back'} ${side.name}`,
    buttonLabel: `${mine ? 'Backing' : 'Back'} ${side.name}`,
  };
}
