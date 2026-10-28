import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { EachSituation, onSituation } from '../stories/storyKit';
import { Button } from './Button';
import { Modal, type ModalProps } from './Modal';
import { ReducedMotionOverride } from './Overlay';
import { Text } from './Text';

/* Sample copy. Counts, not adjectives. */
const leavePlan = {
  title: 'LEAVE THIS PLAN?',
  body: '7 of 8 are in. Leaving drops it to 6 of 8 and tells the host.',
  confirm: 'LEAVE PLAN',
  cancel: 'STAY IN',
} satisfies Partial<ModalProps>;

const cancelChallenge = {
  title: 'CANCEL THE CHALLENGE?',
  body: 'Marcus accepted 2 days ago. Cancelling ends it for both of you and shows as cancelled on your record.',
  confirm: 'CANCEL CHALLENGE',
  cancel: 'KEEP IT',
} satisfies Partial<ModalProps>;

/** Opens on load; the button reopens it. Cancel takes focus first. */
function OpenModal(props: Pick<ModalProps, 'title' | 'body' | 'confirm' | 'cancel'>) {
  const [open, setOpen] = useState(true);
  const [last, setLast] = useState('Nothing chosen yet.');
  return (
    <View className="gap-space-4">
      <Text variant="body-sm" muted>
        {last}
      </Text>
      <Button variant="secondary" onPress={() => setOpen(true)}>
        OPEN MODAL
      </Button>
      <Modal
        {...props}
        visible={open}
        onCancel={() => {
          setOpen(false);
          setLast(`Chose ${props.cancel ?? 'KEEP IT'}.`);
        }}
        onConfirm={() => {
          setOpen(false);
          setLast(`Chose ${props.confirm ?? 'CONFIRM'}.`);
        }}
      />
    </View>
  );
}

const meta = {
  title: 'Primitives/Modal',
  component: Modal,
  args: leavePlan,
} satisfies Meta<typeof Modal>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Leaving a plan: socially costly. The scrim doesn't dismiss; cancel, back or Escape does. */
export const Default: Story = {
  parameters: onSituation('forming'),
  render: () => <OpenModal {...leavePlan} />,
};

/** Cancelling a Challenge: irreversible. Still no red: the confirm is the primary button, the words carry it. */
export const Destructive: Story = {
  parameters: onSituation('confirmed'),
  render: () => <OpenModal {...cancelChallenge} />,
};

/** Default labels (KEEP IT / CONFIRM). */
export const DefaultLabels: Story = {
  render: () => <OpenModal title="DELETE THIS POST?" body="It has 12 replies. They go too." />,
};

/** Reduced motion forced on: a 120ms fade. */
export const ReducedMotion: Story = {
  render: () => (
    <ReducedMotionOverride value>
      <OpenModal {...leavePlan} />
    </ReducedMotionOverride>
  ),
};

/** The dialog in place, on each situation it can open from. */
export const Anatomy: Story = {
  parameters: onSituation('calm', { padded: false }),
  render: () => (
    <EachSituation>
      <Modal inline {...leavePlan} />
    </EachSituation>
  ),
};

/** The bare dialog next to the web reference. */
export const Inline: Story = {
  render: () => <Modal inline {...leavePlan} />,
};
