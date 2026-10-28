import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { EachSituation, onSituation, Section } from '../stories/storyKit';
import { Button, type ButtonVariant } from './Button';
import { Text } from './Text';

const variants: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'inverse', 'commit'];

const meta = {
  title: 'Primitives/Button',
  component: Button,
  args: {
    variant: 'primary',
    committed: false,
    block: false,
    disabled: false,
    loading: false,
    children: 'PULL SOMEONE IN',
  },
  argTypes: {
    variant: { control: { type: 'select' }, options: variants },
    committed: { control: { type: 'boolean' } },
    block: { control: { type: 'boolean' } },
    disabled: { control: { type: 'boolean' } },
    loading: { control: { type: 'boolean' } },
    children: { control: { type: 'text' } },
  },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

/** One button, driven by the controls. */
export const Playground: Story = {};

/** The commit button you can press: I'M DOWN locks to YOU'RE DOWN (press again to step out). */
function CommitToggle({ block }: { block?: boolean }) {
  const [down, setDown] = useState(false);
  return (
    <Button
      variant="commit"
      block={block ?? false}
      committed={down}
      onPress={() => setDown((d) => !d)}
    />
  );
}

export const Commit: Story = {
  parameters: onSituation('forming'),
  render: () => (
    <View>
      <Section title="Press it">
        <CommitToggle />
      </Section>
      <Section title="Block">
        <CommitToggle block />
      </Section>
      <Section title="Static states">
        <View className="gap-space-4">
          <Button variant="commit" />
          <Button variant="commit" committed />
          <Button variant="commit" disabled />
          <Button variant="commit" loading />
        </View>
      </Section>
    </View>
  ),
};

/** Same items, order and spacing as the web reference harness, for side-by-side checks. */
export const Reference: Story = {
  render: () => (
    <View className="gap-space-4">
      <Button variant="primary">PULL SOMEONE IN</Button>
      <Button variant="secondary">SKIP</Button>
      <Button variant="ghost">See all</Button>
      <Button variant="inverse">RUN IT BACK</Button>
      <Button variant="commit" />
      <Button variant="commit" committed />
      <Button variant="primary" block>
        GAME ON
      </Button>
      <Button variant="primary" disabled>
        PULL SOMEONE IN
      </Button>
    </View>
  ),
};

/** Every variant on every ground. */
export const Variants: Story = {
  parameters: { ojoro: { padded: false } },
  render: () => (
    <EachSituation>
      <View className="gap-space-3">
        <Button variant="primary">PULL SOMEONE IN</Button>
        <Button variant="secondary">SKIP</Button>
        <Button variant="ghost">See all</Button>
        <Button variant="inverse">RUN IT BACK</Button>
        <Button variant="commit" />
        <Button variant="commit" committed />
      </View>
    </EachSituation>
  ),
};

/** Disabled: opacity-disabled, with the reason written next to it. Loading keeps the label and adds a spinner. */
export const DisabledAndLoading: Story = {
  render: () => (
    <View>
      <Section title="Disabled, reason nearby">
        <View className="gap-space-2">
          <Button variant="primary" block disabled>
            GAME ON
          </Button>
          <Text variant="body-sm" muted>
            Needs 2 more people before it can lock.
          </Text>
        </View>
      </Section>
      <Section title="Disabled, each variant">
        <View className="gap-space-3">
          {variants.map((v) => (
            <Button key={v} variant={v} disabled>
              {v === 'commit' ? undefined : 'PULL SOMEONE IN'}
            </Button>
          ))}
        </View>
      </Section>
      <Section title="Loading">
        <View className="gap-space-3">
          <Button variant="primary" loading>
            SENDING
          </Button>
          <Button variant="secondary" loading>
            SAVING
          </Button>
          <Button variant="inverse" loading block>
            RUN IT BACK
          </Button>
        </View>
      </Section>
    </View>
  ),
};

/** Block buttons fill the row; long labels wrap inside the pill instead of truncating. */
export const BlockAndLongLabels: Story = {
  render: () => (
    <View>
      <Section title="Block">
        <View className="gap-space-3">
          <Button block>GAME ON</Button>
          <Button variant="secondary" block>
            PULL SOMEONE IN
          </Button>
          <Button variant="commit" block />
        </View>
      </Section>
      <Section title="Long label, block">
        <View className="gap-space-3">
          <Button block>REQUEST A SPOT AT JEANNE-MANCE PARK FOR THURSDAY</Button>
          <Button variant="secondary" block>
            SHARE THE PLAN WITH THE WHOLE CREW AND THE CLAN
          </Button>
        </View>
      </Section>
      <Section title="Long label, narrow column">
        <View style={{ width: 180 }}>
          <Button variant="inverse">PULL SOMEONE IN FROM YOUR CREW</Button>
        </View>
      </Section>
    </View>
  ),
};

/** Side by side: one primary, the lesser action secondary. */
export const InARow: Story = {
  parameters: onSituation('forming'),
  render: () => (
    <ScrollView horizontal contentContainerClassName="gap-space-3">
      <Button variant="secondary">SKIP</Button>
      <Button variant="primary">PULL SOMEONE IN</Button>
    </ScrollView>
  ),
};

/** `href` navigates with Expo Router (renders as a link). */
export const AsLink: Story = {
  render: () => (
    <View className="gap-space-3">
      <Button href="/" block>
        GO HOME
      </Button>
      <Button href="/" variant="ghost">
        See all
      </Button>
    </View>
  ),
};

/** Keyboard focus: tab to a button (web) or use a hardware keyboard to see the 2px focus ring. */
export const Focus: Story = {
  parameters: onSituation('live'),
  render: () => (
    <View className="gap-space-4">
      <Button variant="primary">PULL SOMEONE IN</Button>
      <Button variant="secondary">SKIP</Button>
      <Button variant="commit" />
    </View>
  ),
};
