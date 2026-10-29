import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { EachSituation, onSituation, Section } from '../stories/storyKit';
import { Countdown } from './Countdown';

/** A fixed "now" so ticking stories render the same every time. Story content only. */
const NOW = Date.UTC(2026, 9, 9, 18, 40, 0);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const meta = {
  title: 'Competition/Countdown',
  component: Countdown,
  parameters: onSituation('forming'),
  args: { label: 'STARTS IN', days: 3, hours: 14, minutes: 20 },
} satisfies Meta<typeof Countdown>;

export default meta;

type Story = StoryObj<typeof meta>;

/** EventBuildup: STARTS IN · 03 DAYS 14 HRS 20 MIN, tabular figures. */
export const Days: Story = {};

/** Under a day: hours and minutes. */
export const Hours: Story = { args: { days: undefined, hours: 5, minutes: 2 } };

/** The last hour: minutes and seconds. Seconds are never spoken. */
export const LastHour: Story = {
  args: { days: undefined, hours: undefined, minutes: 42, seconds: 7 },
};

/** No label: the numerals alone. */
export const NoLabel: Story = { args: { label: undefined } };

/** At zero: 00 00, read as "now". The Challenge Event moves on to TODAY. / ALMOST TIME. */
export const Zero: Story = {
  args: { days: undefined, hours: undefined, minutes: 0, seconds: 0 },
};

/**
 * Ticking from `to`: only the countdown re-renders, once a minute, then once
 * a second in the last hour. The first is frozen at a fixed "now"; the second
 * really ticks (one hour and five seconds out at load).
 */
export const Ticking: Story = {
  render: () => (
    <View>
      <Section title="FROZEN · TO 3D 14H 20M">
        <Countdown label="STARTS IN" to={NOW + 3 * DAY + 14 * HOUR + 20 * MIN} now={NOW} />
      </Section>
      <Section title="LIVE · CROSSES INTO THE LAST HOUR">
        <Countdown label="STARTS IN" to={Date.now() + HOUR + 5_000} />
      </Section>
    </View>
  ),
};

/** On each ground a Challenge Event passes through before it starts. */
export const OnEachSituation: Story = {
  parameters: { ojoro: { padded: false } },
  render: (args) => (
    <EachSituation only={['calm', 'forming', 'confirmed', 'live']}>
      <Countdown {...args} />
    </EachSituation>
  ),
};
