import type { Href } from 'expo-router';
import type { GestureResponderEvent } from 'react-native';

import { Band } from './Band';
import { Button } from './Button';
import { latentDemandModel, type LatentDemandVariant } from './LatentDemand.logic';
import { Panel } from './Panel';
import { Progress } from './Progress';
import { Text } from './Text';

export {
  LATENT_DEMAND_NOTE,
  LATENT_DEMAND_VARIANTS,
  latentDemandModel,
  type LatentDemandVariant,
} from './LatentDemand.logic';

export type LatentDemandProps = {
  /**
   * `panel` (Discover, inside Ojoro Now): a contained block with MAKE IT HAPPEN.
   * `band` (FirstHome): a full-bleed forming band with a count toward the
   * threshold and I'M DOWN. Default `panel`.
   */
  variant?: LatentDemandVariant | undefined;
  /** People who want it. A count only: the component takes no people, names or places. Nothing renders at 0. */
  count: number;
  /** The plan forms at this many. The band shows `count` of `threshold` as Progress. */
  threshold?: number | undefined;
  /** NOTHING ON FOR VOLLEYBALL · PEOPLE WANT THIS. */
  overline: string;
  /**
   * Panel: the `title` sentence ("5 people within 3 km want to play volleyball
   * after 7. That's a game."). Band: the display headline ("AN EASY 5K THIS WEEK.").
   * Areas and distances only, never a place someone is at.
   */
  headline: string;
  /** The `body-sm` line ("3 runners nearby are down for an evening run. Add yourself and it becomes a plan at 4."). */
  summary?: string | undefined;
  /** Overrides the privacy line. Defaults to the prototype's wording for the variant. */
  note?: string | undefined;
  /** The main action: MAKE IT HAPPEN (panel) or I'M DOWN (band). */
  onPress?: ((event: GestureResponderEvent) => void) | undefined;
  /** Where the main action goes (Create From Demand opens Plan Forming). */
  href?: Href | undefined;
  /** Band: you've added yourself; the commit button locks to YOU'RE DOWN. */
  joined?: boolean | undefined;
  /** The main action is being saved: spinner, presses ignored. */
  pending?: boolean | undefined;
  /** Panel: SURPRISE ME (secondary), Ojoro Now's surprise path. Hidden without it. */
  onSurpriseMe?: ((event: GestureResponderEvent) => void) | undefined;
  testID?: string | undefined;
};

/**
 * Aggregate demand with no plan yet, so a quiet feed is never a dead end
 * (PRD §9.6, §21.4). Shown as a count only: no avatars, names or locations
 * until people join, and the privacy line says so.
 */
export function LatentDemand({
  variant = 'panel',
  count,
  threshold,
  overline,
  headline,
  summary,
  note,
  onPress,
  href,
  joined = false,
  pending = false,
  onSurpriseMe,
  testID,
}: LatentDemandProps) {
  const model = latentDemandModel({ variant, count, threshold, note });
  if (!model) return null;

  if (variant === 'band') {
    return (
      <Band situation="forming" gap={14} accessibilityLabel={overline} testID={testID}>
        <Text variant="overline">{overline}</Text>
        <Text variant="display-md">{headline}</Text>
        {summary ? <Text variant="body-sm">{summary}</Text> : null}
        {model.progress ? (
          <Progress
            value={model.progress.value}
            max={model.progress.max}
            label={model.progress.label}
          />
        ) : null}
        <Text variant="caption" muted>
          {model.note}
        </Text>
        <Button
          variant="commit"
          block
          committed={joined}
          loading={pending}
          onPress={onPress}
          {...(href ? { href } : null)}
        />
      </Band>
    );
  }

  return (
    <Panel
      overline={overline}
      title={headline}
      body={summary}
      note={model.note}
      accessibilityLabel={overline}
      testID={testID}
      actions={
        <>
          <Button
            variant="primary"
            loading={pending}
            onPress={onPress}
            {...(href ? { href } : null)}
          >
            MAKE IT HAPPEN
          </Button>
          {onSurpriseMe ? (
            <Button variant="secondary" onPress={onSurpriseMe}>
              SURPRISE ME
            </Button>
          ) : null}
        </>
      }
    />
  );
}
