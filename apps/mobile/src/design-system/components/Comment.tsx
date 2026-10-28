import { Platform, Pressable, View, type TextStyle } from 'react-native';

import { Avatar } from './Avatar';
import { Badge } from './Badge';
import {
  commentLabel,
  repliesWord,
  REPLY_INDENT,
  respectLabel,
  respectWord,
} from './Comment.logic';
import { FocusRing, noBrowserOutline, useFocusVisible } from './pressFeedback';
import { Text } from './Text';

export type CommentProps = {
  author: string;
  body: string;
  /** As written: "12m", "now". */
  time?: string | undefined;
  /** COMPETITOR, HOST. */
  badge?: string | undefined;
  /** RESPECT count. RESPECT is the only like. */
  respect?: number | undefined;
  /** You gave respect: RESPECTED, underlined. */
  respected?: boolean | undefined;
  /** Replies under this comment: "3 REPLIES". */
  replies?: number | undefined;
  /** This is a reply: indented one level, never deeper. */
  reply?: boolean | undefined;
  onReply?: (() => void) | undefined;
  onRespect?: (() => void) | undefined;
  /** Opens the replies. */
  onReplies?: (() => void) | undefined;
  /** The author's photo. */
  src?: string | undefined;
  testID?: string | undefined;
};

/**
 * A comment in a thread (`.oj-comment`): small avatar, name, badge, time,
 * body, and text actions in `label-sm` (REPLY, RESPECT · n, n REPLIES).
 * Actions have 44pt hit areas reaching beyond their visible words.
 */
export function Comment({
  author,
  body,
  time,
  badge,
  respect,
  respected,
  replies,
  reply,
  onReply,
  onRespect,
  onReplies,
  src,
  testID,
}: CommentProps) {
  const repliesText = repliesWord(replies);
  return (
    <View
      testID={testID}
      className="flex-row gap-space-3 py-space-3"
      style={reply ? { paddingLeft: REPLY_INDENT } : undefined}
    >
      <Avatar name={author} {...(src ? { src } : null)} size="sm" />
      <View className="min-w-0 flex-1 gap-space-1">
        {/* The header and body read as one item; the actions stay separate buttons. */}
        <View
          accessible
          accessibilityLabel={commentLabel(author, badge, time, body)}
          className="gap-space-1"
        >
          <View className="flex-row flex-wrap items-center gap-space-2">
            <Text variant="title-sm">{author}</Text>
            {badge ? <Badge>{badge}</Badge> : null}
            {time ? (
              <Text variant="caption" muted>
                {time}
              </Text>
            ) : null}
          </View>
          <Text variant="body-sm">{body}</Text>
        </View>
        <View className="flex-row gap-space-2">
          <CommentAction
            label="REPLY"
            accessibilityLabel={`Reply to ${author}`}
            onPress={onReply}
          />
          <CommentAction
            label={respectWord(respect, respected)}
            accessibilityLabel={respectLabel(respect, respected)}
            on={Boolean(respected)}
            onPress={onRespect}
          />
          {repliesText ? <CommentAction label={repliesText} onPress={onReplies} /> : null}
        </View>
      </View>
    </View>
  );
}

/** `.oj-textbtn::after { inset: -6px -4px }`: 32pt visible, 44pt to touch. */
const HIT_SLOP = { top: 6, bottom: 6, left: 4, right: 4 } as const;

const onStyle = {
  textDecorationLine: 'underline',
  ...(Platform.OS === 'web' ? { textUnderlineOffset: 3 } : null),
} as TextStyle;

/**
 * The comment's text action: `oj-textbtn` in `label-sm` (TextButton uses
 * `label`). `on` is the toggled state of RESPECT: `text` and underlined.
 */
function CommentAction({
  label,
  accessibilityLabel,
  on,
  onPress,
}: {
  label: string;
  accessibilityLabel?: string;
  on?: boolean;
  onPress?: (() => void) | undefined;
}) {
  const focus = useFocusVisible({});
  const toggle =
    on === undefined
      ? null
      : Platform.OS === 'web'
        ? { 'aria-pressed': on }
        : { 'aria-selected': on };
  return (
    <Pressable
      role="button"
      aria-label={accessibilityLabel}
      {...toggle}
      hitSlop={HIT_SLOP}
      onPress={onPress}
      onPressIn={focus.onPressIn}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      style={noBrowserOutline}
      className="self-start"
    >
      <View className="min-h-[32px] justify-center px-space-1">
        <Text variant="label-sm" muted={!on} style={on ? onStyle : undefined}>
          {label}
        </Text>
      </View>
      {focus.focusVisible ? <FocusRing shape="square" /> : null}
    </Pressable>
  );
}
