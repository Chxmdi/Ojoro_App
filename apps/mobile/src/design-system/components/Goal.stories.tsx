import type { Meta, StoryObj } from '@storybook/react-native';

import { onSituation } from '../stories/storyKit';
import { Goal } from './Goal';

/* Sample content from You. Seed data, not product copy. */
const meta = {
  title: 'Progress/Goal',
  component: Goal,
  parameters: onSituation('calm'),
  args: {
    title: 'Sub-22 5K by December',
    body: 'Best so far: 23:05. The Call-Out on Saturday is your next real test.',
    nextStep: { title: 'Tempo run · Thu 6:30 · Plateau Run Club', onPress: () => {} },
  },
} satisfies Meta<typeof Goal>;

export default meta;

type Story = StoryObj<typeof meta>;

/** You: the goal, progress in words, the next real step with I'M DOWN. */
export const Default: Story = {};

/** Your own goal: CHANGE under it. */
export const Own: Story = { args: { onEdit: () => {} } };

/** No next step found yet. */
export const NoNextStep: Story = { args: { nextStep: null } };

/** Empty, your own: SET A GOAL. */
export const EmptyOwn: Story = {
  args: { title: null, body: undefined, nextStep: null, onEdit: () => {} },
};

/** Empty on someone else's Passport: the line only. */
export const EmptyOther: Story = {
  args: { title: null, body: undefined, nextStep: null, emptyText: 'No goal shared.' },
};

/** In the after situation (Passport). */
export const After: Story = { parameters: onSituation('after') };
