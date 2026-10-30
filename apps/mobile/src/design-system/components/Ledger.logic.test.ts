import { describe, expect, it } from 'vitest';

import { formatMoney, ledgerRows, ledgerSum, spokenMoney } from './Ledger.logic';

describe('formatMoney', () => {
  it('formats integer cents, dropping whole cents', () => {
    expect(formatMoney(154400, 'USD')).toBe('$1,544');
    expect(formatMoney(850, 'USD')).toBe('$8.50');
    expect(formatMoney(0, 'USD')).toBe('$0');
  });
  it('uses a true minus sign for money out', () => {
    expect(formatMoney(-3200, 'USD')).toBe('−$32');
  });
  it('follows the currency and locale', () => {
    expect(formatMoney(3500, 'EUR', 'en-US')).toBe('€35');
    expect(formatMoney(3500, 'CAD', 'en-CA')).toBe('$35');
    expect(formatMoney(3500, 'CAD', 'en-US')).toBe('CA$35');
  });
  it('rounds stray fractions of a cent', () => {
    expect(formatMoney(849.6, 'USD')).toBe('$8.50');
  });
});

describe('spokenMoney', () => {
  it('says minus in words', () => {
    expect(spokenMoney(-800, 'USD')).toBe('minus $8');
    expect(spokenMoney(800, 'USD')).toBe('$8');
  });
});

describe('ledgerRows', () => {
  const lines = [
    { label: 'Drop-ins', amountCents: 17600, count: 22, unitCents: 800 },
    { label: 'Refunds', amountCents: -800 },
    { key: 'fee', label: 'Ojoro service fee', amountCents: -3600, note: 'placeholder rate' },
  ];

  it('builds priced labels and amounts', () => {
    const rows = ledgerRows(lines, 'USD');
    expect(rows.map((r) => [r.key, r.label, r.amount])).toEqual([
      ['Drop-ins', 'Drop-ins · 22 × $8', '$176'],
      ['Refunds', 'Refunds', '−$8'],
      ['fee', 'Ojoro service fee', '−$36'],
    ]);
    expect(rows[0]!.accessibilityLabel).toBe('Drop-ins, 22 at $8: $176');
    expect(rows[2]!.accessibilityLabel).toBe('Ojoro service fee, placeholder rate: minus $36');
    expect(rows.some((r) => r.total)).toBe(false);
  });

  it('adds a total that defaults to the sum', () => {
    expect(ledgerSum(lines)).toBe(13200);
    const rows = ledgerRows(lines, 'USD', { label: 'You get' });
    expect(rows.at(-1)).toMatchObject({ label: 'You get', amount: '$132', total: true });
    const fixed = ledgerRows(lines, 'USD', { label: 'Paid out', amountCents: 41200 });
    expect(fixed.at(-1)!.amount).toBe('$412');
  });
});
