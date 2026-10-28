import { Link, type Href } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, View, type GestureResponderEvent, type ViewProps } from 'react-native';

import { useThemeColor } from '../useThemeColor';
import { Avatar, type AvatarSize } from './Avatar';
import type { Person } from './AvatarCluster.logic';
import { Badge } from './Badge';
import { Button } from './Button';
import {
  participantLabel,
  roleMark,
  roleSpoken,
  type ParticipantRole,
} from './ParticipantRow.logic';
import { FocusRing, noBrowserOutline, useFocusVisible } from './pressFeedback';
import { textOf } from './Strip.logic';
import { Text } from './Text';
import { VerificationBadge } from './VerificationBadge';

export {
  PARTICIPANT_ROLES,
  ROLE,
  sortParticipants,
  type ParticipantRole,
} from './ParticipantRow.logic';

export type ParticipantRowProps = {
  person: Person;
  /** `host` · `in` (I'M DOWN) · `invited` · `maybe` · `checked` (verified check-in). Default `in`. */
  role?: ParticipantRole | undefined;
  /**
   * The context line under the name (`caption`, muted): "12 games with you",
   * "New to the area · first game", or the check-in time ("Host · 6:52").
   */
  meta?: string | undefined;
  /** A host's text action after the status (NUDGE, REMOVE): a ghost button. */
  action?: string | undefined;
  onAction?: (() => void) | undefined;
  /** How the action reads aloud when the word alone doesn't say who it acts on ("Nudge Marcus T"). */
  actionLabel?: string | undefined;
  /**
   * Replaces the role mark with any node (a `Badge` with PAID, a chevron, a
   * count). Pass `null` for no mark at all. When set, the role is read aloud
   * only if `role` is passed too.
   */
  trailing?: ReactNode;
  /** How `trailing` reads aloud. Defaults to the words inside it. */
  trailingLabel?: string | undefined;
  /** Before the avatar: a waitlist position, say (HostRoster). */
  leading?: ReactNode;
  /** `md` (default) or `sm` (waitlists). */
  avatarSize?: Extract<AvatarSize, 'sm' | 'md'> | undefined;
  /** Opens the person's profile, where report and block live. */
  onPress?: ((event: GestureResponderEvent) => void) | undefined;
  /** The profile route (Expo Router `<Link asChild>`). */
  href?: Href | undefined;
  /** For a pressable row: what happens ("Opens Marcus T's profile"). */
  accessibilityHint?: string | undefined;
  /** The `line` hairline under the row. Default true, the last row included. */
  rule?: boolean | undefined;
  testID?: string | undefined;
};

/**
 * One person in a plan or event (`.oj-prow`): avatar, name, a context line and
 * their status in words. Use inside a `role="list"` container
 * (`ParticipantList`), sorted with `sortParticipants`.
 *
 * The person part (avatar, name, meta, status) is one element for the screen
 * reader and, with `onPress`/`href`, one target that opens the profile. The
 * host action sits beside it as its own button, so both stay reachable.
 */
export function ParticipantRow({
  person,
  role,
  meta,
  action,
  onAction,
  actionLabel,
  trailing,
  trailingLabel,
  leading,
  avatarSize = 'md',
  onPress,
  href,
  accessibilityHint,
  rule = true,
  testID,
}: ParticipantRowProps) {
  const pressedGround = useThemeColor('surface-raised');
  const focus = useFocusVisible({});
  const [pressed, setPressed] = useState(false);
  const custom = trailing !== undefined;
  const mark = roleMark(role);
  const label = participantLabel({
    name: person.name,
    status: custom && role === undefined ? undefined : roleSpoken(role),
    meta,
    trailing: custom ? (trailingLabel ?? textOf(trailing)) : undefined,
  });

  const body = (
    <>
      {leading != null && leading !== false ? <View className="shrink-0">{leading}</View> : null}
      <Avatar name={person.name} {...(person.src ? { src: person.src } : null)} size={avatarSize} />
      <View className="min-w-0 flex-1">
        <Text variant="title-sm">{person.name}</Text>
        {meta ? (
          <Text variant="caption" muted>
            {meta}
          </Text>
        ) : null}
      </View>
      {custom ? (
        trailing != null && trailing !== false ? (
          <View className="shrink-0">{trailing}</View>
        ) : null
      ) : mark.kind === 'verified' ? (
        <View className="shrink-0">
          <VerificationBadge level="checked-in" />
        </View>
      ) : (
        <View className="shrink-0">
          <Badge tone={mark.tone}>{mark.text}</Badge>
        </View>
      )}
    </>
  );

  // `.oj-prow { min-height: size-touch; padding: space-3 0 }` is content-box on
  // the web: 44 of content plus 12 above and below, so 68 before the hairline.
  const rowClass = 'min-h-[68px] flex-row items-center gap-space-3 py-space-3';
  const interactive = Boolean(onPress || href);

  let main: ReactNode;
  if (!interactive) {
    main = (
      <View accessible accessibilityLabel={label} className={`flex-1 ${rowClass}`}>
        {body}
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
        accessibilityHint={accessibilityHint}
        className="relative flex-1"
        style={noBrowserOutline}
      >
        {/* Layout on an inner View: `<Link asChild>` on web replaces a Pressable's style. */}
        <View className={rowClass} style={pressed ? { backgroundColor: pressedGround } : undefined}>
          {body}
        </View>
        {focus.focusVisible ? <FocusRing shape="square" /> : null}
      </Pressable>
    );
    main = href ? (
      <Link href={href} asChild>
        {pressable}
      </Link>
    ) : (
      pressable
    );
  }

  return (
    <View
      role="listitem"
      testID={testID}
      className={['flex-row items-center gap-space-3', rule ? 'border-b border-line' : null]
        .filter(Boolean)
        .join(' ')}
    >
      {main}
      {action ? (
        <Button
          variant="ghost"
          onPress={onAction}
          {...(actionLabel ? { accessibilityLabel: actionLabel } : null)}
        >
          {action}
        </Button>
      ) : null}
    </View>
  );
}

export type ParticipantListProps = ViewProps;

/** Participant rows as children, read as a list (`role="list"`). No gaps: each row draws its own hairline. */
export function ParticipantList(props: ParticipantListProps) {
  return <View role="list" {...props} />;
}
