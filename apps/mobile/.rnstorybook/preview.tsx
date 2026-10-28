import '../src/global.css';

import { situationIds, spacing, type SituationId } from '@ojoro/design-tokens';
import type { Decorator, Preview } from '@storybook/react-native';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { Situation, useOjoroFonts } from '../src/design-system';
import type { OjoroParameters } from '../src/design-system/stories/storyKit';

function OjoroFrame({
  situation,
  padded,
  children,
}: {
  situation: SituationId;
  padded: boolean;
  children: ReactNode;
}) {
  const [loaded, error] = useOjoroFonts();
  // Hold the story until Anton and Inter are in, so type is never shown in a fallback face.
  if (!loaded && !error) return <View style={{ flex: 1 }} />;
  return (
    <Situation id={situation} style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={padded ? { padding: spacing['space-5'] } : undefined}
      >
        {children}
      </ScrollView>
    </Situation>
  );
}

/**
 * Loads the Ojoro fonts and renders every story on a situation ground.
 * Situation: the `situation` control if set, else `parameters.ojoro.situation`, else calm.
 * The `situation` arg is taken out before the story's component sees its args.
 */
const withOjoro: Decorator = (Story, context) => {
  const { situation: fromControl, ...args } = context.args;
  const params = (context.parameters.ojoro ?? {}) as OjoroParameters;
  const situation = (fromControl as SituationId | undefined) ?? params.situation ?? 'calm';
  return (
    <OjoroFrame situation={situation} padded={params.padded ?? true}>
      <Story args={args} />
    </OjoroFrame>
  );
};

const preview: Preview = {
  decorators: [withOjoro],
  argTypes: {
    situation: {
      name: 'situation',
      description: 'Ground the story renders on (overrides the story default).',
      control: { type: 'select' },
      options: [...situationIds],
    },
  },
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
  },
};

export default preview;
