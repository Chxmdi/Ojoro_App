import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { EachSituation, onSituation, Section } from '../stories/storyKit';
import { Image, IMAGE_RATIOS } from './Image';
import { Text } from './Text';

/**
 * Sample photo for stories: a 160×200 JPEG drawn locally (floodlight, court,
 * three figures), inlined so stories work offline. Never hot-link stock photos.
 */
const PHOTO =
  'data:image/jpeg;base64,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';

/** Decodes to nothing: the photo fails, as a dead link would. */
const BROKEN = 'data:image/png;base64,AAAA';

/** A non-routable address: the request never answers, so the frame stays loading. */
const NEVER_LOADS = 'http://10.255.255.1/photo.jpg';

const ALT = 'Eight players under the floodlight at Jeanne-Mance, Thursday night';

const meta = {
  title: 'Primitives/Image',
  component: Image,
  args: { src: PHOTO, alt: ALT, ratio: '4:5' },
  argTypes: {
    ratio: { control: { type: 'select' }, options: [...IMAGE_RATIOS] },
    src: { control: { type: 'text' } },
    alt: { control: { type: 'text' } },
    caption: { control: { type: 'text' } },
    credit: { control: { type: 'text' } },
  },
} satisfies Meta<typeof Image>;

export default meta;

type Story = StoryObj<typeof meta>;

/** 4:5, the feed default, driven by the controls. */
export const Default: Story = {};

/** Every ratio: 4:5 (feed) · 1:1 · 16:9 · 3:4. */
export const Ratios: Story = {
  render: () => (
    <View>
      {IMAGE_RATIOS.map((ratio) => (
        <Section key={ratio} title={ratio}>
          <Image src={PHOTO} alt={ALT} ratio={ratio} />
        </Section>
      ))}
    </View>
  ),
};

/** Caption and credit under the frame: "caption · credit", caption style, muted. */
export const CaptionAndCredit: Story = {
  args: { caption: 'Thursday FC, last game before the clocks change', credit: 'Photo: Maya K' },
};

/** Display type over the photo on the opacity-scrim black scrim; the overlay is the live situation, so type is white. */
export const ScrimHeadline: Story = {
  args: { ratio: '4:5', credit: 'Photo: Theo' },
  render: (args) => (
    <Image {...args}>
      <Text variant="overline">RECAP · THURSDAY FC</Text>
      <Text variant="display-lg">LIGHTS WIN 5–4.</Text>
      <Text variant="body-sm">8 played · 90 min</Text>
    </Image>
  ),
};

/** Loading: the surface-sunk ground, nothing else, until the photo arrives (then a 120ms cross-fade). */
export const Loading: Story = {
  args: { src: NEVER_LOADS },
};

/** The photo failed: the ground, the O and the alt in words. Never a broken-image icon. */
export const Failed: Story = {
  args: { src: BROKEN, caption: "Couldn't load this photo" },
};

/** No src at all: same as a failure. */
export const Missing: Story = {
  args: { src: undefined },
};

/** Missing under an overlay: the O moves to the top and the overlay carries the words. */
export const MissingWithScrim: Story = {
  args: { src: undefined, ratio: '16:9' },
  render: (args) => (
    <Image {...args}>
      <Text variant="display-md">GAME ON.</Text>
    </Image>
  ),
};

/** The empty frame and the caption on every ground (the sunk ground follows the situation). */
export const OnEachSituation: Story = {
  parameters: { ojoro: { padded: false } },
  render: () => (
    <EachSituation>
      <Image alt={ALT} ratio="16:9" caption="Rain on the canal route" credit="Photo: Ada" />
      <Image src={PHOTO} alt={ALT} ratio="16:9" credit="Photo: Ada">
        <Text variant="display-sm">5K. 24:10.</Text>
      </Image>
    </EachSituation>
  ),
};

/** In a recap: after situation, 4:5 with a headline. */
export const InRecap: Story = {
  parameters: onSituation('after'),
  render: () => (
    <Image src={PHOTO} alt={ALT} caption="Run it back next Thursday" credit="Photo: Lena R">
      <Text variant="display-xl">RAN IT BACK.</Text>
    </Image>
  ),
};
