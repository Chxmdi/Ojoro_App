import { size as sizes } from '@ojoro/design-tokens';
import { Platform, Pressable, View, type AccessibilityActionEvent } from 'react-native';

import { uiFamily } from '../fonts';
import { useThemeColor } from '../useThemeColor';
import { Avatar } from './Avatar';
import {
  chatMessageLabel,
  deletedText,
  GROUPED_GAP,
  CHAT_GAP,
  OWN_MAX_WIDTH,
  replySnippet,
  statusText,
  type ChatMessageStatus,
  type ChatReply,
} from './ChatMessage.logic';
import { Icon } from './Icon';
import { Text } from './Text';
import { TextButton } from './TextButton';

export {
  CHAT_GAP,
  CHAT_MESSAGE_STATUSES,
  GROUP_WINDOW_MS,
  GROUPED_GAP,
  chatMessageLabel,
  isGrouped,
  type ChatMessageStatus,
  type ChatReply,
} from './ChatMessage.logic';

export type ChatMessageProps = {
  /** The sender's short name, as shown ("Lena"). Yours shows as "You". */
  author: string;
  /** Their full name, for the avatar's initials and its label ("Lena R" → LR). Defaults to `author`. */
  fullName?: string | undefined;
  body: string;
  /** Your message: right-aligned on `surface-raised`, "You" over it, no avatar. */
  own?: boolean | undefined;
  /**
   * Continues the message before it (same person, a few minutes apart; see
   * `isGrouped`): no avatar or name, and it sits 8pt under the one before
   * instead of 20. The avatar column is kept so bodies line up.
   */
  grouped?: boolean | undefined;
  /** Spoken, not shown: the chat shows times in `ChatNotice` lines between messages. */
  time?: string | undefined;
  /** The sender's photo. */
  src?: string | undefined;
  /** The message this one answers, quoted above the body. */
  replyTo?: ChatReply | undefined;
  /** Deleted: the body is replaced by "Message deleted." and nothing else shows. */
  deleted?: boolean | undefined;
  /** Yours only: `sending` ("Sending…") or `failed` (alert icon, "Not sent.", TRY AGAIN, heavier rule). */
  status?: ChatMessageStatus | undefined;
  /** Failed: send it again. */
  onRetry?: (() => void) | undefined;
  /**
   * Long-press (or the screen reader's "More options" action) opens the
   * message's actions: reply, report and block for others', delete for yours.
   */
  onMore?: (() => void) | undefined;
  testID?: string | undefined;
};

/** CrewChat's row: avatar and text `gap: 10px`; name over body `gap: 2px`. */
const ROW_GAP = 10;
const AVATAR = sizes['size-avatar-sm'];

const MORE_ACTION = [{ name: 'more', label: 'More options' }] as const;

/**
 * A chat message (CrewChat). Others: a small avatar, the name in `title-sm`
 * and the body in `body`, straight on the page, no bubble. Yours: a square
 * `surface-raised` block on the right, "You" in a muted caption over the body.
 * Status is in words: "Sending…", or the alert icon, "Not sent." and TRY
 * AGAIN under a 2px `text` rule. Report and block are a long-press away.
 */
export function ChatMessage({
  author,
  fullName,
  body,
  own = false,
  grouped = false,
  time,
  src,
  replyTo,
  deleted = false,
  status,
  onRetry,
  onMore,
  testID,
}: ChatMessageProps) {
  const text = useThemeColor('text');
  const failed = own && !deleted && status === 'failed';
  const label = chatMessageLabel({ author, body, own, time, deleted, replyTo, status });
  // Only a message with actions is pressable; a plain one isn't announced as dimmed.
  const Box = onMore ? Pressable : View;
  const pullUp = grouped ? { marginTop: GROUPED_GAP - CHAT_GAP } : null;
  const more = onMore
    ? {
        onLongPress: onMore,
        accessibilityActions: MORE_ACTION,
        onAccessibilityAction: (e: AccessibilityActionEvent) => {
          if (e.nativeEvent.actionName === 'more') onMore();
        },
        ...(Platform.OS === 'web' ? null : { accessibilityHint: 'Long press for more options' }),
      }
    : null;

  const content = (
    <View className="gap-[2px]">
      {deleted ? (
        <Text variant="body" muted>
          {deletedText(own)}
        </Text>
      ) : (
        <>
          {replyTo ? <ReplyQuote reply={replyTo} /> : null}
          <Text variant="body">{body}</Text>
        </>
      )}
    </View>
  );

  if (own) {
    const words = deleted ? null : statusText(status);
    return (
      <View testID={testID} className="items-end gap-space-2" style={pullUp}>
        <Box
          accessible
          aria-label={label}
          {...more}
          className="gap-[2px] bg-surface-raised px-space-4 py-space-3"
          style={[
            // The web's max-width is content-box: 280 plus 16 + 16 padding.
            { maxWidth: OWN_MAX_WIDTH + 32 },
            failed ? { borderBottomWidth: 2, borderBottomColor: text } : null,
          ]}
        >
          {grouped ? null : (
            <Text variant="caption" muted>
              You
            </Text>
          )}
          {content}
        </Box>
        {words ? (
          <View
            className="flex-row items-center gap-space-2"
            // The status is already in the message's label.
            {...(Platform.OS === 'web'
              ? null
              : { importantForAccessibility: 'no-hide-descendants' as const })}
          >
            {failed ? <Icon name="alert" size={16} /> : null}
            <Text variant="caption" muted={!failed} aria-hidden>
              {words}
            </Text>
            {failed && onRetry ? (
              <TextButton onPress={onRetry} accessibilityLabel="Try sending again">
                TRY AGAIN
              </TextButton>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <Box
      testID={testID}
      accessible
      aria-label={label}
      {...more}
      className="flex-row items-start"
      style={[{ gap: ROW_GAP }, pullUp]}
    >
      {grouped ? (
        <View style={{ width: AVATAR }} />
      ) : (
        <Avatar name={fullName ?? author} {...(src ? { src } : null)} size="sm" />
      )}
      <View className="min-w-0 flex-1 gap-[2px]">
        {grouped ? null : <Text variant="title-sm">{author}</Text>}
        {content}
      </View>
    </Box>
  );
}

/** The quoted message: a 2px `line-strong` bar, the name, then one line of it, muted. */
function ReplyQuote({ reply }: { reply: ChatReply }) {
  return (
    <View className="mb-space-1 border-l-2 border-line-strong pl-space-2">
      <Text variant="caption" muted numberOfLines={1} style={{ fontFamily: uiFamily(600) }}>
        {reply.author}
      </Text>
      <Text variant="caption" muted numberOfLines={1}>
        {replySnippet(reply.body)}
      </Text>
    </View>
  );
}

export type ChatNoticeProps = {
  /** "TODAY · 2:14 PM", "2:20 PM · Lena tapped MAKE THIS A GAME". */
  children: string;
  testID?: string | undefined;
};

/** A centred muted caption between messages: the day and time, or something that happened. */
export function ChatNotice({ children, testID }: ChatNoticeProps) {
  return (
    <Text testID={testID} variant="caption" muted className="text-center">
      {children}
    </Text>
  );
}
