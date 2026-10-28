/**
 * Helpers for writing design-system stories. Not shipped in the app: only
 * `*.stories.tsx` files import this, and Metro bundles those only when
 * Storybook is enabled.
 *
 * Every story is wrapped by the decorator in `.rnstorybook/preview.tsx`: fonts
 * load, then the story renders inside `<Situation id>` with space-5 padding.
 * Pick the situation per story with `parameters: onSituation('live')`, or live
 * with the `situation` control. For a spec that says "on each situation it can
 * appear in", render `<EachSituation>` or export one story per situation.
 */
import { situationIds, type SituationId } from '@ojoro/design-tokens';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Situation } from '../Situation';
import { Text } from '../components/Text';

export { situationIds, type SituationId };

/** Story parameters read by the preview decorator. */
export type OjoroParameters = {
  /** The ground the story renders on. Default `calm`. The `situation` control overrides it. */
  situation?: SituationId;
  /** Space-5 padding around the story. Default true. Turn off for full-bleed objects. */
  padded?: boolean;
};

/** `parameters: onSituation('confirmed')` pins a story to one ground. */
export function onSituation(id: SituationId, extra?: Omit<OjoroParameters, 'situation'>) {
  return { ojoro: { situation: id, ...extra } satisfies OjoroParameters };
}

/** Display names for the five situations, in forward order. */
export const situationNames: Record<SituationId, string> = {
  calm: 'Calm',
  forming: 'Forming',
  confirmed: 'Confirmed',
  live: 'Live',
  after: 'After',
};

/** A labelled block inside a story: overline heading, then content. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-space-3 pb-space-8">
      <Text variant="overline">{title}</Text>
      {children}
    </View>
  );
}

/**
 * Renders `children` once on each situation (or on `only`), each on its own
 * ground with the situation's name, so a component can be checked across
 * grounds in one story. `children` can be a function of the situation.
 */
export function EachSituation({
  children,
  only = situationIds,
}: {
  children: ReactNode | ((id: SituationId) => ReactNode);
  only?: readonly SituationId[];
}) {
  return (
    <View className="gap-space-4">
      {only.map((id) => (
        <Situation key={id} id={id} className="gap-space-3 p-space-5">
          <Text variant="overline">{situationNames[id]}</Text>
          {typeof children === 'function' ? children(id) : children}
        </Situation>
      ))}
    </View>
  );
}
