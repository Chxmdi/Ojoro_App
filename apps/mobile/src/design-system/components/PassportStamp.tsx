import { View } from 'react-native';

import { Situation } from '../Situation';
import { useThemeColor } from '../useThemeColor';
import {
  STAMP_GAP,
  STAMP_INNER_RING,
  STAMP_RING,
  STAMP_SIZE,
  stampModel,
} from './PassportStamp.logic';
import { Text } from './Text';

export { stampModel, STAMP_SIZE } from './PassportStamp.logic';

export type PassportStampProps = {
  /** Set in display type: "21 GAMES". */
  title: string;
  /** An area: "Jeanne-Mance". */
  place: string;
  /** "06.10.26". */
  date: string;
  /** The small line on top. Default OJORO PASSPORT. */
  kind?: string | undefined;
  /** Slanted −6° like a real stamp (default). `false` sits it flat. */
  tilt?: boolean | undefined;
};

/** The O frame: a 3px outer ring and a 1px inner ring 5pt inside it (web's two inset shadows). */
function Rings() {
  const ink = useThemeColor('signal');
  const inset = STAMP_RING + STAMP_GAP;
  return (
    <>
      <View
        pointerEvents="none"
        className="absolute inset-0 rounded-disc"
        style={{ borderWidth: STAMP_RING, borderColor: ink }}
      />
      <View
        pointerEvents="none"
        className="absolute rounded-disc"
        style={{
          top: inset,
          left: inset,
          right: inset,
          bottom: inset,
          borderWidth: STAMP_INNER_RING,
          borderColor: ink,
        }}
      />
    </>
  );
}

/**
 * A permanent memory mark in the Passport (PassportStamp.md, web `function
 * PassportStamp`): a stamp, not a trophy. Drawn in `signal` ink as a
 * double-ring O, 168pt, tilted −6°. It sets the after situation on its own
 * root without painting a ground, so the ink is oxblood wherever the Passport
 * block puts it. No gems, coins, glow or trophies.
 *
 * One element for screen readers: "21 GAMES, Jeanne-Mance, 06.10.26".
 */
export function PassportStamp({ title, place, date, kind, tilt }: PassportStampProps) {
  const model = stampModel({ title, place, date, kind, tilt });
  return (
    <Situation
      id="after"
      ground={false}
      role="img"
      accessible
      accessibilityLabel={model.accessibilityLabel}
      className="self-start"
      style={model.rotate ? { transform: [{ rotate: model.rotate }] } : null}
    >
      <View
        className="items-center justify-center gap-space-1 p-space-5"
        style={{ width: STAMP_SIZE, height: STAMP_SIZE }}
      >
        <Rings />
        <Text variant="label-sm" tone="signal" className="text-center">
          {model.kind}
        </Text>
        <Text variant="display-xs" tone="signal" className="text-center">
          {title}
        </Text>
        <View className="h-[2px] w-[48px] bg-signal" />
        <Text variant="label-sm" tone="signal" className="text-center">
          {place}
        </Text>
        <Text variant="caption" tone="signal" className="text-center">
          {date}
        </Text>
      </View>
    </Situation>
  );
}
