import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { EachSituation, onSituation, Section } from '../stories/storyKit';
import { Badge } from './Badge';
import { Divider } from './Divider';
import { Icon } from './Icon';
import {
  ParticipantList,
  ParticipantRow,
  PARTICIPANT_ROLES,
  sortParticipants,
} from './ParticipantRow';
import { Text } from './Text';

const ade = { name: 'Ade B' };
const chimdi = { name: 'Chimdi O' };
const marcus = { name: 'Marcus T' };
const lena = { name: 'Lena R' };
const tolu = { name: 'Tolu D' };

const meta = {
  title: 'Social/ParticipantRow',
  component: ParticipantRow,
  args: { person: marcus, role: 'in', meta: '12 games with you' },
  argTypes: {
    role: { control: { type: 'select' }, options: [...PARTICIPANT_ROLES] },
    meta: { control: { type: 'text' } },
    action: { control: { type: 'text' } },
  },
  parameters: onSituation('forming'),
} satisfies Meta<typeof ParticipantRow>;

export default meta;

type Story = StoryObj<typeof meta>;

/** One row; tap opens the profile, where report and block live. */
export const Default: Story = {
  render: (args) => (
    <ParticipantList>
      <ParticipantRow {...args} onPress={() => {}} accessibilityHint="Opens the profile" />
    </ParticipantList>
  ),
};

/** Plan › WHO'S IN · 6 OF 8, on forming. */
export const PlanWhosIn: Story = {
  render: () => (
    <View className="gap-space-2">
      <Divider label="WHO'S IN · 6 OF 8" />
      <ParticipantList testID="rows">
        <ParticipantRow
          person={ade}
          role="host"
          meta="Started the plan · 40 games hosted"
          onPress={() => {}}
        />
        <ParticipantRow person={chimdi} role="in" meta="You · midfield" onPress={() => {}} />
        <ParticipantRow person={marcus} role="in" meta="12 games with you" onPress={() => {}} />
        <ParticipantRow
          person={lena}
          role="in"
          meta="New to the area · first game"
          onPress={() => {}}
        />
      </ParticipantList>
      <Text variant="body-sm" muted>
        + Sam K and Yara M
      </Text>
    </View>
  ),
};

/** CheckIn › ARRIVALS, on confirmed: check-in time in the context line, the CHECKED IN mark. */
export const CheckInArrivals: Story = {
  parameters: onSituation('confirmed'),
  render: () => (
    <View className="gap-space-2">
      <Divider label="ARRIVALS" />
      <ParticipantList testID="rows">
        <ParticipantRow person={ade} role="checked" meta="Host · 6:52" />
        <ParticipantRow person={chimdi} role="checked" meta="You · 7:04" />
        <ParticipantRow person={marcus} role="in" meta="On the way · about 5 min" />
        <ParticipantRow person={tolu} role="in" meta="Not checked in yet" />
      </ParticipantList>
    </View>
  ),
};

/** Every role, sorted host, checked in, in, maybe, invited. */
export const Roles: Story = {
  render: () => {
    const rows = sortParticipants([
      { person: { name: 'Yara M' }, role: 'invited' as const, meta: 'Invited by Ade' },
      { person: marcus, role: 'maybe' as const, meta: 'Maybe · after work' },
      { person: chimdi, role: 'in' as const, meta: 'You · midfield' },
      { person: lena, role: 'checked' as const, meta: '7:04' },
      { person: ade, role: 'host' as const, meta: 'Started the plan' },
    ]);
    return (
      <EachSituation only={['calm', 'forming', 'confirmed']}>
        <ParticipantList>
          {rows.map((r) => (
            <ParticipantRow key={r.person.name} {...r} />
          ))}
        </ParticipantList>
      </EachSituation>
    );
  },
  parameters: { ojoro: { padded: false } },
};

/** Host view: a ghost action beside the status (NUDGE, REMOVE). */
export const WithAction: Story = {
  render: () => (
    <ParticipantList>
      <ParticipantRow
        person={marcus}
        role="invited"
        meta="Invited 2 h ago"
        action="NUDGE"
        actionLabel="Nudge Marcus T"
        onAction={() => {}}
        onPress={() => {}}
      />
      <ParticipantRow
        person={lena}
        role="in"
        meta="New to the area · first game"
        action="REMOVE"
        actionLabel="Remove Lena R"
        onAction={() => {}}
        onPress={() => {}}
      />
    </ParticipantList>
  ),
};

/** The custom trailing slot (HostRoster, HostPeople): any badge, a chevron, a waitlist number, or nothing. */
export const CustomTrailing: Story = {
  parameters: onSituation('calm'),
  render: () => (
    <View>
      <Section title="Roster">
        <ParticipantList>
          <ParticipantRow
            person={{ name: 'Rina S' }}
            meta="Regular · 14 sessions"
            trailing={<Badge>PAID</Badge>}
          />
          <ParticipantRow
            person={{ name: 'Tomás V' }}
            meta="New · pays at the field"
            trailing={<Badge tone="signal">AT THE FIELD</Badge>}
          />
          <ParticipantRow
            person={{ name: 'Joel A' }}
            meta="9 of last 12"
            trailing={<Icon name="forward" size={18} />}
            trailingLabel=""
            onPress={() => {}}
          />
        </ParticipantList>
      </Section>
      <Section title="Waitlist">
        <ParticipantList>
          <ParticipantRow
            leading={
              <Text variant="display-xs" style={{ width: 24 }}>
                1
              </Text>
            }
            avatarSize="sm"
            person={{ name: 'Kemi O' }}
            meta="Waiting since Tue"
            trailing={null}
          />
        </ParticipantList>
      </Section>
      <Section title="No mark">
        <ParticipantList>
          <ParticipantRow
            person={{ name: 'Dayo F' }}
            meta="Dropped at 2:30. Rina took the spot a minute later, so Dayo's $8 went back automatically."
            trailing={null}
          />
        </ParticipantList>
      </Section>
    </View>
  ),
};
