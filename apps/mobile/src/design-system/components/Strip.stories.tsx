import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { EachSituation, onSituation, Section } from '../stories/storyKit';
import { Badge } from './Badge';
import { Divider } from './Divider';
import { Icon } from './Icon';
import { Strip, StripList, STRIP_TITLE_VARIANTS } from './Strip';
import { Text } from './Text';

const meta = {
  title: 'Primitives/Strip',
  component: Strip,
  args: {
    leading: 'SAT',
    title: 'Chimdi vs Marcus · 5K',
    meta: '142 following · build-up',
    titleVariant: 'title',
  },
  argTypes: {
    titleVariant: { control: { type: 'select' }, options: [...STRIP_TITLE_VARIANTS] },
    leading: { control: { type: 'text' } },
    title: { control: { type: 'text' } },
    meta: { control: { type: 'text' } },
  },
} satisfies Meta<typeof Strip>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Main › Challenges you follow: day · title + meta · badge, a hairline under each row. */
export const Default: Story = {
  render: (args) => (
    <View className="gap-space-2">
      <Divider label="CHALLENGES YOU FOLLOW" />
      <StripList>
        <Strip {...args} trailing={<Badge tone="signal">3 DAYS</Badge>} onPress={() => {}} />
        <Strip
          leading="SUN"
          title="Thursday FC vs Plateau Crew"
          meta="Crew-vs-Crew · football · 5 a side"
          trailing={<Badge>ACCEPTED</Badge>}
          onPress={() => {}}
        />
      </StripList>
    </View>
  ),
};

/** Discover › Near you: times in the leading column, status in the badge (words, never colour alone). */
export const WithBadges: Story = {
  render: () => (
    <StripList>
      <Strip
        leading="NOW"
        title="Sparring rounds"
        meta="Hoshino Boxing · 2.8 km"
        trailing={<Badge tone="signal">LIVE</Badge>}
      />
      <Strip
        leading="6:30"
        title="5K river run"
        meta="Lachine Canal · 4 km"
        trailing={<Badge tone="signal">GAME ON</Badge>}
      />
      <Strip
        leading="7:30"
        title="Pickup football"
        meta="Jeanne-Mance Park · 1.2 km"
        trailing={<Badge>6 / 8</Badge>}
      />
      <Strip
        leading="140"
        title="Mile End Runners"
        meta="Running · 3 runs a week · request to join"
        trailing={<Badge>REQUEST</Badge>}
      />
    </StripList>
  ),
};

/** Chevron rows without a leading column: title-sm (settings), display-xs (HostHome tools), display-sm (Create menu). */
export const WithChevron: Story = {
  render: () => (
    <View>
      <Section title="title-sm">
        <StripList>
          <Strip
            title="Series settings"
            titleVariant="title-sm"
            meta="Approval, waitlist, price and refunds"
            trailing="chevron"
            onPress={() => {}}
          />
          <Strip
            title="See members in People"
            titleVariant="title-sm"
            trailing="chevron"
            onPress={() => {}}
          />
        </StripList>
      </Section>
      <Section title="display-xs">
        <StripList>
          <Strip
            title="SERIES & TEMPLATES"
            titleVariant="display-xs"
            meta="Repeat a session without rebuilding it"
            trailing="chevron"
            onPress={() => {}}
          />
          <Strip
            title="PEOPLE"
            titleVariant="display-xs"
            meta="Regulars, attendance, notes"
            trailing="chevron"
            onPress={() => {}}
          />
        </StripList>
      </Section>
      <Section title="display-sm">
        <StripList>
          <Strip
            title="DOWN FOR"
            titleVariant="display-sm"
            meta="Say what you're up for and when. It expires on its own."
            trailing="chevron"
            onPress={() => {}}
          />
          <Strip
            title="CALL OUT"
            titleVariant="display-sm"
            meta="Challenge someone. If they accept, it becomes an event."
            trailing="chevron"
            onPress={() => {}}
          />
        </StripList>
      </Section>
    </View>
  ),
};

/** Custom trailing slot: an icon (CrewHome › Open the session chat) and a word (HostAnnounce's text button). */
export const CustomTrailing: Story = {
  render: () => (
    <StripList>
      <Strip
        title="Open the session chat"
        titleVariant="title-sm"
        meta="23 new since this morning"
        trailing={<Icon name="chat" />}
        trailingLabel="Chat"
        onPress={() => {}}
      />
      <Strip
        leading={
          <View>
            <Text variant="display-xs">THU</Text>
            <Text variant="caption" muted>
              14.03
            </Text>
          </View>
        }
        leadingLabel="Thursday 14 March"
        title="Mixed 5s · 7:30"
        titleVariant="title-sm"
        meta="8 / 10 · members free"
        trailing={
          <View className="min-h-touch justify-center px-space-2">
            <Text variant="label">SKIP</Text>
          </View>
        }
      />
    </StripList>
  ),
};

/** No leading column, no trailing: You › Sports. */
export const TitleOnly: Story = {
  render: () => (
    <StripList>
      <Strip title="Football" meta="Midfield · intermediate · social and competitive" />
      <Strip title="Running" meta="5K and 10K · advanced · competitive" />
      <Strip title="Boxing" meta="Learning · looking for patient partners" />
    </StripList>
  ),
};

/** Long titles and meta wrap; nothing truncates; the badge keeps its width and the time column stays 72. */
export const LongTitles: Story = {
  render: () => (
    <StripList>
      <Strip
        leading="2–1"
        title="Thursday FC vs Plateau Crew vs Mile End Runners, the rematch nobody asked for"
        meta="Crew-vs-Crew · football · 5 a side · Jeanne-Mance Park, north pitch under the lights"
        trailing={<Badge>ACCEPTED</Badge>}
      />
      <Strip
        title="MEMBERSHIPS & PAYMENTS AND EVERYTHING ELSE"
        titleVariant="display-xs"
        meta="Passes, payouts, refunds"
        trailing="chevron"
      />
    </StripList>
  ),
};

/** Pressable: one 44pt+ target; press shows the surface-raised ground; keyboard focus draws the 2px focus ring. */
function PressableDemo() {
  const [count, setCount] = useState(0);
  return (
    <View className="gap-space-3">
      <StripList>
        <Strip
          leading="SAT"
          title="Chimdi vs Marcus · 5K"
          meta="142 following · build-up"
          trailing="chevron"
          accessibilityHint="Opens the build-up"
          onPress={() => setCount((n) => n + 1)}
        />
      </StripList>
      <Text variant="body-sm" muted style={{ fontVariant: ['tabular-nums'] }}>
        Pressed {count} times
      </Text>
    </View>
  );
}

export const Pressable: Story = { render: () => <PressableDemo /> };

/** Short rows still meet 44pt; with `rule={false}` the hairline goes (for a strip that ends a card). */
export const MinimumHeightAndNoRule: Story = {
  render: () => (
    <StripList>
      <Strip title="Fixtures" titleVariant="title-sm" trailing="chevron" />
      <Strip title="Rules" titleVariant="title-sm" trailing="chevron" rule={false} />
    </StripList>
  ),
};

/** On each situation strips appear in: feed (calm), plan (forming), GAME ON (confirmed), Compete (live), recap (after). */
export const OnEachSituation: Story = {
  parameters: { ojoro: { padded: false } },
  render: () => (
    <EachSituation>
      {(id) => (
        <StripList>
          <Strip
            leading="SAT"
            title="Chimdi vs Marcus · 5K"
            meta="142 following · build-up"
            trailing={<Badge tone="signal">3 DAYS</Badge>}
          />
          <Strip
            leading="86"
            title="Plateau Ballers"
            meta={`Basketball · ${id}`}
            trailing="chevron"
          />
        </StripList>
      )}
    </EachSituation>
  ),
};

/** Compete is black: strips on the live ground. */
export const OnLive: Story = {
  parameters: onSituation('live'),
  render: () => (
    <StripList>
      <Strip
        leading="5–3"
        title="Lena vs Theo · boxing"
        meta="Result verified · 3 rounds"
        trailing={<Badge>RESULT</Badge>}
      />
      <Strip leading="PB" title="5K · 24:10" meta="Lachine Canal · Sunday" trailing="chevron" />
    </StripList>
  ),
};
