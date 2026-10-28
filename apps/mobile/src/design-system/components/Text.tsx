import { textStyles, type TextStyleName } from '@ojoro/design-tokens';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { DISPLAY_FAMILY, uiFamily } from '../fonts';

export type TextVariant = TextStyleName;

/** Which semantic colour the text takes. Use `on-*` tones on signal, inverse and tint grounds. */
export type TextTone = 'text' | 'muted' | 'signal' | 'on-signal' | 'on-inverse' | 'on-tint';

const toneClasses: Record<TextTone, string> = {
  text: 'text-text',
  muted: 'text-text-muted',
  signal: 'text-signal',
  'on-signal': 'text-on-signal',
  'on-inverse': 'text-on-inverse',
  'on-tint': 'text-on-tint',
};

export type TextProps = RNTextProps & {
  /** A token text style. Display styles are always uppercase. Default `body`. */
  variant?: TextVariant;
  /** Semantic colour. Defaults to `text`, or `muted` for styles that are muted by spec (overline). */
  tone?: TextTone;
  /** Shorthand for `tone="muted"`. */
  muted?: boolean;
  className?: string;
};

const DISPLAY_MAX_SCALE = 1.3;

function styleFor(variant: TextVariant): TextStyle {
  const s = textStyles[variant];
  return {
    fontFamily: s.family === 'display' ? DISPLAY_FAMILY : uiFamily(s.fontWeight),
    fontSize: s.fontSize,
    lineHeight: s.lineHeight,
    letterSpacing: s.letterSpacing,
    ...(s.uppercase ? { textTransform: 'uppercase' } : null),
    ...(s.tabular ? { fontVariant: ['tabular-nums'] } : null),
  };
}

const variantStyles = Object.fromEntries(
  (Object.keys(textStyles) as TextVariant[]).map((name) => [name, styleFor(name)]),
) as Record<TextVariant, TextStyle>;

/**
 * Ojoro text. Display styles cap dynamic type at 1.3x and wrap, never truncate;
 * UI styles scale with system text size. Colour comes from the situation.
 */
export function Text({ variant = 'body', tone, muted, className, style, ...rest }: TextProps) {
  const spec = textStyles[variant];
  const isDisplay = spec.family === 'display';
  const colour = toneClasses[tone ?? (muted || spec.muted ? 'muted' : 'text')];
  return (
    <RNText
      className={[colour, className].filter(Boolean).join(' ')}
      style={[variantStyles[variant], style]}
      {...(isDisplay ? { maxFontSizeMultiplier: DISPLAY_MAX_SCALE } : null)}
      {...rest}
    />
  );
}
