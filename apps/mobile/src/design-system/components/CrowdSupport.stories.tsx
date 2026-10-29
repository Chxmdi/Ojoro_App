import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';

import { EachSituation, onSituation } from '../stories/storyKit';
import { CrowdSupport, type CrowdKey } from './CrowdSupport';

const meta = {
  title: 'Competition/CrowdSupport',
  component: CrowdSupport,
  parameters: onSituation('forming'),
  args: {
    a: { name: 'Chimdi', count: 78 },
    b: { name: 'Marcus', count: 64 },
  },
  argTypes: {
    backing: { control: { type: 'select' }, options: [undefined, 'a', 'b'] },
  },
} satisfies Meta<typeof CrowdSupport>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Not backing: two secondary BACK buttons. */
export const NotBacking: Story = {};

/** EventBuildup: backing Chimdi, so that button is primary and reads BACKING. */
export const BackingA: Story = { args: { backing: 'a' } };

/** Backing Marcus. */
export const BackingB: Story = { args: { backing: 'b' } };

/** Nobody backs anyone yet: 0 each. */
export const Empty: Story = {
  args: { a: { name: 'Chimdi', count: 0 }, b: { name: 'Marcus', count: 0 } },
};

/** Offline: counts stay, buttons don't press. */
export const Disabled: Story = { args: { backing: 'a', disabled: true } };

function Interactive() {
  const [backing, setBacking] = useState<CrowdKey | undefined>();
  return (
    <CrowdSupport
      a={{ name: 'Chimdi', count: 78 + (backing === 'a' ? 1 : 0) }}
      b={{ name: 'Marcus', count: 64 + (backing === 'b' ? 1 : 0) }}
      backing={backing}
      onBack={(side) => setBacking((now) => (now === side ? undefined : side))}
    />
  );
}

/** Tap to back; tap BACKING again to stop. No haptic. */
export const Toggle: Story = { render: () => <Interactive /> };

/** On each ground (forming build-up, confirmed day, live). */
export const OnEachSituation: Story = {
  parameters: { ojoro: { padded: false } },
  args: { backing: 'a' },
  render: (args) => (
    <EachSituation only={['forming', 'confirmed', 'live']}>
      <CrowdSupport {...args} />
    </EachSituation>
  ),
};
