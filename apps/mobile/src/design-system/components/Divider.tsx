import { View } from 'react-native';

import { Text } from './Text';

export type DividerKind = 'hair' | 'strong' | 'mark';

export type DividerProps = {
  /** `hair` between strips (default) · `strong` between sections · `mark` competition and VS only. */
  kind?: DividerKind;
  /** An overline set into the rule: TONIGHT, THIS WEEK, VS. */
  label?: string;
};

/** Rule styles from bundle.css: 1px `line`, 2px `line-strong`, or the 6px Mark skewed -24°. */
const rule: Record<DividerKind, string> = {
  hair: 'h-px bg-line',
  strong: 'h-[2px] bg-line-strong',
  mark: 'h-[6px] bg-text',
};

const markSkew = { transform: [{ skewX: '-24deg' }] };

/**
 * Separation between editorial blocks. Prefer a ground change or space; never
 * stack two. Unlabelled it's decorative and hidden; labelled it's a separator
 * named by its label, and the overline is read once.
 */
export function Divider({ kind = 'hair', label }: DividerProps) {
  const style = kind === 'mark' ? markSkew : undefined;
  if (label) {
    return (
      <View
        className="flex-row items-center gap-space-3"
        role="separator"
        accessible
        accessibilityLabel={label}
      >
        <Text variant="overline">{label}</Text>
        <View className={`flex-1 ${rule[kind]}`} style={style} />
      </View>
    );
  }
  return (
    <View
      className={rule[kind]}
      style={style}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    />
  );
}
