import { situations, type ColorToken } from '@ojoro/design-tokens';

import { useSituation } from './Situation';

/**
 * A semantic colour as a value, for props that can't take a className
 * (SVG strokes, status bar, native controls). Prefer classNames elsewhere.
 */
export function useThemeColor(token: ColorToken): string {
  return situations[useSituation()][token];
}
