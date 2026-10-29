import type { Meta, StoryObj } from '@storybook/react-native';
import { useEffect, useState } from 'react';

import { onSituation } from '../stories/storyKit';
import { LiveChallenge } from './LiveChallenge';
import { ReducedMotionOverride } from './Overlay';

const meta = {
  title: 'Competition/LiveChallenge',
  component: LiveChallenge,
  parameters: onSituation('live', { padded: false }),
  args: {
    a: { name: 'Chimdi', value: 3.4, checkedIn: true },
    b: { name: 'Marcus', value: 3.1, checkedIn: true },
    discipline: '5K',
    unit: 'KM',
    target: 5,
    elapsed: '16:42',
    watching: 212,
  },
} satisfies Meta<typeof LiveChallenge>;

export default meta;

type Story = StoryObj<typeof meta>;

/** EventLive: two lanes, both checked in, Chimdi ahead by numbers. */
export const Racing: Story = {};

/** Only one has checked in: no badge on the other lane. */
export const OneCheckedIn: Story = {
  args: { b: { name: 'Marcus', value: 0, checkedIn: false }, elapsed: '0:12', watching: 40 },
};

/** At the start: empty lanes, nobody watching yet (no watching line). */
export const Start: Story = {
  args: {
    a: { name: 'Chimdi', value: 0, checkedIn: true },
    b: { name: 'Marcus', value: 0, checkedIn: true },
    elapsed: '0:00',
    watching: 0,
  },
};

/** One has finished: the lane fills and stops at the target. */
export const Finished: Story = {
  args: { a: { name: 'Chimdi', value: 5, checkedIn: true }, elapsed: '22:48' },
};

/** Inside a calm page it stays live (black). */
export const InsideCalm: Story = { parameters: onSituation('calm') };

function Moving({ reduced }: { reduced: boolean | null }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((n) => n + 1), 2000);
    return () => clearInterval(id);
  }, []);
  const a = Math.min(5, 1 + t * 0.21);
  const b = Math.min(5, 1 + t * 0.19);
  return (
    <ReducedMotionOverride value={reduced}>
      <LiveChallenge
        a={{ name: 'Chimdi', value: Math.round(a * 10) / 10, checkedIn: true }}
        b={{ name: 'Marcus', value: Math.round(b * 10) / 10, checkedIn: true }}
        discipline="5K"
        unit="KM"
        target={5}
        elapsed={`${4 + t}:00`}
        watching={212 + t}
      />
    </ReducedMotionOverride>
  );
}

/** Values update every 2s: fills ease on dur-live; screen readers hear it at most every 30s. */
export const Updating: Story = { render: () => <Moving reduced={null} /> };

/** Reduced motion: the fills jump; numbers still change. */
export const UpdatingReducedMotion: Story = { render: () => <Moving reduced /> };
