import { spacing, type SituationId } from '@ojoro/design-tokens';
import type { ReactNode } from 'react';

import { Situation } from '../Situation';

export type BandProps = {
  /** The band's own situation: `forming` for Ojoro Now and latent demand, `after` for a mission or the Passport. */
  situation: SituationId;
  /** Gap between the parts, pt. 16 (Discover's Ojoro Now, default), 14 (FirstHome), 12 (Clan), 20 (You). */
  gap?: number | undefined;
  /**
   * Run edge to edge past the page gutter (`space-5` each side) while the
   * content keeps the gutter. Default true. Pass false inside a container
   * that already has no gutter.
   */
  bleed?: boolean | undefined;
  /** Names the block for screen readers, like the prototype's `<section aria-label>`. */
  accessibilityLabel?: string | undefined;
  children?: ReactNode;
  testID?: string | undefined;
};

const GUTTER = spacing['space-5'];
/** The prototypes' `padding: 28px 20px` (28 sits between space-6 and space-8). */
const BAND_PADDING_Y = 28;

/**
 * A full-bleed section on its own situation ground inside a page of another
 * (Discover's Ojoro Now and FirstHome's PEOPLE WANT THIS on forming; Clan's
 * mission and You's Passport on after). The situation goes on the band's root,
 * so its semantic colours re-resolve inside. Separated by the ground change,
 * never a shadow.
 */
export function Band({
  situation,
  gap = 16,
  bleed = true,
  accessibilityLabel,
  children,
  testID,
}: BandProps) {
  return (
    <Situation
      id={situation}
      testID={testID}
      {...(accessibilityLabel
        ? { role: 'region' as const, 'aria-label': accessibilityLabel }
        : null)}
      style={{
        gap,
        paddingVertical: BAND_PADDING_Y,
        paddingHorizontal: GUTTER,
        marginHorizontal: bleed ? -GUTTER : 0,
      }}
    >
      {children}
    </Situation>
  );
}
