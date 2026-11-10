import { Children, isValidElement, type ReactNode } from 'react';
import { Platform, View } from 'react-native';

/**
 * Children of a `role="list"` container, each in a `listitem` on the web.
 * React Native Web renders `role="list"` as a `ul`, and a `ul` may only hold
 * `li` (axe `aria-required-children`): a Strip (a link or a button) or a
 * pressable row placed straight inside one is invalid HTML for screen readers.
 * On iOS and Android lists have no item requirement, so children pass through
 * untouched (no extra views, no layout change).
 */
export function listItems(children: ReactNode): ReactNode {
  if (Platform.OS !== 'web') return children;
  return Children.map(children, (child) =>
    isValidElement(child) ? (
      <View role="listitem" key={child.key ?? undefined}>
        {child}
      </View>
    ) : (
      child
    ),
  );
}
