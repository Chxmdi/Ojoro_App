import { Link, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, View, type GestureResponderEvent } from 'react-native';

import { useThemeColor } from '../useThemeColor';
import { Icon } from './Icon';
import { placeLabel, placeLights, placeMeta, plansTonightCount } from './PlaceMiniCard.logic';
import { FocusRing, noBrowserOutline, useFocusVisible } from './pressFeedback';
import { Text } from './Text';

export type PlaceMiniCardProps = {
  name: string;
  /** What it's for: "Football", "Gym", "Running route". */
  kind: string;
  /** "Turf · north pitch", "Paved · 8 km loop". */
  surface?: string | undefined;
  distance?: string | undefined;
  /** Floodlit until ("11 PM"). */
  lights?: string | undefined;
  /** Plans on there tonight; the count shows on the right when above zero. */
  plansTonight?: number | undefined;
  /** The place's screen (Expo Router `<Link asChild>`). */
  href?: Href | undefined;
  onPress?: ((event: GestureResponderEvent) => void) | undefined;
  /** The `line` hairline under the card. Default true. */
  rule?: boolean | undefined;
  testID?: string | undefined;
};

/**
 * A place as a strip (`.oj-place`): the O with a pin, name, what it's for,
 * floodlights, and how many plans are on there tonight. One link, at least
 * 44pt tall; its label includes the count. No map thumbnail: places are
 * real-world anchors, and the map has its own screen.
 */
export function PlaceMiniCard({
  name,
  kind,
  surface,
  distance,
  lights,
  plansTonight,
  href,
  onPress,
  rule = true,
  testID,
}: PlaceMiniCardProps) {
  const text = useThemeColor('text');
  const pressedGround = useThemeColor('surface-raised');
  const focus = useFocusVisible({});
  const [pressed, setPressed] = useState(false);
  const parts = { name, kind, surface, distance, lights, plansTonight };
  const count = plansTonightCount(plansTonight);
  const lightsLine = placeLights(lights);
  const label = placeLabel(parts);

  const row = (
    <View
      className="min-h-touch flex-row items-center gap-space-4 py-space-3"
      style={pressed ? { backgroundColor: pressedGround } : undefined}
    >
      <View className="size-touch shrink-0 items-center justify-center rounded-disc border-2 border-text">
        <Icon name="pin" color={text} />
      </View>
      <View className="min-w-0 flex-1 gap-[2px]">
        <Text variant="title-sm">{name}</Text>
        <Text variant="body-sm" muted>
          {placeMeta(parts)}
        </Text>
        {lightsLine ? (
          <View className="flex-row items-center gap-space-1">
            <Icon name="lights" size={14} color={text} />
            <Text variant="caption">{lightsLine}</Text>
          </View>
        ) : null}
      </View>
      {count ? (
        <View className="shrink-0 items-end">
          <Text variant="display-xs" style={{ fontVariant: ['tabular-nums'] }}>
            {String(count)}
          </Text>
          <Text variant="label-sm" muted>
            TONIGHT
          </Text>
        </View>
      ) : null}
    </View>
  );

  const outerClass = ['relative', rule ? 'border-b border-line' : null].filter(Boolean).join(' ');

  if (!href && !onPress) {
    return (
      <View accessible accessibilityLabel={label} testID={testID} className={outerClass}>
        {row}
      </View>
    );
  }

  const pressable = (
    <Pressable
      onPress={onPress}
      onPressIn={(event) => {
        setPressed(true);
        focus.onPressIn(event);
      }}
      onPressOut={() => setPressed(false)}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      accessibilityRole={href ? 'link' : 'button'}
      accessibilityLabel={label}
      testID={testID}
      className={outerClass}
      style={noBrowserOutline}
    >
      {row}
      {focus.focusVisible ? <FocusRing shape="square" /> : null}
    </Pressable>
  );

  return href ? (
    <Link href={href} asChild>
      {pressable}
    </Link>
  ) : (
    pressable
  );
}
