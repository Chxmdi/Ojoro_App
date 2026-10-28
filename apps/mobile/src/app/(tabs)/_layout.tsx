import { Tabs } from 'expo-router/js-tabs';

import { TabBar, type TabBarItem } from '@/design-system';
import { track } from '@/lib/analytics';

/** The five tabs (PRD §8.1), keyed by route name. Situations come from each tab's design. */
const TAB_ITEMS = {
  index: { label: 'Home', icon: 'home', situation: 'calm' },
  discover: { label: 'Discover', icon: 'search', situation: 'calm' },
  create: { label: 'Create', icon: 'plus', situation: 'calm', variant: 'create' },
  compete: { label: 'Compete', icon: 'compete', situation: 'live' },
  you: { label: 'You', icon: 'person', situation: 'calm' },
} as const satisfies Record<string, TabBarItem>;

type TabRoute = keyof typeof TAB_ITEMS;

/** Analytics name per tab: the route `index` is the Home tab. */
const SCREEN_NAMES: Record<TabRoute, string> = {
  index: 'home',
  discover: 'discover',
  create: 'create',
  compete: 'compete',
  you: 'you',
};

function isTabRoute(name: string): name is TabRoute {
  return name in TAB_ITEMS;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} items={TAB_ITEMS} />}
      screenListeners={({ route }) => ({
        focus: () => {
          if (isTabRoute(route.name)) track('screen_viewed', { screen: SCREEN_NAMES[route.name] });
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="discover" options={{ title: 'Discover' }} />
      <Tabs.Screen name="create" options={{ title: 'Create' }} />
      <Tabs.Screen name="compete" options={{ title: 'Compete' }} />
      <Tabs.Screen name="you" options={{ title: 'You' }} />
    </Tabs>
  );
}
