import { View } from 'react-native';

import { useThemeColor } from '../useThemeColor';
import { Icon } from './Icon';
import { Text } from './Text';
import { verificationModel, type VerificationLevel } from './VerificationBadge.logic';

export { VERIFICATION_LEVELS, VERIFY, type VerificationLevel } from './VerificationBadge.logic';

export type VerificationBadgeProps = {
  /**
   * `checked-in` (at the place, now) · `result` (filled: both sides confirmed) ·
   * `identity` (ID verified) · `host` (filled: reliable organiser). Default `checked-in`.
   */
  level: VerificationLevel;
  testID?: string | undefined;
};

/**
 * Trust mark (`.oj-verify`): a check inside the O, always with its word, so
 * it never rests on colour. Only the system grants these. Filled O = confirmed
 * by Ojoro; outlined = confirmed by the person.
 *
 * The filled O takes the situation's `signal`, which is white on confirmed and
 * live, so the oxblood disc never lands on a black or oxblood ground.
 */
export function VerificationBadge({ level, testID }: VerificationBadgeProps) {
  const model = verificationModel(level);
  const text = useThemeColor('text');
  const onSignal = useThemeColor('on-signal');
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={model.spoken}
      testID={testID}
      className="shrink-0 flex-row items-center gap-space-2 self-start"
    >
      <View
        className={`size-[20px] items-center justify-center rounded-disc border-2 ${
          model.filled ? 'border-signal bg-signal' : 'border-text'
        }`}
      >
        <Icon name="check" size={12} strokeWidth={3} color={model.filled ? onSignal : text} />
      </View>
      <Text variant="label-sm" numberOfLines={1}>
        {model.word}
      </Text>
    </View>
  );
}
