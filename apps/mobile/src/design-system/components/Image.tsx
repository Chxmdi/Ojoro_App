import { opacity } from '@ojoro/design-tokens';
import { Image as ExpoImage } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { REDUCED_MOTION_FADE } from '../motion';
import { Situation } from '../Situation';
import { useThemeColor } from '../useThemeColor';
import { Graphic } from './Graphic';
import {
  aspectRatioOf,
  captionLine,
  imagePresentation,
  type ImageRatio,
  type ImageStatus,
} from './Image.logic';
import { Text } from './Text';

export { IMAGE_RATIOS, type ImageRatio } from './Image.logic';

export type ImageProps = {
  /** Photo URI (remote, `file://` or `data:`). Missing → the sunk ground with the O and the alt. */
  src?: string | undefined;
  /** Required. Describe what happened, not "photo". It's the accessibility label, and the words shown when the photo can't load. */
  alt: string;
  /** `4:5` feed default · `1:1` · `16:9` · `3:4` · `4:3` (Place hero). */
  ratio?: ImageRatio;
  caption?: string | undefined;
  /** Who shot it. Shown after the caption: "caption · credit". */
  credit?: string | undefined;
  /** Display type over the photo, on an `opacity-scrim` black scrim, in the `live` situation so type is white. */
  children?: ReactNode;
};

/**
 * Documentary photography in a fixed ratio, ported from `OjImage`
 * (`.oj-image*`). Square corners. While loading, the frame is the
 * `surface-sunk` ground; a missing or failed photo shows the O and the alt in
 * words, never a broken-image icon.
 */
export function Image({ src, alt, ratio = '4:5', caption, credit, children }: ImageProps) {
  // Status is keyed to the src it was reported for, so a new src starts loading again.
  const [state, setState] = useState<{ src?: string | undefined; status: ImageStatus }>({
    status: 'loading',
  });
  const status = state.src === src ? state.status : 'loading';
  const hasOverlay = children != null && children !== false;
  const view = imagePresentation(src, status, hasOverlay);
  const muted = useThemeColor('text-muted');
  const line = captionLine(caption, credit);

  return (
    <View className="gap-space-2">
      <View
        className="relative w-full overflow-hidden rounded-none bg-surface-sunk"
        style={{ aspectRatio: aspectRatioOf(ratio) }}
      >
        {src && view.photo ? (
          <ExpoImage
            source={{ uri: src }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={REDUCED_MOTION_FADE}
            accessible
            accessibilityRole="image"
            accessibilityLabel={alt}
            alt={alt}
            onLoad={() => setState({ src, status: 'loaded' })}
            onError={() => setState({ src, status: 'error' })}
          />
        ) : null}
        {view.placeholder ? (
          <View
            className={[
              'absolute inset-0 items-center gap-space-2 p-space-4',
              hasOverlay ? 'justify-start pt-space-8' : 'justify-center',
            ].join(' ')}
            accessible
            accessibilityRole="image"
            accessibilityLabel={alt}
          >
            <Graphic kind="o" size={40} color={muted} />
            {view.altInWords ? (
              <Text variant="caption" muted className="text-center">
                {alt}
              </Text>
            ) : null}
          </View>
        ) : null}
        {hasOverlay ? (
          <Situation id="live" ground={false} className="absolute inset-0">
            <View
              className="absolute inset-0 bg-surface"
              style={{ opacity: opacity['opacity-scrim'] }}
            />
            <View className="flex-1 justify-end gap-space-2 p-space-5">{children}</View>
          </Situation>
        ) : null}
      </View>
      {line ? (
        <Text variant="caption" muted>
          {line}
        </Text>
      ) : null}
    </View>
  );
}
