import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  brand,
  contrastRatio,
  parseColor,
  situationIds,
  situations,
  situationVariables,
  textStyles,
} from './index';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const resolved = JSON.parse(
  readFileSync(`${root}design-handoff/design-system/tokens.resolved.json`, 'utf8'),
) as { brand: Record<string, string>; situations: Record<string, Record<string, string>> };

describe('OJORO KINETIC tokens', () => {
  it('has exactly the six brand colours', () => {
    expect(Object.values(brand)).toEqual(['#000000', '#141515', '#290000', '#45484a', '#a7a08b', '#ffffff']);
  });

  it('resolves every situation the same way as tokens.resolved.json', () => {
    expect(brand).toEqual(resolved.brand);
    expect(situations).toEqual(resolved.situations);
  });

  it.each(situationIds)('meets text contrast on %s', (id) => {
    const s = situations[id];
    for (const ground of [s.surface, s['surface-raised']]) {
      expect(contrastRatio(s.text, ground)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(s['text-muted'], ground)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio(s['on-signal'], s.signal)).toBeGreaterThanOrEqual(7);
  });

  it('never sets display type below 24px and keeps it uppercase', () => {
    for (const style of Object.values(textStyles)) {
      if (style.family !== 'display') continue;
      expect(style.fontSize).toBeGreaterThanOrEqual(24);
      expect(style.uppercase).toBe(true);
    }
  });

  it('converts multipliers and em to absolute values', () => {
    expect(textStyles['display-hero']).toMatchObject({ fontSize: 120, lineHeight: 105.6, letterSpacing: 0.6 });
    expect(textStyles.label).toMatchObject({ letterSpacing: 1.04, uppercase: true });
    expect(textStyles.overline).toMatchObject({ uppercase: true, muted: true });
  });

  it('exposes situation variables for NativeWind', () => {
    expect(situationVariables('confirmed')['--surface']).toBe('#290000');
    expect(situationVariables('live')['--text']).toBe('#ffffff');
  });

  it('parses hex and rgba colours and rejects others', () => {
    expect(parseColor('#290000')).toEqual({ r: 41, g: 0, b: 0, a: 1 });
    expect(parseColor('rgba(20,21,21,0.12)')).toEqual({ r: 20, g: 21, b: 21, a: 0.12 });
    expect(() => parseColor('red')).toThrow();
  });

  it('keeps the generated files in sync with tokens.json', () => {
    expect(() =>
      execFileSync('node', [`${root}scripts/build-tokens.mjs`, '--check'], { stdio: 'pipe' }),
    ).not.toThrow();
  });
});
