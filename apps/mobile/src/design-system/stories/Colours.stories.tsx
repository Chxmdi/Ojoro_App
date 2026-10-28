import { brand, situations, type ColorToken } from '@ojoro/design-tokens';
import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { Text } from '../components/Text';
import { useSituation } from '../Situation';
import { useThemeColor } from '../useThemeColor';
import { onSituation, Section, situationNames } from './storyKit';

const tokens = Object.keys(situations.calm) as ColorToken[];

/** A swatch: the colour, its name and its value. The hairline keeps white-on-white visible. */
function Swatch({ name, value }: { name: string; value: string }) {
  const line = useThemeColor('line-strong');
  return (
    <View className="flex-row items-center gap-space-4">
      <View style={{ width: 48, height: 48, backgroundColor: value, borderWidth: 1, borderColor: line }} />
      <View className="flex-1">
        <Text variant="title-sm">{name}</Text>
        <Text variant="numeric" muted>
          {value}
        </Text>
      </View>
    </View>
  );
}

/** Every semantic token as it resolves on the current situation. */
function SemanticColours() {
  const id = useSituation();
  return (
    <Section title={`Semantic colours · ${situationNames[id]}`}>
      {tokens.map((token) => (
        <Swatch key={token} name={token} value={situations[id][token]} />
      ))}
    </Section>
  );
}

const meta = {
  title: 'Foundations/Colours',
  component: SemanticColours,
} satisfies Meta<typeof SemanticColours>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Calm: Story = { parameters: onSituation('calm') };
export const Forming: Story = { parameters: onSituation('forming') };
export const Confirmed: Story = { parameters: onSituation('confirmed') };
export const Live: Story = { parameters: onSituation('live') };
export const After: Story = { parameters: onSituation('after') };

/** The six brand colours. For brand art only; components use the semantic tokens. */
export const Brand: Story = {
  parameters: onSituation('calm'),
  render: () => (
    <Section title="Brand · six colours only">
      {Object.entries(brand).map(([name, value]) => (
        <Swatch key={name} name={name} value={value} />
      ))}
    </Section>
  ),
};
