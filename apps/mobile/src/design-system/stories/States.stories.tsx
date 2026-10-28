/**
 * Screens/States: the system-states reference sheet (design-handoff
 * screens/States.png, prototype/States.dc.html, artboard 1720×960). It's a
 * reference sheet, not a product route: no data fetching, and every name,
 * place, count and time below is sample content from the design.
 */
import type { SituationId } from '@ojoro/design-tokens';
import type { Meta, StoryObj } from '@storybook/react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Situation } from '../Situation';
import { useThemeColor } from '../useThemeColor';
import { ActivityStrip } from '../components/ActivityStrip';
import type { Person } from '../components/AvatarCluster';
import { Button } from '../components/Button';
import { Divider } from '../components/Divider';
import { Icon } from '../components/Icon';
import { Input } from '../components/Input';
import { PlanForming } from '../components/PlanForming';
import { loadingProps, Skeleton } from '../components/Skeleton';
import { Text } from '../components/Text';
import { Toast } from '../components/Toast';
import { onSituation } from './storyKit';

/* ---------- Sample content (from States.dc.html) ---------- */

const PEOPLE: Person[] = [
  { name: 'Ade B' },
  { name: 'Chimdi O' },
  { name: 'Marcus T' },
  { name: 'Lena R' },
  { name: 'Sam K' },
  { name: 'Yara M' },
];

const OFFLINE_PLAN = {
  activity: 'Football',
  count: 6,
  capacity: 8,
  participants: PEOPLE,
  time: 'Tonight 7:30',
  place: 'Jeanne-Mance Park',
  joined: true,
};

const EXPIRED_PLAN = {
  activity: 'Volleyball',
  count: 3,
  capacity: 8,
  participants: PEOPLE.slice(0, 3),
  time: 'Last night 8:00',
  place: 'Parc La Fontaine',
  expired: true,
};

const STILL_ON = {
  activity: 'Beach volleyball',
  time: '7:00',
  place: 'Parc Jarry · 4 km',
  count: 5,
  capacity: 8,
};

const FULL_ACTIVITY = {
  activity: 'Pickup football',
  time: '7:30',
  place: 'Jeanne-Mance Park',
  status: 'full' as const,
};

/* ---------- Sheet layout ---------- */

/** The artboard: 1720 × 960, 40/20 padding, four columns 40 apart. */
const ARTBOARD = { width: 1720, height: 960, padY: 40, padX: 20, gap: 40 } as const;
const PANEL_HEIGHT = 760;

/** The 1px `line` frame drawn outside the panel, like `box-shadow: 0 0 0 1px var(--line)`. */
function Frame() {
  const line = useThemeColor('line');
  return <View pointerEvents="none" style={[styles.frame, { borderColor: line }]} />;
}

function Column({
  label,
  title,
  note,
  situation,
  panelClassName,
  fixedHeight,
  children,
}: {
  label: string;
  title: string;
  note: string;
  situation: SituationId;
  panelClassName: string;
  fixedHeight: boolean;
  children: ReactNode;
}) {
  return (
    <View role="region" aria-label={label} className="min-w-0 flex-1 gap-space-4">
      <View className="gap-space-1">
        <Text variant="display-sm" role="heading">
          {title}
        </Text>
        <Text variant="body-sm" muted>
          {note}
        </Text>
      </View>
      <Situation
        id={situation}
        className={`relative ${panelClassName}`}
        style={fixedHeight ? { height: PANEL_HEIGHT } : { minHeight: 480 }}
      >
        {children}
        <Frame />
      </Situation>
    </View>
  );
}

function MutedClock() {
  return <Icon name="clock" size={16} color={useThemeColor('text-muted')} />;
}

function StatesSheet({ width = ARTBOARD.width }: { width?: number }) {
  const wide = width >= ARTBOARD.width;
  const fixed = wide;
  return (
    <Situation
      id="calm"
      ground={false}
      className="bg-surface-raised"
      style={
        wide
          ? {
              width: ARTBOARD.width,
              height: ARTBOARD.height,
              paddingVertical: ARTBOARD.padY,
              paddingHorizontal: ARTBOARD.padX,
              flexDirection: 'row',
              gap: ARTBOARD.gap,
              overflow: 'hidden',
            }
          : { width, paddingVertical: 40, paddingHorizontal: 20, gap: 40 }
      }
    >
      <Column
        label="Loading"
        title="LOADING"
        note="After 300 ms, placeholders shaped like what's coming. Never a spinner over a blank screen."
        situation="calm"
        panelClassName="gap-space-6 p-space-5"
        fixedHeight={fixed}
      >
        <Text variant="display-xs" style={{ letterSpacing: 24 * 0.06 }}>
          OJORO
        </Text>
        <View {...loadingProps('Loading today')}>
          <Skeleton kind="text" lines={2} delay={0} />
        </View>
        <View {...loadingProps('Loading plan')}>
          <Skeleton kind="object" delay={0} />
        </View>
        <View {...loadingProps('Loading activity')}>
          <Skeleton kind="strip" delay={0} />
        </View>
        <View {...loadingProps('Loading activity')}>
          <Skeleton kind="strip" delay={0} />
        </View>
      </Column>

      <Column
        label="Offline"
        title="OFFLINE"
        note="The last confirmed state stays on screen and says how old it is. Taps queue and say so."
        situation="forming"
        panelClassName=""
        fixedHeight={fixed}
      >
        <PlanForming {...OFFLINE_PLAN} />
        <View className="flex-row items-center px-space-6" style={{ gap: 6 }}>
          <MutedClock />
          <Text variant="caption" muted>
            Count as of 7:02 PM
          </Text>
        </View>
        <View className="mt-auto p-space-5">
          <Toast kind="offline" message="Offline. Showing the last count from 7:02." announce={false} />
        </View>
      </Column>

      <Column
        label="Expired plan"
        title="EXPIRED"
        note="A plan that didn't come together never dead-ends. It offers what's still on."
        situation="calm"
        panelClassName="gap-space-5"
        fixedHeight={fixed}
      >
        <PlanForming {...EXPIRED_PLAN} />
        <View className="gap-space-2 px-space-5 pb-space-5">
          <Text variant="display-sm">IT DIDN'T COME TOGETHER.</Text>
          <Text variant="body-sm">3 of 8 by the deadline. Nobody was charged or marked as a no-show.</Text>
          <Divider label="STILL ON TONIGHT" />
          <ActivityStrip {...STILL_ON} onPress={() => {}} />
          <Button variant="primary" block className="mt-space-2" onPress={() => {}}>
            TRY AGAIN THIS WEEKEND
          </Button>
        </View>
      </Column>

      <Column
        label="Couldn't join"
        title="COULDN'T JOIN"
        note="Errors say what happened in words, with the alert icon and one next step. Never red."
        situation="calm"
        panelClassName="gap-space-5 p-space-5"
        fixedHeight={fixed}
      >
        <ActivityStrip {...FULL_ACTIVITY} onPress={() => {}} />
        <Toast
          kind="error"
          message="Couldn't join. The last spot went a moment before you."
          action="WAITLIST"
          onAction={() => {}}
          announce={false}
        />
        <View className="gap-space-2 bg-surface-raised p-space-5">
          <Text variant="title-sm">Join the waitlist</Text>
          <Text variant="body-sm">
            2 people ahead of you. If a spot opens before 7:00 you're in automatically, and we tell you straight
            away.
          </Text>
          <Button variant="primary" block onPress={() => {}}>
            JOIN WAITLIST
          </Button>
        </View>
        <Input label="How many" defaultValue="14" error="Plans hold 2 to 12 people." keyboardType="number-pad" />
      </Column>
    </Situation>
  );
}

const styles = StyleSheet.create({
  frame: { position: 'absolute', top: -1, left: -1, right: -1, bottom: -1, borderWidth: 1 },
});

const meta = {
  title: 'Screens/States',
  component: StatesSheet,
  args: { width: ARTBOARD.width },
  argTypes: { width: { control: { type: 'number' } } },
  parameters: onSituation('calm', { padded: false }),
} satisfies Meta<typeof StatesSheet>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The 1720 × 960 artboard, four 390pt columns: compare one-to-one with screens/States.png. */
export const Artboard: Story = {};

/** At phone width the four panels stack. */
export const Stacked: Story = { args: { width: 390 } };
