export const colors = {
  black: '#000000',
  ink: '#141515',
  maroon: '#290000',
  charcoal: '#45484A',
  taupe: '#A7A08B',
  white: '#FFFFFF',
  paper: '#F5F3EE',
  line: '#E7E2D8',
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  hero: 64,
} as const;

export const radius = {
  sm: 10,
  md: 18,
  lg: 28,
  pill: 999,
} as const;

export const typography = {
  display: {
    hero: 48,
    h1: 38,
    h2: 28,
  },
  body: {
    lg: 18,
    md: 16,
    sm: 14,
    xs: 12,
  },
} as const;

export const motion = {
  quick: 140,
  standard: 220,
  deliberate: 360,
} as const;
