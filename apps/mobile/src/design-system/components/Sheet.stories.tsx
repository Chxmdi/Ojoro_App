import type { Meta, StoryObj } from '@storybook/react-native';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { EachSituation, onSituation, Section } from '../stories/storyKit';
import { Button } from './Button';
import { Modal } from './Modal';
import { ReducedMotionOverride } from './Overlay';
import { Sheet } from './Sheet';
import { Text } from './Text';

/* Sample content from NeedOneMore and Pulse. Seed data, not product copy. */
const people = [
  { name: 'Joel P', meta: 'Thursday FC · plays midfield · free tonight' },
  { name: 'Tomi A', meta: '6 games with you · 2 km away' },
  { name: 'Ife N', meta: 'Pull Me In is on for football' },
];

function PeopleList({ count = people.length }: { count?: number }) {
  const rows = Array.from({ length: count }, (_, i) => people[i % people.length]!);
  return (
    <View className="gap-space-1">
      <Text variant="body-sm" muted className="mb-space-2">
        Ranked by who&apos;s most likely to say yes. You can send 3 more invites for this plan.
      </Text>
      {rows.map((person, i) => (
        <View key={i} className="min-h-[64px] justify-center border-b border-line">
          <Text variant="title-sm">{person.name}</Text>
          <Text variant="caption" muted>
            {person.meta}
          </Text>
        </View>
      ))}
    </View>
  );
}

function PlaceSummary() {
  return (
    <View className="gap-space-3">
      <Text variant="body-sm" muted>
        Football · turf · floodlit until 11 PM · 1.2 km
      </Text>
      <Text variant="body-sm">12 activities tonight. Football is forming at 6 / 8 for 7:30.</Text>
      <Text variant="caption" muted>
        Areas, not people. Exact spots show only inside plans you&apos;ve joined.
      </Text>
    </View>
  );
}

/** Opens on load; the button reopens it after a dismiss. */
function OpenSheet({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: (close: () => void) => ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const close = () => setOpen(false);
  return (
    <View className="gap-space-4">
      <Text variant="body-sm" muted>
        Dismiss with the close button, a tap on the scrim, a swipe down on the header, Android back
        or Escape.
      </Text>
      <Button variant="secondary" onPress={() => setOpen(true)}>
        OPEN SHEET
      </Button>
      <Sheet visible={open} title={title} onClose={close} actions={actions?.(close)}>
        {children}
      </Sheet>
    </View>
  );
}

const meta = {
  title: 'Primitives/Sheet',
  component: Sheet,
  args: { title: 'Pull someone in' },
} satisfies Meta<typeof Sheet>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The overlay: slides up over the scrim with `dur-gather` / `ease-breakthrough`. */
export const Default: Story = {
  parameters: onSituation('forming'),
  render: () => (
    <OpenSheet title="Jeanne-Mance Park">
      <PlaceSummary />
    </OpenSheet>
  ),
};

/** Full-width actions at the bottom. */
export const WithActions: Story = {
  parameters: onSituation('forming'),
  render: () => (
    <OpenSheet
      title="Pull someone in"
      actions={(close) => (
        <>
          <Button block onPress={close}>
            SEND 1 INVITE
          </Button>
          <Button block variant="ghost" onPress={close}>
            NOT NOW
          </Button>
        </>
      )}
    >
      <PeopleList />
    </OpenSheet>
  ),
};

/** Content taller than 90% of the window scrolls inside the sheet; header and actions stay put. */
export const LongContent: Story = {
  parameters: onSituation('calm'),
  render: () => (
    <OpenSheet
      title="Pull someone in"
      actions={(close) => (
        <Button block onPress={close}>
          SEND 3 INVITES
        </Button>
      )}
    >
      <PeopleList count={15} />
    </OpenSheet>
  ),
};

/** Reduced motion forced on: the sheet cross-fades in 120ms instead of sliding. */
export const ReducedMotion: Story = {
  parameters: onSituation('calm'),
  render: () => (
    <ReducedMotionOverride value>
      <OpenSheet title="Jeanne-Mance Park">
        <PlaceSummary />
      </OpenSheet>
    </ReducedMotionOverride>
  ),
};

/** The panel in place, on each situation a sheet can open from. It takes the ground it opens on. */
export const Anatomy: Story = {
  parameters: onSituation('calm', { padded: false }),
  render: () => (
    <EachSituation>
      <Sheet
        inline
        title="Pull someone in"
        onClose={() => {}}
        actions={<Button block>SEND 1 INVITE</Button>}
      >
        <PeopleList count={2} />
      </Sheet>
    </EachSituation>
  ),
};

/** The bare anatomy next to the web reference (title, body, no actions). */
export const Inline: Story = {
  render: () => (
    <Section title="Inline">
      <Sheet inline title="Pull someone in" onClose={() => {}}>
        <Text variant="body">Ranked by who is most likely to say yes.</Text>
      </Sheet>
    </Section>
  ),
};

/**
 * Overlays never stack. LEAVE PLAN opens a Modal while the sheet is still
 * open: the Modal waits (and a dev warning names both) until the sheet has
 * closed. The right call is to close the sheet first, as KEEP IT does here.
 */
function NoStacking() {
  const [sheet, setSheet] = useState(true);
  const [modal, setModal] = useState(false);
  return (
    <View className="gap-space-4">
      <Button variant="secondary" onPress={() => setSheet(true)}>
        OPEN SHEET
      </Button>
      <Sheet
        visible={sheet}
        title="Plan options"
        onClose={() => setSheet(false)}
        actions={
          <Button block variant="secondary" onPress={() => setModal(true)}>
            LEAVE PLAN
          </Button>
        }
      >
        <Text variant="body-sm" muted>
          Tap LEAVE PLAN: nothing draws over this sheet. Close it and the modal appears.
        </Text>
      </Sheet>
      <Modal
        visible={modal}
        title="LEAVE THIS PLAN?"
        body="7 of 8 are in. Leaving drops it to 6 of 8 and tells the host."
        confirm="LEAVE PLAN"
        cancel="STAY IN"
        onCancel={() => setModal(false)}
        onConfirm={() => setModal(false)}
      />
    </View>
  );
}

export const NeverStacks: Story = {
  parameters: onSituation('forming'),
  render: () => <NoStacking />,
};
