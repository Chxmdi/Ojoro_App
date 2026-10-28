import { View } from 'react-native';

import { useThemeColor } from '../useThemeColor';
import { Avatar } from './Avatar';
import { CLUSTER_OVERLAP, clusterModel, personKeys, type Person } from './AvatarCluster.logic';
import { Text } from './Text';

export { clusterModel, CLUSTER_DEFAULT_MAX, type Person } from './AvatarCluster.logic';

export type AvatarClusterProps = {
  /** The people in, in order. A person with `isNew` gathers in. */
  people: Person[];
  /** Everyone in, when more than `people` (the rest show as +N). Default `people.length`. */
  total?: number | undefined;
  /** Avatars shown before +N. Default 5. */
  max?: number | undefined;
  /** Dashed open spots after the people. */
  open?: number | undefined;
  /** `sm` 28 (default) · `md` 40. */
  size?: 'sm' | 'md' | undefined;
};

const MORE_TYPE = { sm: 11, md: 14 } as const;

/** The +N disc (`.oj-avatar-more`): `inverse` ground, the same 2px surface ring as an avatar. */
function More({ extra, size }: { extra: number; size: 'sm' | 'md' }) {
  const surface = useThemeColor('surface');
  const px = MORE_TYPE[size];
  return (
    <View
      className={`${size === 'sm' ? 'size-avatar-sm' : 'size-avatar-md'} items-center justify-center rounded-disc bg-inverse`}
      style={{ boxShadow: `0 0 0 2px ${surface}` }}
    >
      <Text
        variant="label"
        tone="on-inverse"
        allowFontScaling={false}
        style={{ fontSize: px, lineHeight: px, letterSpacing: 0, fontVariant: ['tabular-nums'] }}
      >
        {`+${extra}`}
      </Text>
    </View>
  );
}

/**
 * People assembling (AvatarCluster.md, web `function AvatarCluster`):
 * overlapping avatars, a +N count, then dashed open spots. Each avatar after
 * the first overlaps the one before by 6pt and sits on top of it; the 2px
 * ground ring keeps them apart. A person with `isNew` flies in with Gather
 * (Avatar handles the motion and its reduced-motion fade).
 *
 * The cluster is one element for screen readers: "6 people in, 2 open".
 */
export function AvatarCluster({ people, total, max, open, size = 'sm' }: AvatarClusterProps) {
  const model = clusterModel({ people, total, max, open });
  const keys = personKeys(model.shown);
  const items = [
    ...model.shown.map((p, i) => (
      <Avatar key={`p:${keys[i]}`} name={p.name} {...(p.src ? { src: p.src } : null)} size={size} isNew={!!p.isNew} />
    )),
    ...(model.extra > 0 ? [<More key="more" extra={model.extra} size={size} />] : []),
    // The web's dashed O is content-box: 28 + a 1px border each side = a 30pt box. Pad it to match.
    ...Array.from({ length: model.open }, (_, j) => (
      <View key={`o:${j}`} style={{ padding: 1 }}>
        <Avatar empty size={size} />
      </View>
    )),
  ];
  return (
    <View
      role="group"
      accessible
      accessibilityLabel={model.label}
      className="shrink-0 flex-row items-center"
    >
      {items.map((item, i) => (
        <View key={item.key} style={i > 0 ? { marginLeft: -CLUSTER_OVERLAP } : null}>
          {item}
        </View>
      ))}
    </View>
  );
}
