import { textStyles, type TextStyleName } from '@ojoro/design-tokens';
import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { Text } from '../components/Text';
import { useSituation } from '../Situation';
import { onSituation, Section, situationNames } from './storyKit';

/**
 * Samples from design-handoff/design-system/tokens.json. title-sm, label-sm and
 * overline come from the porting guide and have no sample there.
 */
const samples: Record<TextStyleName, string> = {
  'display-hero': 'GAME ON',
  'display-xl': 'TONIGHT.',
  'display-lg': '7 / 8',
  'display-md': 'NEED ONE MORE',
  'display-sm': 'WHO TAKES IT?',
  'display-xs': '78 BACK CHIMDI',
  title: 'Pickup football at Jeanne-Mance',
  'title-sm': 'Sunday run club',
  body: '11 people near you want to play.',
  'body-sm': 'Jeanne-Mance Park · 7:30 PM',
  label: "I'M DOWN",
  'label-sm': 'PLAN FORMING',
  caption: '2 min ago',
  numeric: '48% · 5.2 km · 24:10',
  overline: 'Tonight',
};

const names = Object.keys(textStyles) as TextStyleName[];

function spec(name: TextStyleName): string {
  const s = textStyles[name];
  const face = s.family === 'display' ? 'Anton' : `Inter ${s.fontWeight}`;
  const extras = [s.uppercase && 'uppercase', s.tabular && 'tabular', s.muted && 'muted']
    .filter(Boolean)
    .join(', ');
  return `${face} · ${s.fontSize}/${Math.round(s.lineHeight * 10) / 10} · ${s.letterSpacing}${extras ? ` · ${extras}` : ''}`;
}

/** Every token text style with its sample, on the current situation. */
function TypeScale() {
  const id = useSituation();
  return (
    <Section title={`Text styles · ${situationNames[id]}`}>
      {names.map((name) => (
        <View key={name} className="gap-space-1 border-b border-line pb-space-4">
          <Text variant="caption" muted>
            {name} · {spec(name)}
          </Text>
          <Text variant={name}>{samples[name]}</Text>
        </View>
      ))}
    </Section>
  );
}

const meta = {
  title: 'Foundations/Type',
  component: TypeScale,
} satisfies Meta<typeof TypeScale>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Calm: Story = { parameters: onSituation('calm') };
export const Forming: Story = { parameters: onSituation('forming') };
export const Confirmed: Story = { parameters: onSituation('confirmed') };
export const Live: Story = { parameters: onSituation('live') };
export const After: Story = { parameters: onSituation('after') };
