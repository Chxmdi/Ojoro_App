/** One line of money. Amounts are integer cents in the ledger's currency; negative for money out (refunds, fees). */
export type LedgerLine = {
  /** Stable key; defaults to the label. */
  key?: string | undefined;
  /** What it is, sentence case ("Drop-ins", "Refunds", "Ojoro service fee"). */
  label: string;
  /** Signed integer cents. */
  amountCents: number;
  /** With `unitCents`: "Drop-ins · 22 × $8". */
  count?: number | undefined;
  unitCents?: number | undefined;
  /** A status or note in words, after the label ("pending", "not connected"). */
  note?: string | undefined;
};

const MINUS = '−';

/**
 * Money from integer cents and an ISO currency: "$1,544", "$8.50", "−$32".
 * Whole amounts drop the cents. Negative amounts use a true minus sign.
 */
export function formatMoney(cents: number, currency: string, locale = 'en-US'): string {
  const whole = Math.round(cents) % 100 === 0;
  const abs = Math.abs(Math.round(cents)) / 100;
  const text = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(abs);
  return cents < 0 ? `${MINUS}${text}` : text;
}

/** Spoken money: "minus $32" rather than a symbol. */
export function spokenMoney(cents: number, currency: string, locale?: string): string {
  const text = formatMoney(Math.abs(cents), currency, locale);
  return cents < 0 ? `minus ${text}` : text;
}

export type LedgerRowModel = {
  key: string;
  /** "Drop-ins · 22 × $8" */
  label: string;
  note: string | undefined;
  /** "$176", "−$32" */
  amount: string;
  accessibilityLabel: string;
  total: boolean;
};

function rowModel(
  line: LedgerLine,
  currency: string,
  locale: string | undefined,
  total: boolean,
): LedgerRowModel {
  const priced =
    line.count !== undefined && line.unitCents !== undefined
      ? `${line.label} · ${line.count} × ${formatMoney(line.unitCents, currency, locale)}`
      : line.label;
  const spokenLabel =
    line.count !== undefined && line.unitCents !== undefined
      ? `${line.label}, ${line.count} at ${formatMoney(line.unitCents, currency, locale)}`
      : line.label;
  return {
    key: line.key ?? line.label,
    label: priced,
    note: line.note,
    amount: formatMoney(line.amountCents, currency, locale),
    accessibilityLabel: `${spokenLabel}${line.note ? `, ${line.note}` : ''}: ${spokenMoney(line.amountCents, currency, locale)}`,
    total,
  };
}

/** Sum of signed integer cents. */
export function ledgerSum(lines: readonly LedgerLine[]): number {
  return lines.reduce((s, l) => s + Math.round(l.amountCents), 0);
}

/** Rows to draw, the total last (its amount defaults to the sum of the lines). */
export function ledgerRows(
  lines: readonly LedgerLine[],
  currency: string,
  total?: { label: string; amountCents?: number | undefined; note?: string | undefined },
  locale?: string,
): LedgerRowModel[] {
  const rows = lines.map((l) => rowModel(l, currency, locale, false));
  if (total) {
    rows.push(
      rowModel(
        {
          key: '__total',
          label: total.label,
          amountCents: total.amountCents ?? ledgerSum(lines),
          note: total.note,
        },
        currency,
        locale,
        true,
      ),
    );
  }
  return rows;
}
