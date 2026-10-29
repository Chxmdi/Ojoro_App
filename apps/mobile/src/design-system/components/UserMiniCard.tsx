import { Link, type Href } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, View, type GestureResponderEvent } from 'react-native';

import { useThemeColor } from '../useThemeColor';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { Button } from './Button';
import { FocusRing, noBrowserOutline, useFocusVisible } from './pressFeedback';
import { Text } from './Text';
import {
  userMeta,
  userMiniCardActions,
  userMiniCardLabel,
  userRows,
  type UserStat,
} from './UserMiniCard.logic';
import { VerificationBadge } from './VerificationBadge';

export type { UserStat } from './UserMiniCard.logic';

export type UserMiniCardProps = {
  name: string;
  /** Without the @; the card adds it. */
  handle: string;
  /** A candid photo. Initials show without one. */
  src?: string | undefined;
  /** An area, never an address ("Mile End"). */
  area?: string | undefined;
  /** ID verified: the `identity` VerificationBadge next to the name. */
  verified?: boolean | undefined;
  /** What they play, as outline badges ("Football", "Running"). */
  sports?: readonly string[] | undefined;
  /** Counts only, never scores or levels: `{ value: '61', label: 'Sessions' }`. */
  stats?: readonly UserStat[] | undefined;
  /** FOLLOWING (secondary, pressed) instead of FOLLOW (primary). */
  following?: boolean | undefined;
  /** FOLLOW / FOLLOWING. Leave out to hide the button (your own card). */
  onFollow?: ((event: GestureResponderEvent) => void) | undefined;
  /** CALL OUT, always the ghost after FOLLOW. Leave out to hide it. */
  onCallOut?: ((event: GestureResponderEvent) => void) | undefined;
  /** FOLLOW is being saved: keeps its label, adds a spinner, ignores presses. */
  followPending?: boolean | undefined;
  /** Opens the profile (Expo Router `<Link asChild>`), where report and block live. */
  href?: Href | undefined;
  /** Opens the profile. */
  onPress?: ((event: GestureResponderEvent) => void) | undefined;
  testID?: string | undefined;
};

/**
 * A compact physical identity (`.oj-usercard`): photo, name, ID badge, handle
 * and area; counts over a hairline; sports as badges; FOLLOW then CALL OUT.
 * Contained on `surface-raised` because it floats over content.
 *
 * Everything above the buttons is one element read as one sentence and, with
 * `href`/`onPress`, one target (at least 72pt tall) that opens the profile.
 * FOLLOW and CALL OUT stay separate targets after it.
 */
export function UserMiniCard({
  name,
  handle,
  src,
  area,
  verified,
  sports,
  stats,
  following,
  onFollow,
  onCallOut,
  followPending,
  href,
  onPress,
  testID,
}: UserMiniCardProps) {
  const pressedGround = useThemeColor('surface');
  const focus = useFocusVisible({});
  const [pressed, setPressed] = useState(false);
  const rows = userRows({ sports, stats });
  const label = userMiniCardLabel({ name, handle, area, verified, sports, stats });
  const actions = userMiniCardActions({
    following,
    hasFollow: !!onFollow,
    hasCallOut: !!onCallOut,
  });
  const followState = actions.follow
    ? Platform.OS === 'web'
      ? { 'aria-pressed': actions.follow.pressed }
      : { 'aria-selected': actions.follow.pressed }
    : null;

  const identity = (
    <View className="gap-space-4" style={pressed ? { backgroundColor: pressedGround } : undefined}>
      <View className="flex-row items-center gap-space-4">
        <Avatar name={name} size="lg" {...(src ? { src } : null)} />
        <View className="min-w-0 flex-1 gap-space-1">
          <View className="flex-row flex-wrap items-center gap-space-2">
            <Text variant="title">{name}</Text>
            {/* VerificationBadge sets self-start; the wrapper lets the row centre it on the name, as `.oj-row` does. */}
            {verified ? (
              <View>
                <VerificationBadge level="identity" />
              </View>
            ) : null}
          </View>
          <Text variant="body-sm" muted>
            {userMeta({ handle, area })}
          </Text>
        </View>
      </View>
      {rows.stats.length ? (
        <View className="flex-row gap-space-8 border-t border-line pt-space-3">
          {rows.stats.map((s, i) => (
            <View key={`${s.label}-${i}`}>
              <Text variant="display-xs" style={{ fontVariant: ['tabular-nums'] }}>
                {s.value}
              </Text>
              <Text variant="caption" muted>
                {s.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {rows.sports.length ? (
        <View className="flex-row flex-wrap items-center gap-space-3">
          {rows.sports.map((s) => (
            <Badge key={s}>{s}</Badge>
          ))}
        </View>
      ) : null}
    </View>
  );

  let top;
  if (!href && !onPress) {
    top = (
      <View accessible accessibilityLabel={label}>
        {identity}
      </View>
    );
  } else {
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
        accessibilityHint="Opens the profile"
        className="relative min-h-touch"
        style={noBrowserOutline}
      >
        {identity}
        {focus.focusVisible ? <FocusRing shape="square" /> : null}
      </Pressable>
    );
    top = href ? (
      <Link href={href} asChild>
        {pressable}
      </Link>
    ) : (
      pressable
    );
  }

  return (
    <View testID={testID} className="max-w-[420px] gap-space-4 bg-surface-raised p-space-5">
      {top}
      {actions.follow || actions.callOut ? (
        <View className="flex-row flex-wrap items-center gap-space-3">
          {actions.follow ? (
            <Button
              variant={actions.follow.variant}
              {...followState}
              loading={!!followPending}
              onPress={onFollow}
              accessibilityLabel={actions.follow.pressed ? `Following ${name}` : `Follow ${name}`}
            >
              {actions.follow.label}
            </Button>
          ) : null}
          {actions.callOut ? (
            <Button variant="ghost" onPress={onCallOut} accessibilityLabel={`Call out ${name}`}>
              CALL OUT
            </Button>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
