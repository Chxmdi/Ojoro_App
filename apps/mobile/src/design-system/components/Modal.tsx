import { borderWidth, shadow, type SituationId } from '@ojoro/design-tokens';
import { useId, useRef } from 'react';
import { Modal as RNModal, Platform, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { motion } from '../motion';
import { Situation, useSituation } from '../Situation';
import { Button } from './Button';
import { moveFocus, Scrim, useOverlayPresence, useReturnFocus, type Timing } from './Overlay';
import { Text } from './Text';

export type ModalProps = {
  /** A display question ("LEAVE THIS PLAN?"). */
  title: string;
  /** The consequence, in counts ("7 of 8 are in. Leaving drops it to 6 of 8 and tells the host."). */
  body: string;
  /** The costly choice. Default CONFIRM. */
  confirm?: string | undefined;
  /** The safe choice; focused first. Default KEEP IT. */
  cancel?: string | undefined;
  onConfirm?: (() => void) | undefined;
  /** The cancel button, Android back and Escape on web all call this. The scrim does not. */
  onCancel?: (() => void) | undefined;
  /** Shown over the screen. Default false. Ignored when `inline`. */
  visible?: boolean | undefined;
  /** Draw the dialog in place, without scrim, motion or focus moves (stories, static anatomy). */
  inline?: boolean | undefined;
  /** The dialog's ground. Defaults to the situation it was opened from. */
  situation?: SituationId | undefined;
};

/** Fades in on the commit family; leaves the same way. Reduced motion: a 120ms fade (Overlay.tsx). */
const FADE: Timing = motion.commit;

/**
 * A centred confirmation for irreversible or socially costly choices only:
 * leaving a plan, cancelling a Challenge. Never for information (use a Toast).
 * Square, a `border-poster` rule on top; the safe choice is the secondary
 * button and takes focus first. One overlay at a time (Overlay.logic.ts).
 */
export function Modal(props: ModalProps) {
  if (props.inline) return <ModalPanel {...props} />;
  return <ModalOverlay {...props} />;
}

function ModalOverlay({ visible = false, situation, ...panel }: ModalProps) {
  const here = useSituation();
  const { shown, progress } = useOverlayPresence(visible, FADE, FADE);
  const cancelRef = useRef<View>(null);
  useReturnFocus(shown);
  const style = useAnimatedStyle(() => ({ opacity: progress.value }));

  if (!shown) return null;

  return (
    <RNModal
      transparent
      visible
      animationType="none"
      onRequestClose={panel.onCancel}
      onShow={() => moveFocus(cancelRef)}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.root} className="px-space-5">
        {/* An alert dialog asks for a choice: tapping outside doesn't make one. */}
        <Scrim progress={progress} />
        <Animated.View style={[styles.dialog, style]}>
          <ModalPanel {...panel} situation={situation ?? here} cancelRef={cancelRef} />
        </Animated.View>
      </View>
    </RNModal>
  );
}

function ModalPanel({
  title,
  body,
  confirm = 'CONFIRM',
  cancel = 'KEEP IT',
  onConfirm,
  onCancel,
  situation,
  cancelRef,
}: Omit<ModalProps, 'visible' | 'inline'> & { cancelRef?: React.RefObject<View | null> }) {
  const here = useSituation();
  const id = useId();
  const titleId = `${id}-title`;
  const bodyId = `${id}-body`;
  const web =
    Platform.OS === 'web'
      ? { 'aria-modal': true, 'aria-labelledby': titleId, 'aria-describedby': bodyId }
      : null;
  return (
    <Situation
      id={situation ?? here}
      role="alertdialog"
      accessibilityViewIsModal
      className="w-full gap-space-4 border-text p-space-6"
      style={[shadow['shadow-sheet'], styles.panel]}
      {...web}
    >
      <Text variant="display-sm" role="heading" nativeID={titleId}>
        {title}
      </Text>
      <Text variant="body" muted nativeID={bodyId}>
        {body}
      </Text>
      <View className="flex-row flex-wrap justify-end gap-space-3">
        {/* React 19 passes `ref` through Button's rest props to its Pressable; ButtonProps doesn't declare it yet. */}
        <Button variant="secondary" onPress={onCancel} {...({ ref: cancelRef } as object)}>
          {cancel}
        </Button>
        <Button variant="primary" onPress={onConfirm}>
          {confirm}
        </Button>
      </View>
    </Situation>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dialog: { width: '100%', maxWidth: 360 },
  // `border-poster` (6px) in `text` along the top only.
  panel: { maxWidth: 360, borderTopWidth: borderWidth['border-poster'] },
});
