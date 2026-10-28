import { Platform } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useThemeColor } from '../useThemeColor';

/**
 * The brand's graphic language, ported from `Graphic` in the web reference
 * (design-system/web-reference/bundle.js): the O, the Trail, the Mark and the
 * scribbles, on a 48 viewBox. Strokes take the situation's `text`.
 *
 * Web → RN: `className` (used on the web only to tint with `oj-signal-ink`)
 * becomes `color`. The Trail's `strokeDasharray="1 0"` is a no-op and is left out.
 */
export const GRAPHIC_KINDS = [
  'o',
  'trail',
  'mark',
  'scribble-circle',
  'underline',
  'arrow',
  'crown',
] as const;

export type GraphicKind = (typeof GRAPHIC_KINDS)[number];

export type GraphicProps = {
  kind?: GraphicKind;
  /** Width and height in pt. Default 48. */
  size?: number;
  /** Stroke on the 48 grid. Default 3; the Mark doubles it, scribbles use 0.7×. */
  strokeWidth?: number;
  /** Only if the graphic means something. Otherwise it's decorative and hidden from screen readers. */
  label?: string;
  /** Defaults to the situation's `text`. Pass `useThemeColor('signal')` for signal ink. */
  color?: string;
};

/** Props that hide an SVG from assistive tech, or label it as an image. */
function svgA11y(label?: string) {
  if (label) {
    return Platform.OS === 'web'
      ? { role: 'img' as const, 'aria-label': label }
      : { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: label };
  }
  return Platform.OS === 'web'
    ? // react-native-svg passes props straight to the DOM on web, where RN's a11y props are unknown.
      { 'aria-hidden': true }
    : {
        accessibilityElementsHidden: true,
        importantForAccessibility: 'no-hide-descendants' as const,
      };
}

function Shape({ kind, stroke, sw }: { kind: GraphicKind; stroke: string; sw: number }) {
  const line = { fill: 'none', stroke } as const;
  switch (kind) {
    case 'trail':
      return (
        <Path
          d="M3 38 C 12 36, 10 20, 20 22 S 30 34, 36 24 S 40 8, 45 6"
          {...line}
          strokeWidth={sw}
          strokeLinecap="round"
        />
      );
    case 'mark':
      return <Path d="M14 44 L34 4" stroke={stroke} strokeWidth={sw * 2} strokeLinecap="square" />;
    case 'scribble-circle':
      return (
        <Path
          d="M40 14 C 34 5, 12 4, 6 16 C 0 30, 14 44, 28 42 C 42 40, 46 26, 38 14 C 34 8, 26 6, 20 8"
          {...line}
          strokeWidth={sw * 0.7}
          strokeLinecap="round"
        />
      );
    case 'underline':
      return (
        <Path
          d="M3 30 C 14 26, 30 25, 45 27 M8 35 C 20 32, 32 32, 42 33"
          {...line}
          strokeWidth={sw * 0.7}
          strokeLinecap="round"
        />
      );
    case 'arrow':
      return (
        <Path
          d="M4 34 C 14 20, 26 16, 40 16 M32 9 L41 16 L33 24"
          {...line}
          strokeWidth={sw * 0.7}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    case 'crown':
      return (
        <Path
          d="M6 34 L10 14 L18 26 L24 10 L30 26 L38 14 L42 34 Z"
          {...line}
          strokeWidth={sw * 0.7}
          strokeLinejoin="round"
        />
      );
    case 'o':
    default:
      return <Circle cx={24} cy={24} r={20} {...line} strokeWidth={sw} />;
  }
}

export function Graphic({ kind = 'o', size = 48, strokeWidth = 3, label, color }: GraphicProps) {
  const text = useThemeColor('text');
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" {...svgA11y(label)}>
      <Shape kind={kind} stroke={color ?? text} sw={strokeWidth} />
    </Svg>
  );
}

export type CheckProps = {
  /** Default 16, as in the web reference. */
  size?: number;
  /** Defaults to the situation's `text`. On a signal fill pass `on-signal`. */
  color?: string;
};

/**
 * The 16px check that sits before a word (verified badge, selected chip,
 * YOU'RE DOWN). Always decorative: the word next to it carries the meaning.
 */
export function Check({ size = 16, color }: CheckProps) {
  const text = useThemeColor('text');
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" {...svgA11y()}>
      <Path
        d="M3 8.5 L6.5 12 L13 4.5"
        fill="none"
        stroke={color ?? text}
        strokeWidth={2.2}
        strokeLinecap="square"
      />
    </Svg>
  );
}
