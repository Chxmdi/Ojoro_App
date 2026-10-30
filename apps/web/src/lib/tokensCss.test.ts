import { situations } from '@ojoro/design-tokens';
import { describe, expect, it } from 'vitest';

import { buildTokensCss, textStyleVars } from './tokensCss';

describe('buildTokensCss', () => {
  const css = buildTokensCss();
  it('scopes every situation and defaults to calm', () => {
    expect(css).toContain(':root,[data-theme="calm"]{');
    for (const id of ['forming', 'confirmed', 'live', 'after'])
      expect(css).toContain(`[data-theme="${id}"]{`);
    expect(css).toContain(`--surface:${situations.calm.surface};`);
  });
  it('carries spacing, radius and type as px', () => {
    expect(css).toContain('--space-4:16px;');
    expect(css).toContain('--radius-pill:999px;');
    expect(css).toContain('--radius-disc:50%;');
    expect(textStyleVars()['label-tracking']).toBe('1.04px');
  });
});
