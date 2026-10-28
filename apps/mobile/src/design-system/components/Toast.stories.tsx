import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { EachSituation, onSituation, Section } from '../stories/storyKit';
import { Button } from './Button';
import { ReducedMotionOverride } from './Overlay';
import { Text } from './Text';
import { Toast, ToastProvider, useToast, type ToastKind, type ToastOptions } from './Toast';

/* Sample messages from the States screen. One sentence (or two short ones), counts not adjectives. */
const samples: Record<ToastKind, { message: string; action: string }> = {
  neutral: { message: 'Invite sent to Joel P.', action: 'UNDO' },
  success: { message: "You're in. 7 of 8.", action: 'SEE PLAN' },
  offline: { message: 'Offline. Showing the last count from 7:02.', action: 'RETRY' },
  error: { message: "Couldn't join. The last spot went a moment before you.", action: 'WAITLIST' },
};
const kinds = Object.keys(samples) as ToastKind[];

const meta = {
  title: 'Primitives/Toast',
  component: Toast,
  args: { message: samples.success.message, kind: 'success', announce: false },
  argTypes: {
    kind: { control: { type: 'select' }, options: kinds },
    action: { control: { type: 'text' } },
  },
} satisfies Meta<typeof Toast>;

export default meta;

type Story = StoryObj<typeof meta>;

/** One toast, driven by the controls. */
export const Playground: Story = {};

function AllKinds() {
  return (
    <View className="gap-space-3">
      {kinds.map((kind) => (
        <View key={kind} className="gap-space-3">
          <Toast kind={kind} message={samples[kind].message} announce={false} />
          <Toast
            kind={kind}
            message={samples[kind].message}
            action={samples[kind].action}
            announce={false}
          />
        </View>
      ))}
    </View>
  );
}

/** Every kind, without and with an action, on calm. Kind is told by icon and words. */
export const KindsCalm: Story = {
  render: () => <AllKinds />,
};

/** On live the inverse strip turns white on black. */
export const KindsLive: Story = {
  parameters: onSituation('live'),
  render: () => <AllKinds />,
};

/** Toasts appear over any situation. */
export const EverySituation: Story = {
  parameters: onSituation('calm', { padded: false }),
  render: () => (
    <EachSituation>
      <Toast kind="error" message={samples.error.message} action="WAITLIST" announce={false} />
    </EachSituation>
  ),
};

function Triggers() {
  const toast = useToast();
  const fire = (kind: ToastKind, withAction: boolean) => {
    const options: ToastOptions = { kind, message: samples[kind].message };
    if (withAction) options.action = samples[kind].action;
    toast.show(options);
  };
  return (
    <View className="gap-space-3">
      <Text variant="body-sm" muted>
        One toast at a time: a new one replaces the one on screen. 4s, or 8s with an action (doubled
        with a screen reader on).
      </Text>
      {kinds.map((kind) => (
        <View key={kind} className="flex-row flex-wrap gap-space-2">
          <Button variant="secondary" onPress={() => fire(kind, false)}>
            {kind.toUpperCase()}
          </Button>
          <Button variant="ghost" onPress={() => fire(kind, true)}>
            WITH ACTION
          </Button>
        </View>
      ))}
      <Button variant="ghost" onPress={() => toast.dismiss()}>
        DISMISS
      </Button>
    </View>
  );
}

function ProviderDemo() {
  return (
    <ToastProvider>
      <View className="min-h-[640px]">
        <Section title="useToast">
          <Triggers />
        </Section>
      </View>
    </ToastProvider>
  );
}

/** The provider and `useToast()`, on calm. */
export const ProviderCalm: Story = {
  render: () => <ProviderDemo />,
};

/** The provider on live: the toast takes the caller's situation, so it's white on black. */
export const ProviderLive: Story = {
  parameters: onSituation('live'),
  render: () => <ProviderDemo />,
};

/** Reduced motion forced on: toasts cross-fade in 120ms, no slide. */
export const ReducedMotion: Story = {
  render: () => (
    <ReducedMotionOverride value>
      <ToastProvider>
        <View className="min-h-[640px]">
          <Triggers />
        </View>
      </ToastProvider>
    </ReducedMotionOverride>
  ),
};
