import { View, type TextStyle } from 'react-native';

import { Situation } from '../Situation';
import { useThemeColor } from '../useThemeColor';
import { Badge } from './Badge';
import { Button } from './Button';
import { DisplayText, usePosterWidth } from './DisplayText';
import { Graphic } from './Graphic';
import { recapModel, type RecapStat } from './RecapPoster.logic';
import { Text } from './Text';

export { recapModel, type RecapModel, type RecapStat } from './RecapPoster.logic';

export type RecapPosterProps = {
  /** Who won. Only a verified result reaches a recap. */
  winner: string;
  /** "5K". */
  discipline: string;
  /** "SAT 12 OCT". */
  date?: string | undefined;
  /** "Chimdi by 43 s". Read aloud with the rest; not drawn (the web draws the numbers through `stats`). */
  result?: string | undefined;
  /** How it went, in a sentence or two. */
  story?: string | undefined;
  /** The numbers: times, WATCHED. Shown as written, in tabular figures. */
  stats?: readonly RecapStat[] | undefined;
  /** Not in `index.d.ts`: RUN IT BACK, the rematch (a new Call-Out). */
  onRunItBack?: (() => void) | undefined;
  /** Not in `index.d.ts`: SHARE RECAP. */
  onShare?: (() => void) | undefined;
  testID?: string | undefined;
};

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

/**
 * The final outcome as a keepsake (RecapPoster.md, web `function
 * RecapPoster`): always the after situation (stone) on its own root, a
 * VERIFIED badge, the crown in signal ink and the headline as a fact with a
 * period (CHIMDI WINS.) at the poster hero size. Then the numbers, the story,
 * and RUN IT BACK (the rematch) · SHARE RECAP. No haptic here: the result
 * verified haptic plays on ChallengeEventHero's change to `complete`.
 */
export function RecapPoster({
  winner,
  discipline,
  date,
  result,
  story,
  stats,
  onRunItBack,
  onShare,
  testID,
}: RecapPosterProps) {
  const model = recapModel({ winner, discipline, date, result, story, stats });
  const [width, onLayout] = usePosterWidth();
  const signal = useThemeColor('signal');
  return (
    <Situation id="after" testID={testID} role="article" className="p-space-6">
      <View className="gap-space-5" onLayout={onLayout}>
        <View accessible accessibilityLabel={model.accessibilityLabel} className="gap-space-5">
          <View className="flex-row items-center justify-between gap-space-3">
            <Text variant="overline">{model.overline}</Text>
            <Badge tone="verified">VERIFIED</Badge>
          </View>
          <View className="gap-space-2">
            <Graphic kind="crown" size={40} color={signal} />
            <DisplayText size="hero" posterWidth={width}>
              {model.headline}
            </DisplayText>
          </View>
          {stats && stats.length > 0 ? (
            <View className="flex-row flex-wrap gap-x-space-8 gap-y-space-4 border-t border-line pt-space-4">
              {stats.map((s) => (
                <View key={`${s.label}-${s.value}`}>
                  <DisplayText size="sm" style={tabular}>
                    {s.value}
                  </DisplayText>
                  <Text variant="label" muted>
                    {s.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          {story ? <Text variant="body">{story}</Text> : null}
        </View>
        <View className="flex-row flex-wrap items-center gap-space-3">
          <Button variant="primary" onPress={onRunItBack}>
            RUN IT BACK
          </Button>
          <Button variant="secondary" onPress={onShare}>
            SHARE RECAP
          </Button>
        </View>
      </View>
    </Situation>
  );
}
