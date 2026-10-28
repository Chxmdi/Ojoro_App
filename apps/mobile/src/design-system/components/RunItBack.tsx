import { Text as RNText, View } from 'react-native';

import { uiFamily } from '../fonts';
import { Situation } from '../Situation';
import { AvatarCluster, type Person } from './AvatarCluster';
import { Button } from './Button';
import { DisplayText } from './DisplayText';
import { RUN_IT_BACK_CLUSTER_MAX, runItBackModel } from './RunItBack.logic';
import { Text } from './Text';

export { runItBackModel } from './RunItBack.logic';

export type RunItBackProps = {
  activity: string;
  /** Who played: "Thursday FC + 2". */
  crew: string;
  /** When it last happened, in the overline: "TUE 6 OCT". */
  lastDate: string;
  /** How many played last time. */
  count: number;
  /** The suggested next time and spot, set in bold: "Tue 13 Oct, 7:30 at Jeanne-Mance". */
  suggested: string;
  /** Who played last time. They get an invite; none of them is in yet. */
  people?: Person[] | undefined;
  /**
   * RUN IT BACK. Opens a NEW plan with the same people invited; it never
   * copies attendance. No analytics here (features send `run_it_back_tapped`).
   */
  onRun?: (() => void) | undefined;
  /** CHANGE TIME. */
  onChange?: (() => void) | undefined;
};

/**
 * The after-game prompt to repeat a good session (RunItBack.md, web `function
 * RunItBack`). It sets the after situation (stone) on its own root. RUN IT
 * BACK is the commit button: Commit motion and the light haptic. It opens a
 * new plan: nobody is in until they tap I'M DOWN, which the button's
 * accessibility hint says. Appears once, the morning after (the feature
 * decides when).
 */
export function RunItBack({
  activity,
  crew,
  lastDate,
  count,
  suggested,
  people = [],
  onRun,
  onChange,
}: RunItBackProps) {
  const model = runItBackModel({ activity, crew, lastDate, count, suggested });
  return (
    <Situation id="after" role="region" className="gap-space-4 p-space-6">
      <View accessible accessibilityLabel={model.accessibilityLabel} className="gap-space-4">
        <Text variant="overline">{model.overline}</Text>
        <DisplayText size="xl">{model.question.join('\n')}</DisplayText>
        <Text variant="body">
          {'Same crew, same spot: '}
          <RNText style={{ fontFamily: uiFamily(700) }}>{suggested}</RNText>.
        </Text>
        <View className="flex-row items-center gap-space-3">
          <AvatarCluster people={people} total={count} max={RUN_IT_BACK_CLUSTER_MAX} />
          <Text variant="body-sm" muted className="shrink">
            {crew}
          </Text>
        </View>
      </View>
      <View className="flex-row flex-wrap items-center gap-space-3">
        <Button variant="commit" onPress={onRun} accessibilityHint={model.runHint}>
          RUN IT BACK
        </Button>
        {/* Button sets self-start; the wrapper lets the row centre it on the commit button, as `.oj-row` does. */}
        <View>
          <Button variant="ghost" onPress={onChange}>
            CHANGE TIME
          </Button>
        </View>
      </View>
    </Situation>
  );
}
