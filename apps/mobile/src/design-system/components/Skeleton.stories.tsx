import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { EachSituation, Section } from '../stories/storyKit';
import { Button } from './Button';
import { loadingProps, Skeleton, SKELETON_KINDS } from './Skeleton';
import { Text } from './Text';

const meta = {
  title: 'Primitives/Skeleton',
  component: Skeleton,
  args: { kind: 'strip', lines: 3, delay: 300 },
  argTypes: {
    kind: { control: { type: 'select' }, options: [...SKELETON_KINDS] },
    lines: { control: { type: 'number' } },
    delay: { control: { type: 'number' } },
  },
} satisfies Meta<typeof Skeleton>;

export default meta;

type Story = StoryObj<typeof meta>;

/** One skeleton, driven by the controls. Appears 300ms after the story opens. */
export const Default: Story = {};

/** Strip: time block, two lines, badge. */
export const StripKind: Story = { name: 'Strip', args: { kind: 'strip' } };

/** Object: overline, display, progress, commit (on surface-raised). */
export const ObjectKind: Story = { name: 'Object', args: { kind: 'object' } };

/** Text: `lines` lines, the last at 60%. */
export const TextKind: Story = { name: 'Text', args: { kind: 'text', lines: 3 } };

/** The States screen's loading column: text (2), object, strip, strip; the container carries the label. */
export const LoadingScreen: Story = {
  render: () => (
    <View {...loadingProps('Loading today')} className="gap-space-6">
      <Text variant="display-xs">OJORO</Text>
      <Skeleton kind="text" lines={2} />
      <Skeleton kind="object" />
      <Skeleton kind="strip" />
      <Skeleton kind="strip" />
    </View>
  ),
};

/** Before the delay: nothing renders. This one waits 1 hour; the frame below it stays empty. */
export const BeforeDelay: Story = {
  render: () => (
    <Section title="Each kind, before 300ms">
      {SKELETON_KINDS.map((kind) => (
        <View key={kind} className="min-h-touch border border-line">
          <Skeleton kind={kind} delay={3_600_000} />
        </View>
      ))}
      <Text variant="body-sm" muted>
        Empty frames: a load faster than the delay never flashes a placeholder.
      </Text>
    </Section>
  ),
};

/** After the delay: each kind once 300ms have passed (delay 0 here, so it's there at once). */
export const AfterDelay: Story = {
  render: () => (
    <View>
      {SKELETON_KINDS.map((kind) => (
        <Section key={kind} title={kind}>
          <Skeleton kind={kind} delay={0} lines={2} />
        </Section>
      ))}
    </View>
  ),
};

/** Replay the delay: start a load and watch the skeleton arrive at 300ms, then the content at 1.5s. */
function ReplayDemo() {
  const [run, setRun] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const start = () => {
    setDone(false);
    setStartedAt(Date.now());
    setRun((n) => n + 1);
    setTimeout(() => setDone(true), 1500);
  };
  const loading = startedAt != null && !done;
  return (
    <View className="gap-space-4">
      <Button variant="secondary" onPress={start}>
        LOAD
      </Button>
      <View
        {...(loading ? loadingProps('Loading plans') : null)}
        className="min-h-[120px] gap-space-3"
      >
        {loading ? (
          <>
            <Skeleton key={`a${run}`} kind="strip" startedAt={startedAt} />
            <Skeleton key={`b${run}`} kind="strip" startedAt={startedAt} />
          </>
        ) : done ? (
          <Text variant="body">2 plans near you.</Text>
        ) : null}
      </View>
    </View>
  );
}

export const Replay: Story = { render: () => <ReplayDemo /> };

/** On every ground: bars are `track`; the object card is `surface-raised`. */
export const OnEachSituation: Story = {
  parameters: { ojoro: { padded: false } },
  render: () => (
    <EachSituation>
      <View className="gap-space-4">
        <Skeleton kind="object" delay={0} />
        <Skeleton kind="strip" delay={0} />
        <Skeleton kind="text" lines={2} delay={0} />
      </View>
    </EachSituation>
  ),
};
