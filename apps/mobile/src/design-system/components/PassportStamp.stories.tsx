import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { EachSituation, onSituation, Section } from '../stories/storyKit';
import { Situation } from '../Situation';
import { DisplayText } from './DisplayText';
import { PassportStamp } from './PassportStamp';
import { Text } from './Text';

const meta = {
  title: 'Identity/PassportStamp',
  component: PassportStamp,
  args: {
    title: '21 GAMES',
    place: 'Jeanne-Mance',
    date: '06.10.26',
    kind: 'NEW STAMP',
    tilt: true,
  },
  argTypes: { tilt: { control: { type: 'boolean' } } },
  parameters: onSituation('after'),
} satisfies Meta<typeof PassportStamp>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Recap: NEW STAMP · 21 GAMES · JEANNE-MANCE · 06.10.26, tilted −6°. */
export const Default: Story = {};

/** No kind: OJORO PASSPORT. */
export const DefaultKind: Story = {
  args: { title: 'FIRST 10K', place: 'Lachine Canal', date: '14.09.26', kind: undefined },
};

/** `tilt={false}`: flat. */
export const Flat: Story = {
  args: {
    title: '20 GAMES',
    place: 'Jeanne-Mance',
    date: '01.10.26',
    kind: 'THURSDAY FC',
    tilt: false,
  },
};

/** A long title wraps inside the ring, never truncates. */
export const LongTitle: Story = {
  args: { title: 'FIRST HALF MARATHON', place: 'Mount Royal', date: '20.10.26', kind: undefined },
};

/** Recap: the stamp beside ADDED TO YOUR PASSPORT. */
export const InRecap: Story = {
  render: (args) => (
    <View className="flex-row items-center gap-space-5">
      <PassportStamp {...args} />
      <View className="shrink gap-space-1">
        <Text variant="label">ADDED TO YOUR PASSPORT</Text>
        <Text variant="body-sm" muted>
          21 games at Jeanne-Mance since March.
        </Text>
      </View>
    </View>
  ),
};

/** You: the Passport block (padding 28 × 20, gap 20), set in after inside a calm page, two stamps (one flat). */
export const InPassport: Story = {
  render: () => (
    <Situation id="after" className="gap-space-5 px-space-5 py-[28px]">
      <Text variant="overline">PASSPORT</Text>
      <DisplayText size="md">{'14 STAMPS.\n6 PLACES.\n23 PEOPLE.'}</DisplayText>
      <View className="flex-row justify-center gap-space-2">
        <PassportStamp title="FIRST 10K" place="Lachine Canal" date="14.09.26" />
        <PassportStamp
          title="20 GAMES"
          place="Jeanne-Mance"
          date="01.10.26"
          kind="THURSDAY FC"
          tilt={false}
        />
      </View>
      <Text variant="label">OPEN PASSPORT</Text>
    </Situation>
  ),
  parameters: onSituation('calm', { padded: false }),
};

/** The stamp sets after on its own root: oxblood ink on the calm and after grounds it lives on. */
export const OnEachSituation: Story = {
  render: (args) => (
    <EachSituation only={['calm', 'after']}>
      <Section title="TILTED AND FLAT">
        <View className="flex-row gap-space-4">
          <PassportStamp {...args} />
          <PassportStamp {...args} tilt={false} />
        </View>
      </Section>
    </EachSituation>
  ),
  parameters: onSituation('calm', { padded: false }),
};
