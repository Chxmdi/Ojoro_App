import Svg, { Path } from 'react-native-svg';

import { useThemeColor } from '../useThemeColor';

/**
 * Ojoro line icons: 24 grid, 2px stroke, square caps, mitred joins. Paths are
 * copied from the web reference (design-system/web-reference/bundle.js).
 * home, compete and person come from the tab bar drawn in the screen designs.
 */
export const ICONS = {
  close: 'M6 6 L18 18 M18 6 L6 18',
  back: 'M15 5 L8 12 L15 19',
  forward: 'M9 5 L16 12 L9 19',
  plus: 'M12 5 V19 M5 12 H19',
  more: 'M5 12 h.01 M12 12 h.01 M19 12 h.01',
  share: 'M12 15 V4 M7 9 L12 4 L17 9 M5 13 V20 H19 V13',
  bell: 'M6 16 V11 a6 6 0 0 1 12 0 V16 L20 18 H4 Z M10 21 H14',
  chat: 'M4 5 H20 V16 H11 L6 20 V16 H4 Z',
  pin: 'M12 21 C 7 15, 5 12, 5 9 a7 7 0 0 1 14 0 C 19 12, 17 15, 12 21 Z M12 9 h.01',
  clock: 'M12 7 V12 L15 14 M12 3 a9 9 0 1 0 0.01 0',
  check: 'M5 12.5 L10 17.5 L19 7',
  alert: 'M12 7 V13 M12 17 h.01 M12 3 a9 9 0 1 0 0.01 0',
  offline:
    'M3 3 L21 21 M8.5 16.5 a5 5 0 0 1 7 0 M5 12.5 a10 10 0 0 1 4 -2.5 M19 12.5 a10 10 0 0 0 -3 -2 M12 20 h.01',
  lights: 'M12 2 V5 M4.5 5.5 L6.5 7.5 M19.5 5.5 L17.5 7.5 M7 14 a5 5 0 1 1 10 0 V17 H7 Z M9 21 H15',
  search: 'M10.5 4 a6.5 6.5 0 1 0 0.01 0 M15.5 15.5 L20 20',
  people:
    'M9 11 a3.5 3.5 0 1 0 0.01 0 M3 20 C 3 16, 6 14.5, 9 14.5 S 15 16, 15 20 M16 4.5 a3.5 3.5 0 0 1 0 7 M17.5 14.5 C 19.5 15, 21 16.5, 21 20',
  home: 'M4 11 L12 4 L20 11 V20 H14 V14 H10 V20 H4 Z',
  compete: 'M9 21 L15 3 M3 8 H8 M3 16 H6 M16 8 H21 M18 16 H21',
  person: 'M12 4 a4 4 0 1 0 0.01 0 M4 21 C 4 16, 8 14, 12 14 S 20 16, 20 21',
} as const;

export type IconName = keyof typeof ICONS;

export type IconProps = {
  name: IconName;
  /** 24 in buttons and headers; 16–20 inside text lines. */
  size?: number;
  strokeWidth?: number;
  /** Defaults to the situation's `text`. */
  color?: string;
  /** Only when the icon stands alone and means something. Otherwise it's hidden from screen readers. */
  label?: string;
};

export function Icon({ name, size = 24, strokeWidth = 2, color, label }: IconProps) {
  const text = useThemeColor('text');
  const a11y = label
    ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: label }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...a11y}>
      <Path
        d={ICONS[name]}
        stroke={color ?? text}
        strokeWidth={strokeWidth}
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </Svg>
  );
}
