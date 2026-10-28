import { situationIds } from '@ojoro/design-tokens';
import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { EachSituation, onSituation, Section } from '../stories/storyKit';
import { Text } from './Text';
import { Icon, ICONS, type IconName } from './Icon';

const names = Object.keys(ICONS) as IconName[];

/** Every icon with its name, at one size. */
function IconGrid({ size = 24 }: { size?: number }) {
  return (
    <View className="flex-row flex-wrap">
      {names.map((name) => (
        <View key={name} className="items-center gap-space-2 py-space-3" style={{ width: '25%' }}>
          <Icon name={name} size={size} />
          <Text variant="caption" muted>
            {name}
          </Text>
        </View>
      ))}
    </View>
  );
}

const meta = {
  title: 'Foundations/Icon',
  component: Icon,
  args: { name: 'check', size: 24, strokeWidth: 2 },
  argTypes: {
    name: { control: { type: 'select' }, options: names },
    size: { control: { type: 'select' }, options: [16, 20, 24, 32, 48] },
    strokeWidth: { control: { type: 'number' } },
    color: { control: { type: 'color' } },
    label: { control: { type: 'text' } },
  },
} satisfies Meta<typeof Icon>;

export default meta;

type Story = StoryObj<typeof meta>;

/** One icon, driven by the controls. */
export const Playground: Story = {};

/** All icons at 24, on the current situation (use the control to switch). */
export const All: Story = {
  render: () => (
    <Section title={`${names.length} icons · 24`}>
      <IconGrid />
    </Section>
  ),
};

/** 24 in buttons and headers; 16 and 20 inside text lines. */
export const Sizes: Story = {
  render: () => (
    <View>
      {[16, 20, 24].map((size) => (
        <Section key={size} title={`${size}pt`}>
          <IconGrid size={size} />
        </Section>
      ))}
    </View>
  ),
};

/** The grid on every ground: the stroke follows the situation's text colour. */
export const OnEachSituation: Story = {
  parameters: { ojoro: { padded: false } },
  render: () => <EachSituation only={situationIds}>{() => <IconGrid />}</EachSituation>,
};

/** In a text line: the icon sits at 20 next to body text. */
export const InTextLine: Story = {
  parameters: onSituation('forming'),
  render: () => (
    <View className="gap-space-3">
      <View className="flex-row items-center gap-space-2">
        <Icon name="pin" size={20} />
        <Text variant="body">Jeanne-Mance Park</Text>
      </View>
      <View className="flex-row items-center gap-space-2">
        <Icon name="clock" size={16} />
        <Text variant="body-sm">7:30 PM</Text>
      </View>
      <View className="flex-row items-center gap-space-2">
        <Icon name="alert" size={20} label="Error" />
        <Text variant="body">Couldn&apos;t save. Try again.</Text>
      </View>
    </View>
  ),
};
