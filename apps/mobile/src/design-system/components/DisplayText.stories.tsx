import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { Situation } from '../Situation';
import { EachSituation, onSituation, Section } from '../stories/storyKit';
import { DisplayText, usePosterWidth, type DisplaySize } from './DisplayText';
import { Text } from './Text';

const sizes: DisplaySize[] = ['hero', 'xl', 'lg', 'md', 'sm', 'xs'];

const meta = {
  title: 'Primitives/DisplayText',
  component: DisplayText,
  args: { size: 'lg', muted: false, children: 'TONIGHT.' },
  argTypes: {
    size: { control: { type: 'select' }, options: sizes },
    muted: { control: { type: 'boolean' } },
    posterWidth: { control: { type: 'number' } },
  },
} satisfies Meta<typeof DisplayText>;

export default meta;

type Story = StoryObj<typeof meta>;

/** One headline, driven by the controls. */
export const Playground: Story = {};

/** Every size, largest first. `xs` (24px) is the floor. */
export const Sizes: Story = {
  render: () => (
    <View>
      {sizes.map((size) => (
        <Section key={size} title={`display-${size}`}>
          <DisplayText size={size}>{size === 'hero' ? 'GAME ON' : 'TONIGHT.'}</DisplayText>
        </Section>
      ))}
    </View>
  ),
};

/** `muted` takes `text-muted`. */
export const Muted: Story = {
  render: () => (
    <View className="gap-space-2">
      <DisplayText size="md">7 / 8</DisplayText>
      <DisplayText size="md" muted>
        NEED ONE MORE
      </DisplayText>
    </View>
  ),
};

/** The editorial block: a display headline with a body line underneath, on every ground. */
export const EditorialBlock: Story = {
  parameters: { ojoro: { padded: false } },
  render: () => (
    <EachSituation>
      <View className="gap-space-2">
        <DisplayText size="xl">TONIGHT.</DisplayText>
        <Text variant="body" muted>
          3 plans forming near Mile End.
        </Text>
      </View>
    </EachSituation>
  ),
};

/** Words wrap; they never truncate. */
export const Wraps: Story = {
  render: () => <DisplayText size="lg">PICKUP BASKETBALL AT JEANNE-MANCE</DisplayText>,
};

function Poster({ width }: { width: number }) {
  const [inner, onLayout] = usePosterWidth();
  return (
    <Situation id="confirmed" className="p-space-6" style={{ width }}>
      <View onLayout={onLayout} className="gap-space-2">
        <DisplayText size="hero" posterWidth={inner}>
          GAME ON
        </DisplayText>
        <Text variant="caption" muted>
          {`Poster ${width}pt · hero ${inner ? Math.round(Math.min(120, Math.max(64, inner * 0.29))) : 120}px`}
        </Text>
      </View>
    </Situation>
  );
}

/** Poster hero: clamp(64, 29% of the poster's content width, 120), measured with onLayout. */
export const PosterHero: Story = {
  parameters: onSituation('calm'),
  render: () => (
    <View className="gap-space-4">
      <Poster width={350} />
      <Poster width={260} />
      <Poster width={200} />
    </View>
  ),
};
