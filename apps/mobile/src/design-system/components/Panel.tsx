import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Text } from './Text';

export const PANEL_TITLE_VARIANTS = ['title', 'title-sm', 'display-sm'] as const;
export type PanelTitleVariant = (typeof PANEL_TITLE_VARIANTS)[number];

export type PanelProps = {
  /** The overline at the top: NOTHING ON FOR VOLLEYBALL, BEST MATCH, RITUAL. */
  overline?: string | undefined;
  title?: string | undefined;
  /** `title` (default: Discover, FirstHome, Create) · `title-sm` (States) · `display-sm` (CrewHome, Result). */
  titleVariant?: PanelTitleVariant | undefined;
  /** The `body-sm` line under the title. */
  body?: string | undefined;
  /** Mute the body (Create's "Why: …"). Default false. */
  bodyMuted?: boolean | undefined;
  /** Anything between the body and the note: a Progress, a label, a score. */
  children?: ReactNode;
  /** The muted caption under the content (privacy lines: "Shown as a count…"). */
  note?: string | undefined;
  /** Buttons in a wrapping row at the bottom, 8pt apart. */
  actions?: ReactNode;
  /** `start` (default) or `end` (Create's 2 MORE IDEAS · I'M DOWN, 4pt apart). */
  actionsAlign?: 'start' | 'end' | undefined;
  /** Gap between the parts: 8 (Result, States), 12 (default) or 16 (After, host screens). */
  gap?: 8 | 12 | 16 | undefined;
  /** Names the block for screen readers, like the prototype's `<section aria-label>`. */
  accessibilityLabel?: string | undefined;
  testID?: string | undefined;
};

const gapClass = { 8: 'gap-space-2', 12: 'gap-space-3', 16: 'gap-space-4' } as const;

/**
 * The contained block (README "Cards": `surface-raised`, square, 20pt in) that
 * the screens use when something needs containment: latent demand, BEST MATCH,
 * bring your people, a ritual, a result to confirm. Overline, title, body,
 * your content, a muted note, then actions. No shadow, no rounding.
 */
export function Panel({
  overline,
  title,
  titleVariant = 'title',
  body,
  bodyMuted = false,
  children,
  note,
  actions,
  actionsAlign = 'start',
  gap = 12,
  accessibilityLabel,
  testID,
}: PanelProps) {
  return (
    <View
      testID={testID}
      {...(accessibilityLabel
        ? { role: 'region' as const, 'aria-label': accessibilityLabel }
        : null)}
      className={`bg-surface-raised p-space-5 ${gapClass[gap]}`}
    >
      {overline ? <Text variant="overline">{overline}</Text> : null}
      {title ? <Text variant={titleVariant}>{title}</Text> : null}
      {body ? (
        <Text variant="body-sm" muted={bodyMuted}>
          {body}
        </Text>
      ) : null}
      {children}
      {note ? (
        <Text variant="caption" muted>
          {note}
        </Text>
      ) : null}
      {actions ? (
        <View
          className={
            actionsAlign === 'end'
              ? 'flex-row flex-wrap items-center justify-end gap-space-1'
              : 'flex-row flex-wrap items-center gap-space-2'
          }
        >
          {actions}
        </View>
      ) : null}
    </View>
  );
}
