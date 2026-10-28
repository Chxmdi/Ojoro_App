import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { EachSituation, Section } from '../stories/storyKit';
import { Avatar, type AvatarSize } from './Avatar';
import { Text } from './Text';

const sizes: AvatarSize[] = ['sm', 'md', 'lg'];

/** A stand-in photo (a blurred head-and-shoulders in brand stone and graphite), inline so the story works offline. */
const PHOTO =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCABgAGADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDUooorAsKKKKACikzimNMi9WFAElFRrMjdGFPBzQAtFFFABRRRQAUUUUAFITgZNLVW+l8uEmmgKl/qAjyqnmsaS8lc53Go55DJISTUVaqNiGywl3KpzuNa9hqO8hXNYFPico4INNxTBM7NSGGRS1S06bzIRmrtYssKKKKQBRRRQAVm6vnyTWlVS/i8yE01uJnKHqaSpJkKSEGo63ICgdaKdGpdwBQBv6Nny61qo6bD5cIzV6sJbloKKKKQwooooAKRhkYNLUM1wkQ5NAGbqGn78sgrGkt5EOCK2bjVVGQOaz5b4OelaxuS7FVLd3OAK1tP04ghnFUo70Ic4rQg1VeAeKJXErGuqhVwKdUEN1HKODU1ZFi0UUUAFJS1WvJxDETmgCG+vVhUgHmsC4u3lY8nFNup2lkJJqCtoxsQ2BJNFFFUIKM0UUATwXLxMCDW9Y34lADHmuaqW3mMTgg1LjcaZ2IORS1TsLgTRDnmrlZMsSsLWJznaDW45wprl9TYmc1UFqJlKiiitSAooooAKKKKACiiigDV0icrIFzXQg5Ga5OwbbOK6qI5jBrKa1KR/9k=';

const meta = {
  title: 'Primitives/Avatar',
  component: Avatar,
  args: { name: 'Maya K', size: 'md', empty: false },
  argTypes: {
    size: { control: { type: 'select' }, options: sizes },
    name: { control: { type: 'text' } },
    src: { control: { type: 'text' } },
    empty: { control: { type: 'boolean' } },
    isNew: { control: { type: 'boolean' } },
  },
} satisfies Meta<typeof Avatar>;

export default meta;

type Story = StoryObj<typeof meta>;

/** One avatar, driven by the controls. */
export const Playground: Story = {};

function Row({ size }: { size: AvatarSize }) {
  return (
    <View className="flex-row items-center gap-space-3">
      <Avatar size={size} name="Maya K" />
      <Avatar size={size} name="Theo L" src={PHOTO} />
      <Avatar size={size} empty />
    </View>
  );
}

/** sm 28 · md 40 · lg 72: initials, photo, open spot. */
export const Sizes: Story = {
  render: () => (
    <View>
      {sizes.map((size) => (
        <Section key={size} title={size}>
          <Row size={size} />
        </Section>
      ))}
    </View>
  ),
};

/** Initials: first letter of the first two words; no name reads "?". */
export const Initials: Story = {
  render: () => (
    <View className="flex-row items-center gap-space-3">
      <Avatar name="Chimdi O" />
      <Avatar name="lena r" />
      <Avatar name="Theo" />
      <Avatar name="Ade Bola Bello" />
      <Avatar />
    </View>
  ),
};

/** Open spots in a plan: the dashed O. Each reads "Open spot". */
export const Empty: Story = {
  render: () => (
    <View className="flex-row items-center gap-space-3">
      {sizes.map((size) => (
        <Avatar key={size} size={size} empty />
      ))}
    </View>
  ),
};

/** Overlapping, as in a cluster: the 2px ground-coloured ring separates the discs. */
export const Overlap: Story = {
  render: () => (
    <View className="flex-row">
      {['Lena R', 'Ade B', 'Sam K', 'Maya K'].map((name, i) => (
        <View key={name} style={{ marginLeft: i === 0 ? 0 : -6 }}>
          <Avatar name={name} size="sm" />
        </View>
      ))}
      <View style={{ marginLeft: -6 }}>
        <Avatar size="sm" empty />
      </View>
    </View>
  ),
};

function GatherDemo() {
  const [joined, setJoined] = useState<string[]>(['Lena R', 'Ade B']);
  const next = ['Sam K', 'Maya K', 'Theo L', 'Chimdi O'][joined.length - 2];
  return (
    <View className="gap-space-4">
      <View className="flex-row">
        {joined.map((name, i) => (
          <View key={name} style={{ marginLeft: i === 0 ? 0 : -6 }}>
            <Avatar name={name} size="md" isNew={i >= 2} />
          </View>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={!next}
        onPress={() => next && setJoined((j) => [...j, next])}
        className="min-h-touch justify-center self-start"
      >
        <Text variant="label">{next ? `ADD ${next.toUpperCase()}` : 'FULL'}</Text>
      </Pressable>
    </View>
  );
}

/** `isNew`: a person who just said I'M DOWN flies into the cluster (Gather). Reduced motion cross-fades. */
export const Gather: Story = {
  render: () => <GatherDemo />,
};

/** Every state on every ground: initials on `tint`, the dashed slot on `line-strong`. */
export const OnEachSituation: Story = {
  parameters: { ojoro: { padded: false } },
  render: () => <EachSituation>{() => <Row size="md" />}</EachSituation>,
};
