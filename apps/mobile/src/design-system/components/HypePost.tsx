import { borderWidth } from '@ojoro/design-tokens';
import { View } from 'react-native';

import { useSituation } from '../Situation';
import { useThemeColor } from '../useThemeColor';

import { Avatar } from './Avatar';
import { Badge } from './Badge';
import {
  hypePostLabel,
  postAvatarSize,
  postBadge,
  showsStats,
  systemNeedsRing,
  systemOverline,
  type HypePostKind,
  type HypeStat,
} from './HypePost.logic';
import { IconButton } from './IconButton';
import { Text } from './Text';

export {
  HYPE_POST_KINDS,
  POST_KIND,
  hypePostLabel,
  systemNeedsRing,
  type HypePostKind,
  type HypeStat,
} from './HypePost.logic';

export type HypePostProps = {
  /** `system` (inverse strip, display type: OJORO updates) · `competitor` · `supporter` · `evidence` (training stats). Default `supporter`. */
  kind?: HypePostKind | undefined;
  /** Who posted. Not shown on `system`. */
  author?: string | undefined;
  /** The post. On `system` it's a display headline ("HALF TIME. 2–2."). */
  body: string;
  /** As written: "3h", "8:01", "SUN". */
  time?: string | undefined;
  /** Whose side: added to the badge ("COMPETITOR · CHIMDI"). */
  side?: string | undefined;
  /** Evidence only: training stats ("5.2 KM" distance). */
  stats?: readonly HypeStat[] | undefined;
  /** The author's photo. */
  src?: string | undefined;
  /**
   * Opens the post's overflow (report, block). People's posts only; Ojoro's
   * updates have none. Not in `index.d.ts`: report must be reachable from a Challenge.
   */
  onMore?: (() => void) | undefined;
  testID?: string | undefined;
};

/** `.oj-post-competitor .oj-body { font-size: 18px; line-height: 26px }`. */
const competitorBody = { fontSize: 18, lineHeight: 26 } as const;

/**
 * A post in a Challenge Event or live game feed (HypePost.md, web `function
 * HypePost`). The kind is named in words, never by colour alone: Ojoro's
 * updates are an `inverse` strip with a display headline (with the
 * `mark-ring` on confirmed, where black meets oxblood); people's posts are
 * an avatar, name, a badge naming the kind, time and body on a `line` rule.
 */
export function HypePost({
  kind = 'supporter',
  author,
  body,
  time,
  side,
  stats,
  src,
  onMore,
  testID,
}: HypePostProps) {
  const label = hypePostLabel({ kind, author, body, time, side, stats });
  const situation = useSituation();
  const ring = useThemeColor('mark-ring');

  if (kind === 'system') {
    return (
      <View
        testID={testID}
        role="article"
        accessible
        aria-label={label}
        className="gap-space-2 bg-inverse p-space-4"
        style={
          systemNeedsRing(situation)
            ? { boxShadow: `0 0 0 ${borderWidth['border-strong']}px ${ring}` }
            : undefined
        }
      >
        <Text variant="overline" tone="on-inverse">
          {systemOverline(time)}
        </Text>
        <Text variant="display-sm" tone="on-inverse">
          {body}
        </Text>
      </View>
    );
  }

  return (
    <View
      testID={testID}
      role="article"
      className="flex-row gap-space-3 border-b border-line py-space-4"
    >
      <View accessible aria-label={label} className="min-w-0 flex-1 flex-row gap-space-3">
        <Avatar
          {...(author ? { name: author } : null)}
          {...(src ? { src } : null)}
          size={postAvatarSize(kind)}
        />
        <View className="min-w-0 flex-1 gap-space-2">
          <View className="flex-row flex-wrap items-center gap-space-2">
            {author ? <Text variant="title-sm">{author}</Text> : null}
            <Badge tone={kind === 'competitor' ? 'signal' : 'neutral'}>
              {postBadge(kind, side)}
            </Badge>
            {time ? (
              <Text variant="caption" muted>
                {time}
              </Text>
            ) : null}
          </View>
          <Text variant="body" style={kind === 'competitor' ? competitorBody : undefined}>
            {body}
          </Text>
          {showsStats(kind, stats) ? (
            <View className="flex-row flex-wrap gap-space-6 bg-surface-raised px-space-4 py-space-3">
              {(stats ?? []).map((s) => (
                <View key={`${s.label}-${s.value}`}>
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
        </View>
      </View>
      {onMore ? (
        <IconButton
          icon="more"
          label={author ? `More for ${author}'s post` : 'More for this post'}
          onPress={onMore}
          className="-mr-space-3 -mt-space-3"
        />
      ) : null}
    </View>
  );
}
