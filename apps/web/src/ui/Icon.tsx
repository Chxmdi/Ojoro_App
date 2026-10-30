/** Ojoro line icons (24 grid, 2px stroke, square caps, mitred joins), paths from the design system. */
export const ICONS = {
  close: 'M6 6 L18 18 M18 6 L6 18',
  back: 'M15 5 L8 12 L15 19',
  forward: 'M9 5 L16 12 L9 19',
  clock: 'M12 7 V12 L15 14 M12 3 a9 9 0 1 0 0.01 0',
  check: 'M5 12.5 L10 17.5 L19 7',
  alert: 'M12 7 V13 M12 17 h.01 M12 3 a9 9 0 1 0 0.01 0',
  offline:
    'M3 3 L21 21 M8.5 16.5 a5 5 0 0 1 7 0 M5 12.5 a10 10 0 0 1 4 -2.5 M19 12.5 a10 10 0 0 0 -3 -2 M12 20 h.01',
  search: 'M10.5 4 a6.5 6.5 0 1 0 0.01 0 M15.5 15.5 L20 20',
  pin: 'M12 21 C 7 15, 5 12, 5 9 a7 7 0 0 1 14 0 C 19 12, 17 15, 12 21 Z M12 9 h.01',
  person: 'M12 4 a4 4 0 1 0 0.01 0 M4 21 C 4 16, 8 14, 12 14 S 20 16, 20 21',
  more: 'M5 12 h.01 M12 12 h.01 M19 12 h.01',
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 20,
  label,
}: {
  name: IconName;
  size?: number;
  label?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      {...(label
        ? { role: 'img', 'aria-label': label }
        : { 'aria-hidden': true, focusable: false })}
      style={{ flex: 'none' }}
    >
      <path
        d={ICONS[name]}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}
