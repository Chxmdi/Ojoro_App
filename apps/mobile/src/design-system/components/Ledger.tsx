import { View, type TextStyle } from 'react-native';

import { ledgerRows, type LedgerLine } from './Ledger.logic';
import { Text } from './Text';

export {
  formatMoney,
  ledgerRows,
  ledgerSum,
  spokenMoney,
  type LedgerLine,
  type LedgerRowModel,
} from './Ledger.logic';

export type LedgerProps = {
  /** Lines in order; amounts are signed integer cents (money out is negative). */
  lines: LedgerLine[];
  /** ISO 4217 code for every amount ("USD", "CAD"). Symbols come from it, never from the copy. */
  currency: string;
  /** The bottom line, in title type ("You get", "Paid out to you"). Its amount defaults to the sum of `lines`. */
  total?:
    { label: string; amountCents?: number | undefined; note?: string | undefined } | undefined;
  /** Accessible name ("Revenue, last 30 days"). */
  label?: string | undefined;
  /** BCP 47 locale for the numbers. Default en-US. */
  locale?: string | undefined;
  testID?: string | undefined;
};

const amountStyle: TextStyle = { fontVariant: ['tabular-nums'], textAlign: 'right', flexShrink: 0 };

/**
 * Money lines (HostMembership / HostInsights `.ledger`): label left, amount
 * right in tabular numerals, hairline between rows, the total last in
 * title-sm. Amounts are formatted from integer cents and the currency; money
 * out carries a true minus sign. Each row reads "Refunds: minus $8".
 */
export function Ledger({ lines, currency, total, label, locale, testID }: LedgerProps) {
  const rows = ledgerRows(lines, currency, total, locale);
  return (
    <View testID={testID} role="list" accessibilityLabel={label}>
      {rows.map((r, i) => {
        const variant = r.total ? 'title-sm' : 'body-sm';
        return (
          <View
            key={r.key}
            role="listitem"
            accessible
            accessibilityLabel={r.accessibilityLabel}
            className={`flex-row justify-between gap-space-3 py-[10px] ${i < rows.length - 1 ? 'border-b border-line' : ''}`}
          >
            <Text variant={variant} className="shrink">
              {r.label}
              {r.note ? (
                <Text variant="body-sm" muted>
                  {` · ${r.note}`}
                </Text>
              ) : null}
            </Text>
            <Text variant={variant} style={amountStyle} numberOfLines={1}>
              {r.amount}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
