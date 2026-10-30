import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { onSituation, Section } from '../stories/storyKit';
import {
  AreaMap,
  AreaMapLegend,
  AreaMapList,
  type AreaMapArea,
  type AreaMapPoint,
  type AreaMapProps,
} from './AreaMap';
import { ReducedMotionOverride } from './Overlay';

/* Sample content from Pulse. Seed data, not product copy. */
const points: AreaMapPoint[] = [
  {
    id: 'jeanne-mance',
    name: 'Jeanne-Mance Park',
    area: 'Plateau',
    lat: 45.5155,
    lng: -73.5857,
    activeCount: 12,
    forming: { count: 6, capacity: 8, sport: 'Football' },
  },
  {
    id: 'la-fontaine',
    name: 'Parc La Fontaine',
    area: 'Plateau',
    lat: 45.5265,
    lng: -73.5695,
    wanting: { count: 5, sport: 'volleyball' },
  },
  {
    id: 'hoshino',
    name: 'Hoshino Boxing',
    area: 'Downtown',
    lat: 45.505,
    lng: -73.5935,
    live: { word: 'Sparring' },
  },
  {
    id: 'pool',
    name: 'Rosemont pool',
    area: 'Mile End',
    lat: 45.5005,
    lng: -73.571,
    activeCount: 3,
  },
  {
    id: 'canal',
    name: 'Atwater track',
    area: 'Lachine Canal',
    lat: 45.4935,
    lng: -73.5845,
    activeCount: 2,
  },
];

const areas: AreaMapArea[] = [
  { id: 'plateau', name: 'Plateau', lat: 45.522, lng: -73.594 },
  { id: 'mile-end', name: 'Mile End', lat: 45.524, lng: -73.565 },
  { id: 'downtown', name: 'Downtown', lat: 45.498, lng: -73.594 },
];

const TITLE = 'Map of central Montréal';

function Stateful({ height = 640, ...props }: Partial<AreaMapProps> & { height?: number }) {
  const [selected, setSelected] = useState<string | null>(props.selectedId ?? 'jeanne-mance');
  return (
    <View style={{ height }}>
      <AreaMap
        title={TITLE}
        points={points}
        areas={areas}
        {...props}
        selectedId={selected}
        onSelect={setSelected}
      />
    </View>
  );
}

const meta = {
  title: 'Places/AreaMap',
  component: AreaMap,
  parameters: onSituation('live', { padded: false }),
  args: { title: TITLE, points, areas },
} satisfies Meta<typeof AreaMap>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Pulse: markers sized by count, words on the markers, the selected one ringed. Tap a marker to select it. */
export const Map: Story = { render: () => <Stateful /> };

/** The text alternative: the same points as rows, busiest first, SELECTED in words. */
export const List: Story = { render: () => <Stateful view="list" /> };

/** At 390×844 with room kept for Pulse's header (top) and place sheet (bottom). Markers stay clear of both. */
export const WithInsets: Story = {
  render: () => <Stateful height={844} inset={{ top: 150, bottom: 280 }} />,
};

/** Nothing on in the window. */
export const Empty: Story = { render: () => <Stateful points={[]} /> };

/** Many places on nearly the same spot: markers push apart so each keeps a 44pt target. */
export const Crowded: Story = {
  render: () => (
    <Stateful
      selectedId={null}
      points={Array.from({ length: 8 }, (_, i) => ({
        id: `p${i}`,
        name: `Court ${i + 1}`,
        lat: 45.51 + (i % 3) * 0.0004,
        lng: -73.58 + Math.floor(i / 3) * 0.0004,
        activeCount: 1 + i * 2,
      }))}
    />
  ),
};

/** Reduced motion: the selection ring cross-fades in 120ms, no scale. */
export const ReducedMotion: Story = {
  render: () => (
    <ReducedMotionOverride value={true}>
      <Stateful />
    </ReducedMotionOverride>
  ),
};

/** The legend under Pulse's filters, and the list on its own (calm ground too). */
export const LegendAndList: Story = {
  parameters: onSituation('live'),
  render: () => (
    <View>
      <Section title="LEGEND">
        <AreaMapLegend />
      </Section>
      <Section title="LIST">
        <AreaMapList title={TITLE} points={points} selectedId="hoshino" onSelect={() => {}} />
      </Section>
    </View>
  ),
};
