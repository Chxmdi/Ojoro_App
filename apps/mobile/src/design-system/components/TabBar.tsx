import type { SituationId } from '@ojoro/design-tokens';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, View } from 'react-native';

import { Situation } from '../Situation';
import { useThemeColor } from '../useThemeColor';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type TabBarItem = {
  /** The visible word, written in sentence case; the bar sets it uppercase. Also the accessible label. */
  label: string;
  icon: IconName;
  /** The tab screen's situation. The bar takes the active tab's ground. */
  situation: SituationId;
  /** `create`: the centre disc (44pt `inverse`, plus icon, no visible label). */
  variant?: 'tab' | 'create';
};

export type TabBarProps = BottomTabBarProps & {
  /** One entry per tab route, keyed by route name. Routes without an entry are not shown. */
  items: Readonly<Record<string, TabBarItem>>;
};

/** Inter 700, 10/12, 0.08em tracking, uppercase (the tab bar's own label size in the screens). */
const LABEL_STYLE = { fontSize: 10, lineHeight: 12, letterSpacing: 0.8 } as const;

/**
 * Ojoro's bottom tab bar, for Expo Router `Tabs` (`tabBar={(p) => <TabBar {...p} items={…} />}`).
 * Top `line` hairline; the ground is the active tab's situation (black on Compete);
 * the active tab is `text` with a 2px `text` bar on its top edge, the others `text-muted`;
 * Create is a 44pt `inverse` disc in the centre.
 */
export function TabBar({ state, descriptors, navigation, insets, items }: TabBarProps) {
  const activeRoute = state.routes[state.index];
  const activeSituation = (activeRoute && items[activeRoute.name]?.situation) ?? 'calm';

  return (
    <Situation
      id={activeSituation}
      role="tablist"
      className="flex-row items-stretch border-t border-line px-space-1"
      style={{ paddingBottom: insets.bottom }}
    >
      {state.routes.map((route, index) => {
        const item = items[route.name];
        if (!item) return null;
        const selected = index === state.index;
        const descriptor = descriptors[route.key];

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!selected && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };
        const onLongPress = () => {
          navigation.emit({ type: 'tabLongPress', target: route.key });
        };

        return (
          <TabBarButton
            key={route.key}
            item={item}
            selected={selected}
            testID={descriptor?.options.tabBarButtonTestID}
            onPress={onPress}
            onLongPress={onLongPress}
          />
        );
      })}
    </Situation>
  );
}

type TabBarButtonProps = {
  item: TabBarItem;
  selected: boolean;
  testID: string | undefined;
  onPress: () => void;
  onLongPress: () => void;
};

function TabBarButton({ item, selected, testID, onPress, onLongPress }: TabBarButtonProps) {
  const text = useThemeColor('text');
  const muted = useThemeColor('text-muted');
  const onInverse = useThemeColor('on-inverse');
  // role / aria-* work on iOS, Android and web alike (react-native-web ignores accessibilityState).
  const a11y = {
    role: 'tab' as const,
    'aria-selected': selected,
    'aria-label': item.label,
    ...(testID ? { testID } : null),
  };

  if (item.variant === 'create') {
    return (
      <Pressable
        {...a11y}
        onPress={onPress}
        onLongPress={onLongPress}
        className="min-h-commit flex-1 items-center justify-center"
      >
        <View className="h-touch w-touch items-center justify-center rounded-pill bg-inverse">
          <Icon name="plus" color={onInverse} />
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      {...a11y}
      onPress={onPress}
      onLongPress={onLongPress}
      className="min-h-commit flex-1 items-center justify-center gap-space-1"
    >
      {selected ? <View className="absolute inset-x-0 top-0 h-[2px] bg-text" /> : null}
      <Icon name={item.icon} color={selected ? text : muted} />
      <Text
        variant="label-sm"
        muted={!selected}
        style={LABEL_STYLE}
        maxFontSizeMultiplier={1.3}
        numberOfLines={1}
      >
        {item.label}
      </Text>
    </Pressable>
  );
}
