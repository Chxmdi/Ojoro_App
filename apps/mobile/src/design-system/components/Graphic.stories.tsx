import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { EachSituation, onSituation, Section } from '../stories/storyKit';
import { useThemeColor } from '../useThemeColor';
import { Check, Graphic, GRAPHIC_KINDS, type GraphicKind } from './Graphic';
import { DisplayText } from './DisplayText';
import { Text } from './Text';

const meta = {
  title: 'Foundations/Graphic',
  component: Graphic,
  args: { kind: 'o', size: 48, strokeWidth: 3 },
  argTypes: {
    kind: { control: { type: 'select' }, options: [...GRAPHIC_KINDS] },
    size: { control: { type: 'select' }, options: [24, 40, 48, 64, 96] },
    strokeWidth: { control: { type: 'number' } },
    label: { control: { type: 'text' } },
    color: { control: { type: 'color' } },
  },
} satisfies Meta<typeof Graphic>;

export default meta;

type Story = StoryObj<typeof meta>;

/** One graphic, driven by the controls. */
export const Playground: Story = {};

function KindGrid({ size = 48 }: { size?: number }) {
  return (
    <View className="flex-row flex-wrap">
      {GRAPHIC_KINDS.map((kind: GraphicKind) => (
        <View key={kind} className="items-center gap-space-2 py-space-3" style={{ width: '25%' }}>
          <Graphic kind={kind} size={size} />
          <Text variant="caption" muted>
            {kind}
          </Text>
        </View>
      ))}
      <View className="items-center gap-space-2 py-space-3" style={{ width: '25%' }}>
        <View style={{ height: size, justifyContent: 'center' }}>
          <Check />
        </View>
        <Text variant="caption" muted>
          check
        </Text>
      </View>
    </View>
  );
}

/** The O, the Trail, the Mark, the scribbles, and the 16px check, at 48. */
export const All: Story = {
  render: () => (
    <Section title={`${GRAPHIC_KINDS.length} graphics · 48`}>
      <KindGrid />
    </Section>
  ),
};

/** 40 inside objects (recap crown, image placeholder), 64 for the rematch Mark, 96 as art. */
export const Sizes: Story = {
  render: () => (
    <View>
      {[40, 64, 96].map((size) => (
        <Section key={size} title={`${size}pt`}>
          <View className="flex-row items-center gap-space-4">
            <Graphic kind="o" size={size} />
            <Graphic kind="mark" size={size} />
            <Graphic kind="crown" size={size} />
          </View>
        </Section>
      ))}
    </View>
  ),
};

function SignalInk() {
  const signal = useThemeColor('signal');
  return (
    <View className="gap-space-3">
      <View className="flex-row items-center gap-space-3">
        <Graphic kind="crown" size={40} color={signal} />
        <DisplayText size="md">CHIMDI WINS.</DisplayText>
      </View>
      <View className="flex-row items-center gap-space-3">
        <DisplayText size="lg">REMATCH?</DisplayText>
        <Graphic kind="mark" size={64} color={signal} label="Versus" />
      </View>
    </View>
  );
}

/** Signal ink (web `oj-signal-ink`): pass the situation's `signal` as `color`. */
export const InObjects: Story = {
  parameters: onSituation('after'),
  render: () => <SignalInk />,
};

/** Every graphic on every ground: strokes follow the situation's text. */
export const OnEachSituation: Story = {
  parameters: { ojoro: { padded: false } },
  render: () => <EachSituation>{() => <KindGrid size={40} />}</EachSituation>,
};
