import { Platform, View, type TextStyle, type ViewStyle } from 'react-native';

import { Button } from './Button';
import { crowdSide, type CrowdKey, type CrowdSide } from './CrowdSupport.logic';
import { Text } from './Text';

export {
  crowdSide,
  type CrowdKey,
  type CrowdSide,
  type CrowdSideModel,
} from './CrowdSupport.logic';

export type CrowdSupportProps = {
  a: CrowdSide;
  b: CrowdSide;
  /** The side the viewer backs: its button turns primary and reads BACKING. */
  backing?: CrowdKey | undefined;
  /** BACK pressed. The owner toggles `backing` and sends `crowd_backed{side}`. No haptic. */
  onBack?: ((side: CrowdKey) => void) | undefined;
  /** Not in `index.d.ts`. Offline or not allowed: counts stay, buttons don't press. */
  disabled?: boolean | undefined;
  testID?: string | undefined;
};

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };
const growFromContent: ViewStyle = { flexGrow: 1, flexShrink: 1, flexBasis: 'auto' };

const hidden =
  Platform.OS === 'web'
    ? { 'aria-hidden': true as const }
    : {
        accessibilityElementsHidden: true,
        importantForAccessibility: 'no-hide-descendants' as const,
      };

/**
 * THE CROWD (CrowdSupport.md, web `function CrowdSupport`): how many back
 * each competitor, with a BACK button per side and a muted slash between.
 * Not backing: two secondary buttons. Backing one: that button is primary
 * and reads BACKING (and is selected for screen readers), so the state is a
 * word and a fill, never colour alone. Backing is light social action: no
 * haptic, no money, no points.
 */
export function CrowdSupport({ a, b, backing, onBack, disabled, testID }: CrowdSupportProps) {
  return (
    <View testID={testID} role="region" aria-label="The crowd">
      <Text variant="overline">THE CROWD</Text>
      <View className="mt-space-3 flex-row items-stretch gap-space-4">
        <Side side={a} k="a" backing={backing} onBack={onBack} disabled={disabled} />
        <Text variant="display-sm" muted className="self-center" {...hidden}>
          /
        </Text>
        <Side side={b} k="b" backing={backing} onBack={onBack} disabled={disabled} />
      </View>
    </View>
  );
}

function Side({
  side,
  k,
  backing,
  onBack,
  disabled,
}: {
  side: CrowdSide;
  k: CrowdKey;
  backing: CrowdKey | undefined;
  onBack: ((side: CrowdKey) => void) | undefined;
  disabled: boolean | undefined;
}) {
  const m = crowdSide(side, k, backing);
  const selected =
    Platform.OS === 'web'
      ? { 'aria-pressed': m.backing }
      : { accessibilityState: { selected: m.backing, disabled: !!disabled } };
  return (
    // Grow from the content's width, like the web's `flex: 1` with `min-width: auto`,
    // so a longer name's BACK button keeps one line and takes the extra room.
    <View className="items-start gap-space-2" style={growFromContent}>
      <View accessible accessibilityLabel={m.spoken} className="gap-space-2">
        <Text variant="display-lg" style={tabular}>
          {m.count}
        </Text>
        <Text variant="label">{m.caption}</Text>
      </View>
      <Button
        variant={m.variant}
        accessibilityLabel={m.buttonLabel}
        {...selected}
        disabled={disabled}
        {...(onBack ? { onPress: () => onBack(k) } : null)}
      >
        {m.button}
      </Button>
    </View>
  );
}
