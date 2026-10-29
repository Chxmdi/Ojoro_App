import { size as sizes } from '@ojoro/design-tokens';
import { Link, type Href } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useThemeColor } from '../useThemeColor';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Divider } from './Divider';
import { Graphic, type GraphicKind } from './Graphic';
import { Icon, type IconName } from './Icon';
import {
  groupLabel,
  groupSpoken,
  notificationLabel,
  type NotificationTone,
} from './NotificationRow.logic';
import { FocusRing, noBrowserOutline, useFocusVisible } from './pressFeedback';
import { Text } from './Text';

export {
  NOTIFICATION_TONES,
  groupLabel,
  notificationLabel,
  type NotificationTone,
} from './NotificationRow.logic';

export type NotificationRowProps = {
  /** One line that says what happened, actor first: "Marcus called you out.". */
  title: string;
  /** The detail, muted: "5K · Mount Royal loop · Sat 9:00". Areas, never addresses. */
  body?: string | undefined;
  /** As written: "4 min ago", "2:20 PM", "Yesterday", "Reminder set". */
  time?: string | undefined;
  /** A line icon in the disc (people, chat, bell, clock, check). */
  icon?: IconName | undefined;
  /** A brand graphic in the disc instead (the Mark for a call-out, the O for a recap). */
  graphic?: GraphicKind | undefined;
  /** A person instead of a disc: their `md` avatar ("Lena joined Thursday FC"). */
  person?: { name: string; src?: string | undefined } | undefined;
  /** The disc's ground: `quiet` (default), `strong` (needs you), `signal` (GAME ON). */
  tone?: NotificationTone | undefined;
  /** Not seen yet: NEW in words before the time, and "Unread." first when read aloud. */
  unread?: boolean | undefined;
  /** One inline action in caps: I'M DOWN, REPLY, VOTE. */
  action?: string | undefined;
  /** `primary` for the one commitment (I'M DOWN), `secondary` otherwise. Default `secondary`. */
  actionVariant?: 'primary' | 'secondary' | undefined;
  onAction?: (() => void) | undefined;
  /** The action deep-links instead (Expo Router). */
  actionHref?: Href | undefined;
  /** The row opens its canonical object. The action stays its own button. */
  href?: Href | undefined;
  onPress?: (() => void) | undefined;
  testID?: string | undefined;
};

const DISC = sizes['size-avatar-md'];

/**
 * One update (Notifications): a 40pt disc (icon, graphic or avatar), the
 * title in `title-sm`, the detail in muted `body-sm`, the time in a muted
 * caption, and at most one inline action at the end. Rows sit on `line`
 * hairlines. Unread is a word (NEW), not a colour or a dot.
 */
export function NotificationRow({
  title,
  body,
  time,
  icon,
  graphic,
  person,
  tone = 'quiet',
  unread = false,
  action,
  actionVariant = 'secondary',
  onAction,
  actionHref,
  href,
  onPress,
  testID,
}: NotificationRowProps) {
  const label = notificationLabel({ title, body, time, unread });
  const content = (
    <>
      <Leading icon={icon} graphic={graphic} person={person} tone={tone} />
      <View className="min-w-0 flex-1 gap-[2px]">
        <Text variant="title-sm">{title}</Text>
        {body ? (
          <Text variant="body-sm" muted>
            {body}
          </Text>
        ) : null}
        {time || unread ? (
          <View className="flex-row flex-wrap items-center gap-space-2">
            {unread ? <Text variant="label-sm">NEW</Text> : null}
            {time ? (
              <Text variant="caption" muted>
                {time}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </>
  );

  return (
    <View
      testID={testID}
      className="flex-row items-start gap-space-3 border-b border-line py-space-4"
    >
      {href || onPress ? (
        <RowLink href={href} onPress={onPress} label={label}>
          {content}
        </RowLink>
      ) : (
        <View
          accessible
          aria-label={label}
          className="min-w-0 flex-1 flex-row items-start gap-space-3"
        >
          {content}
        </View>
      )}
      {action ? (
        <Button
          variant={actionVariant}
          compact
          onPress={onAction}
          {...(actionHref ? { href: actionHref } : null)}
          accessibilityLabel={`${action.charAt(0)}${action.slice(1).toLowerCase()}: ${title}`}
        >
          {action}
        </Button>
      ) : null}
    </View>
  );
}

function Leading({
  icon,
  graphic,
  person,
  tone,
}: {
  icon: IconName | undefined;
  graphic: GraphicKind | undefined;
  person: { name: string; src?: string | undefined } | undefined;
  tone: NotificationTone;
}) {
  const ink = useThemeColor(tone === 'signal' ? 'on-signal' : 'text');
  if (person) {
    return <Avatar name={person.name} {...(person.src ? { src: person.src } : null)} size="md" />;
  }
  const ground =
    tone === 'signal'
      ? 'bg-signal border-signal'
      : tone === 'strong'
        ? 'border-text'
        : 'border-line-strong';
  return (
    <View
      className={`items-center justify-center rounded-disc border-2 ${ground}`}
      style={{ width: DISC, height: DISC }}
    >
      {graphic ? (
        <Graphic kind={graphic} size={20} color={ink} />
      ) : icon ? (
        <Icon name={icon} size={20} color={ink} />
      ) : null}
    </View>
  );
}

/** The pressable part of the row: one link to the object, pressed shows `surface-raised`. */
function RowLink({
  href,
  onPress,
  label,
  children,
}: {
  href: Href | undefined;
  onPress: (() => void) | undefined;
  label: string;
  children: ReactNode;
}) {
  const focus = useFocusVisible({});
  const [pressed, setPressed] = useState(false);
  const pressable = (
    <Pressable
      role={href ? 'link' : 'button'}
      aria-label={label}
      onPress={onPress}
      onPressIn={(e) => {
        setPressed(true);
        focus.onPressIn(e);
      }}
      onPressOut={() => setPressed(false)}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      style={noBrowserOutline}
      className="relative min-w-0 flex-1"
    >
      <View
        className={`min-h-touch flex-row items-start gap-space-3 ${pressed ? 'bg-surface-raised' : ''}`}
      >
        {children}
      </View>
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

export type NotificationGroupProps = {
  /** NEEDS YOU, TODAY, EARLIER. */
  title: string;
  /** Shown after the title: "NEEDS YOU · 3". */
  count?: number | undefined;
  /** A 2px `line-strong` rule (Needs you) instead of the hairline. */
  strong?: boolean | undefined;
  children?: ReactNode;
  testID?: string | undefined;
};

/** A labelled group of updates: the divider with its overline, then the rows. */
export function NotificationGroup({
  title,
  count,
  strong = false,
  children,
  testID,
}: NotificationGroupProps) {
  return (
    <View testID={testID} role="region" aria-label={groupSpoken(title, count)}>
      <Divider kind={strong ? 'strong' : 'hair'} label={groupLabel(title, count)} />
      {children}
    </View>
  );
}
