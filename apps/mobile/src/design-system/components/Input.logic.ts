/**
 * Pure rules for `Input` (design-system/components/Input.md and the web
 * reference `.oj-input*` styles). No React Native imports, so it runs in Node.
 */
import type { ColorToken } from '@ojoro/design-tokens';

/** The line under the message: an error shows `Error: ` in bold before the text. */
export const ERROR_PREFIX = 'Error: ';

export type InputMessage =
  | { kind: 'error'; text: string; spoken: string }
  | { kind: 'hint'; text: string; spoken: string }
  | null;

/** Error wins over hint, as on the web. Empty strings count as absent. */
export function inputMessage(hint?: string, error?: string): InputMessage {
  if (error) return { kind: 'error', text: error, spoken: ERROR_PREFIX + error };
  if (hint) return { kind: 'hint', text: hint, spoken: hint };
  return null;
}

export type InputRule = { width: number; color: ColorToken };

/**
 * The bottom rule of the well: `line-strong` 2px at rest, `signal` 2px on focus,
 * `text` 4px on error (error wins over focus, as in bundle.css). Never red.
 */
export function inputRule({ focused, error }: { focused: boolean; error: boolean }): InputRule {
  if (error) return { width: 4, color: 'text' };
  if (focused) return { width: 2, color: 'signal' };
  return { width: 2, color: 'line-strong' };
}

/** Field padding (space-3), and 44 on the left when an icon sits in the well. */
export function inputPadding(hasIcon: boolean) {
  return { paddingLeft: hasIcon ? 44 : 12, paddingRight: 12 };
}

/** Multiline wells are three rows of 24px text plus space-3 above and below (textarea rows=3). */
export const MULTILINE_MIN_HEIGHT = 3 * 24 + 2 * 12;
