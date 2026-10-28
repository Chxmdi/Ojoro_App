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
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCABgAGADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDUooorAsKKKKACikzimNMi9WFAElFRrMjdGFPBzQAtFFFABRRRQAUUUUAFITgZNLVW+l8uEmmgKl/qAjyqnmsaS8lc53Go55DJISTUVaqNiGywl3KpzuNa9hqO8hXNYFPico4INNxTBM7NSGGRS1S06bzIRmrtYssKKKKQBRRRQAVm6vnyTWlVS/i8yE01uJnKHqaSpJkKSEGo63ICgdaKdGpdwBQBv6Nny61qo6bD5cIzV6sJbloKKKKQwooooAKRhkYNLUM1wkQ5NAGbqGn78sgrGkt5EOCK2bjVVGQOaz5b4OelaxuS7FVLd3OAK1tP04ghnFUo70Ic4rQg1VeAeKJXErGuqhVwKdUEN1HKODU1ZFi0UUUAFJS1WvJxDETmgCG+vVhUgHmsC4u3lY8nFNup2lkJJqCtoxsQ2BJNFFFUIKM0UUATwXLxMCDW9Y34lADHmuaqW3mMTgg1LjcaZ2IORS1TsLgTRDnmrlZMsSsLWJznaDW45wprl9TYmc1UFqJlKiiitSAooooAKKKKACiiigDV0icrIFzXQg5Ga5OwbbOK6qI5jBrKa1KR/9k=';

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
