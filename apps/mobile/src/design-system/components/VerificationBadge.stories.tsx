import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { EachSituation, onSituation } from '../stories/storyKit';
import { VERIFICATION_LEVELS, VerificationBadge } from './VerificationBadge';

const meta = {
  title: 'Social/VerificationBadge',
  component: VerificationBadge,
  args: { level: 'checked-in', testID: 'badge' },
  argTypes: { level: { control: { type: 'select' }, options: [...VERIFICATION_LEVELS] } },
} satisfies Meta<typeof VerificationBadge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** CheckIn: CHECKED IN above the headline, on confirmed. */
export const CheckedIn: Story = { parameters: onSituation('confirmed') };

/** Recap: RESULT VERIFIED (filled), on after. */
export const Result: Story = { args: { level: 'result' }, parameters: onSituation('after') };

/** You: ID VERIFIED, outlined. */
export const Identity: Story = { args: { level: 'identity' } };

/** Place: TRUSTED HOST (filled). */
export const Host: Story = { args: { level: 'host' } };

/** Every level on the grounds it appears on. Filled = confirmed by Ojoro; outlined = by the person. */
export const AllLevels: Story = {
  parameters: { ojoro: { padded: false } },
  render: () => (
    <EachSituation only={['calm', 'confirmed', 'after']}>
      <View className="gap-space-3">
        {VERIFICATION_LEVELS.map((level) => (
          <VerificationBadge key={level} level={level} />
        ))}
      </View>
    </EachSituation>
  ),
};
