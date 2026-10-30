/**
 * CSS custom properties for the admin tool, built from @ojoro/design-tokens (generated from
 * design-handoff/design-system/tokens.json), so the web tool and the app share one source of truth.
 * Situations are [data-theme] scopes, as in the design system's web reference; calm is the default.
 */
import { borderWidth, radius, situationIds, situations, spacing, textStyles } from '@ojoro/design-tokens';

function block(selector: string, vars: Record<string, string | number>): string {
  const body = Object.entries(vars)
    .map(([name, value]) => `--${name}:${typeof value === 'number' ? `${value}px` : value};`)
    .join('');
  return `${selector}{${body}}`;
}

export function textStyleVars(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, style] of Object.entries(textStyles)) {
    out[`${name}-size`] = `${style.fontSize}px`;
    out[`${name}-line`] = `${style.lineHeight}px`;
    out[`${name}-weight`] = String(style.fontWeight);
    out[`${name}-tracking`] = `${style.letterSpacing}px`;
  }
  return out;
}

export function buildTokensCss(): string {
  const parts: string[] = [];
  for (const id of situationIds) {
    const selector = id === 'calm' ? ':root,[data-theme="calm"]' : `[data-theme="${id}"]`;
    parts.push(block(selector, situations[id]));
  }
  const radii: Record<string, string | number> = { ...radius };
  parts.push(block(':root', { ...spacing, ...radii, ...borderWidth, ...textStyleVars() }));
  return parts.join('\n');
}
