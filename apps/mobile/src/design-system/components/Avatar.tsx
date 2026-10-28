import { size as sizes } from '@ojoro/design-tokens';
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { REDUCED_MOTION_FADE, useMotion } from '../motion';
import { useThemeColor } from '../useThemeColor';
import { initials } from './initials';
import { Text } from './Text';

export type AvatarSize = 'sm' | 'md' | 'lg';

export type AvatarProps = {
  /** The person's name: the accessibility label, and the initials when there's no photo. */
  name?: string;
  /** A candid photo, never stock. */
  src?: string;
  /** `sm` 28 · `md` 40 · `lg` 72. Default `md`. */
  size?: AvatarSize;
  /** An open spot in a plan: the dashed O. Reads "Open spot". */
  empty?: boolean;
  /**
   * Just joined (Person.isNew): flies into the cluster with the Gather motion.
   * The web reference sets this as the `is-new` class from AvatarCluster.
   */
  isNew?: boolean;
};

const dimension: Record<AvatarSize, number> = {
  sm: sizes['size-avatar-sm'],
  md: sizes['size-avatar-md'],
  lg: sizes['size-avatar-lg'],
};

/** Initials size per avatar size, from bundle.css (`.oj-avatar-*`), line-height 1. */
const initialsSize: Record<AvatarSize, number> = { sm: 11, md: 14, lg: 24 };

const box: Record<AvatarSize, string> = {
  sm: 'size-avatar-sm',
  md: 'size-avatar-md',
  lg: 'size-avatar-lg',
};

/** `@keyframes oj-gather`: from translate(24px, -16px) scale(.4), opacity 0. */
function useGather(isNew: boolean) {
  const { duration, easing, reduced } = useMotion('gather');
  const t = useSharedValue(isNew ? 0 : 1);
  useEffect(() => {
    if (!isNew) return;
    t.value = 0;
    t.value = withTiming(1, reduced ? { duration: REDUCED_MOTION_FADE } : { duration, easing });
  }, [isNew, reduced, duration, easing, t]);
  return useAnimatedStyle(() => {
    const k = 1 - t.value;
    return reduced
      ? { opacity: t.value }
      : {
          opacity: t.value,
          transform: [
            { translateX: 24 * k },
            { translateY: -16 * k },
            { scale: 0.4 + 0.6 * t.value },
          ],
        };
  });
}

/**
 * A person, drawn as the O: a disc with photo or initials on `tint`, or a
 * dashed empty slot. A 2px ring in the ground colour (web `box-shadow: 0 0 0
 * 2px var(--surface)`) separates overlapping avatars in a cluster.
 */
export function Avatar({ name, src, size = 'md', empty, isNew = false }: AvatarProps) {
  const surface = useThemeColor('surface');
  const gather = useGather(isNew);
  const label = empty ? 'Open spot' : name;
  const px = initialsSize[size];
  return (
    <Animated.View role="img" accessible accessibilityLabel={label} style={gather}>
      <View
        className={[
          box[size],
          'items-center justify-center overflow-hidden rounded-disc',
          empty ? 'border border-dashed border-line-strong' : 'bg-tint',
        ].join(' ')}
        style={empty ? null : { boxShadow: `0 0 0 2px ${surface}` }}
      >
        {empty ? null : src ? (
          <Image
            source={{ uri: src }}
            contentFit="cover"
            style={{ width: dimension[size], height: dimension[size] }}
            accessible={false}
          />
        ) : (
          <Text
            variant="label"
            tone="on-tint"
            allowFontScaling={false}
            importantForAccessibility="no"
            accessibilityElementsHidden
            style={{ fontSize: px, lineHeight: px, letterSpacing: 0 }}
          >
            {initials(name)}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}
