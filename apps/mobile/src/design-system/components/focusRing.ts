/**
 * The keyboard and switch-control focus ring (design-system README,
 * Accessibility): a 2px solid `focus` outline with a 2px offset.
 * No React Native imports, so it runs in Node.
 */

export function focusRingStyle(color: string) {
  return { outlineWidth: 2, outlineStyle: 'solid', outlineColor: color, outlineOffset: 2 } as const;
}

type Matchable = { matches?: (selector: string) => boolean };

/**
 * Whether a focus event should show the ring, like CSS `:focus-visible`: on the
 * web, only when the browser says so (keyboard, not a mouse click); on native,
 * focus only comes from a keyboard or switch control, so always.
 */
export function isFocusVisible(target: unknown, isWeb: boolean): boolean {
  if (!isWeb) return true;
  const el = target as Matchable | null | undefined;
  if (!el || typeof el.matches !== 'function') return true;
  try {
    return el.matches(':focus-visible');
  } catch {
    return true;
  }
}
