import { shadow, spacing, type SituationId } from '@ojoro/design-tokens';
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  Modal as RNModal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { motion } from '../motion';
import { Situation, useSituation } from '../Situation';
import {
  CloseButton,
  moveFocus, programmaticFocus, Scrim, useOverlayPresence, useReturnFocus, type Timing } from './Overlay';
import { Text } from './Text';

export type SheetProps = {
  /** The task, in sentence case ("Pull someone in"). Also the dialog's accessible name. */
  title: string;
  children?: ReactNode | undefined;
  /** Bottom actions, full width (Buttons with `block`). */
  actions?: ReactNode | undefined;
  /** Close button, scrim tap, swipe down, Android back and Escape on web all call this. */
  onClose?: (() => void) | undefined;
  /** Shown over the screen. Default false. Ignored when `inline`. */
  visible?: boolean | undefined;
  /** Draw the panel in place, without scrim, motion or safe area (stories, static anatomy). */
  inline?: boolean | undefined;
  /** The sheet's ground. Defaults to the situation it was opened from. */
  situation?: SituationId | undefined;
};

/** Slides up with `dur-gather` / `ease-breakthrough` (Sheet.md). */
const ENTER: Timing = { duration: motion.gather.duration, easing: motion.breakthrough.easing };
/** Leaves faster than it arrives: `dur-commit` / `ease-commit`. */
const EXIT: Timing = motion.commit;

/** A drag past this many points, or a flick, dismisses. */
const DISMISS_DISTANCE = 80;
const DISMISS_VELOCITY = 0.5;
/** The sheet never covers more than this share of the window height. */
const MAX_HEIGHT = 0.9;

/**
 * A bottom sheet for focused tasks inside a screen: invite, filter, pick a
 * time. Top corners `radius-sheet`, `shadow-sheet`, a grabber, over the
 * `opacity-scrim` scrim. One overlay at a time: if another Sheet or Modal is
 * open, this one waits until it closes (see Overlay.logic.ts).
 */
export function Sheet(props: SheetProps) {
  if (props.inline) return <SheetPanel {...props} />;
  return <SheetOverlay {...props} />;
}

function SheetOverlay({ visible = false, onClose, situation, ...panel }: SheetProps) {
  const here = useSituation();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [height, setHeight] = useState(0);
  const { shown, progress, reduced } = useOverlayPresence(visible, ENTER, EXIT, height > 0);
  const drag = useSharedValue(0);
  const titleRef = useRef<View>(null);
  useReturnFocus(shown);

  useEffect(() => {
    if (visible) drag.value = 0;
  }, [visible, drag]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_, g) => {
          drag.value = Math.max(0, g.dy);
        },
        onPanResponderRelease: (_, g) => {
          if (g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY) onClose?.();
          else drag.value = withTiming(0, EXIT);
        },
        onPanResponderTerminate: () => {
          drag.value = withTiming(0, EXIT);
        },
      }),
    [drag, onClose],
  );

  const panelStyle = useAnimatedStyle(() =>
    reduced
      ? { opacity: progress.value, transform: [{ translateY: drag.value }] }
      : { transform: [{ translateY: (1 - progress.value) * (height || window.height) + drag.value }] },
  );

  if (!shown) return null;

  return (
    <RNModal
      transparent
      visible
      animationType="none"
      onRequestClose={onClose}
      onShow={() => moveFocus(titleRef)}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.root}>
        <Scrim progress={progress} onPress={onClose} />
        <Animated.View
          style={[{ maxHeight: (window.height - insets.top) * MAX_HEIGHT }, panelStyle]}
          onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
        >
          <SheetPanel
            {...panel}
            onClose={onClose}
            situation={situation ?? here}
            bottomInset={insets.bottom}
            titleRef={titleRef}
            dragHandlers={panResponder.panHandlers}
            scroll
          />
        </Animated.View>
      </View>
    </RNModal>
  );
}

type PanelProps = Omit<SheetProps, 'visible' | 'inline'> & {
  bottomInset?: number;
  titleRef?: RefObject<View | null>;
  dragHandlers?: object;
  /** Let the body scroll when the sheet hits its max height. */
  scroll?: boolean;
};

function SheetPanel({
  title,
  children,
  actions,
  onClose,
  situation,
  bottomInset = 0,
  titleRef,
  dragHandlers,
  scroll = false,
}: PanelProps) {
  const here = useSituation();
  const web = Platform.OS === 'web' ? { 'aria-modal': true, 'aria-label': title } : null;
  return (
    <Situation
      id={situation ?? here}
      role="dialog"
      accessibilityViewIsModal
      className="rounded-t-sheet px-space-5 pt-space-2 gap-space-4"
      style={[
        shadow['shadow-sheet'],
        styles.panel,
        { paddingBottom: spacing['space-6'] + bottomInset },
      ]}
      {...web}
    >
      <View className="gap-space-4" {...dragHandlers}>
        <View
          className="self-center rounded-pill bg-line-strong"
          style={styles.grabber}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <View className="flex-row items-center justify-between">
          <View
            ref={titleRef}
            accessible
            role="heading"
            accessibilityLabel={title}
            className="flex-1"
            {...programmaticFocus}
          >
            <Text variant="title">{title}</Text>
          </View>
          <CloseButton onPress={onClose} />
        </View>
      </View>
      {scroll ? (
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} bounces={false}>
          {children}
        </ScrollView>
      ) : (
        <View>{children}</View>
      )}
      {actions ? <View className="gap-space-2">{actions}</View> : null}
    </Situation>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  // flexShrink lets the body scroll inside the max height.
  panel: { flexShrink: 1 },
  grabber: { width: 40, height: 4 },
  body: { flexGrow: 0, flexShrink: 1 },
  bodyContent: { flexGrow: 0 },
});
