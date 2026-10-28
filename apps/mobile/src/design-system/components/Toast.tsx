import { spacing, type SituationId } from '@ojoro/design-tokens';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { motion, REDUCED_MOTION_FADE } from '../motion';
import { Situation, useSituation } from '../Situation';
import { useThemeColor } from '../useThemeColor';
import { Icon } from './Icon';
import { useOverlayReducedMotion } from './Overlay';
import { FocusRing, noBrowserOutline, useFocusVisible } from './pressFeedback';
import { Text } from './Text';
import {
  initialToastState,
  TOAST_ICON,
  toastAnnouncement,
  toastDuration,
  toastLiveness,
  toastReducer,
  type ToastKind,
} from './Toast.logic';

export type { ToastKind };

export type ToastProps = {
  /** One sentence, counts not adjectives ("Offline. Showing the last count from 7:02."). */
  message: string;
  /** Told by icon and wording, never colour. Default `neutral`. */
  kind?: ToastKind | undefined;
  /** At most one action, in caps: UNDO, RETRY, WAITLIST, SEE SIMILAR. */
  action?: string | undefined;
  onAction?: (() => void) | undefined;
  /** Announce on iOS when shown (Android and web use the live region). Default true. */
  announce?: boolean | undefined;
};

/**
 * A short inverse strip confirming what just happened, with at most one action.
 * Usually shown through `useToast()`; render it directly only for a static,
 * in-place state (the offline strip at the foot of a plan).
 */
export function Toast({
  message,
  kind = 'neutral',
  action,
  onAction,
  announce = true,
}: ToastProps) {
  const onInverse = useThemeColor('on-inverse');
  const icon = TOAST_ICON[kind];
  const liveness = toastLiveness(kind);
  const spoken = toastAnnouncement(message, kind);

  useEffect(() => {
    if (!announce || Platform.OS !== 'ios') return;
    AccessibilityInfo.announceForAccessibilityWithOptions(spoken, { queue: liveness === 'polite' });
  }, [announce, spoken, liveness]);

  const live =
    Platform.OS === 'web'
      ? { role: kind === 'error' ? 'alert' : 'status', 'aria-live': liveness }
      : { accessibilityLiveRegion: liveness };

  return (
    <View
      {...(live as object)}
      className="min-h-touch flex-row items-center gap-space-3 bg-inverse px-space-4 py-space-3"
    >
      {icon ? (
        <Icon
          name={icon}
          size={20}
          color={onInverse}
          {...(kind === 'error' ? { label: 'Error' } : null)}
        />
      ) : null}
      <Text variant="body-sm" tone="on-inverse" className="flex-1">
        {message}
      </Text>
      {action ? <ToastAction label={action} onPress={onAction} /> : null}
    </View>
  );
}

/**
 * `.oj-toast-action`: label type in `on-inverse`, underlined, 44pt tall, a real
 * button. Not TextButton: that one is `text-muted` on the page ground and has
 * no tone for the inverse strip (the web reference also styles it separately).
 */
function ToastAction({ label, onPress }: { label: string; onPress?: (() => void) | undefined }) {
  const focus = useFocusVisible({});
  return (
    <Pressable
      role="button"
      onPress={onPress}
      onPressIn={focus.onPressIn}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      className="min-h-touch justify-center px-space-2"
      style={noBrowserOutline}
    >
      <Text variant="label" tone="on-inverse" style={styles.underline}>
        {label}
      </Text>
      {focus.focusVisible ? <FocusRing shape="square" /> : null}
    </Pressable>
  );
}

/* ---------- One toast at a time ---------- */

export type ToastOptions = Omit<ToastProps, 'announce'> & {
  /** The ground the toast belongs to. `useToast` fills in the caller's situation. */
  situation?: SituationId | undefined;
};

export type ToastApi = {
  /** Show a toast. It replaces the one on screen, if any. Returns its id. */
  show(toast: ToastOptions): number;
  /** Dismiss the toast with this id (no-op if it has already been replaced), or whatever is shown. */
  dismiss(id?: number): void;
};

const ToastContext = createContext<{
  show: (toast: ToastOptions) => number;
  dismiss: (id?: number) => void;
} | null>(null);

export type ToastProviderProps = {
  children?: ReactNode;
  /**
   * Distance from the bottom of the window to the toast. Toasts sit above the
   * tab bar: on tab screens pass the tab bar's height. Default: the bottom
   * safe area plus `space-4`.
   */
  bottomOffset?: number | undefined;
};

/**
 * Mount once near the root, inside SafeAreaProvider. Shows one toast at a
 * time: a new toast replaces the current one, nothing stacks or queues. Each
 * dismisses itself after `toastDuration` (4s, 8s with an action, doubled with
 * a screen reader on); its action dismisses it too.
 */
export function ToastProvider({ children, bottomOffset }: ToastProviderProps) {
  const [state, dispatch] = useReducer(toastReducer<ToastOptions>, undefined, initialToastState);
  const insets = useSafeAreaInsets();
  const screenReader = useScreenReader();
  const current = state.current;

  const lastId = useRef(0);
  const show = useCallback((toast: ToastOptions) => {
    const id = ++lastId.current;
    dispatch({ type: 'show', toast, id });
    return id;
  }, []);
  // Without an id, dismiss the latest toast: it's the only one that can be on screen.
  const dismiss = useCallback((id?: number) => {
    dispatch({ type: 'dismiss', id: id ?? lastId.current });
  }, []);

  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(
      () => dispatch({ type: 'dismiss', id: current.id }),
      toastDuration({ action: current.action, screenReader }),
    );
    return () => clearTimeout(timer);
  }, [current, screenReader]);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);
  const bottom = bottomOffset ?? insets.bottom + spacing['space-4'];

  return (
    <ToastContext value={api}>
      {children}
      <View pointerEvents="box-none" style={[styles.host, { bottom }]}>
        {current ? (
          <ToastSlot
            key={current.id}
            toast={current}
            onAction={() => {
              current.onAction?.();
              dispatch({ type: 'dismiss', id: current.id });
            }}
          />
        ) : null}
      </View>
    </ToastContext>
  );
}

function ToastSlot({ toast, onAction }: { toast: ToastOptions; onAction: () => void }) {
  const reduced = useOverlayReducedMotion();
  const entering = reduced
    ? FadeIn.duration(REDUCED_MOTION_FADE).reduceMotion(ReduceMotion.Never)
    : FadeInDown.duration(motion.commit.duration)
        .easing(motion.commit.easing)
        .reduceMotion(ReduceMotion.Never);
  const exiting = FadeOut.duration(
    reduced ? REDUCED_MOTION_FADE : motion.commit.duration,
  ).reduceMotion(ReduceMotion.Never);
  const strip = (
    <Toast message={toast.message} kind={toast.kind} action={toast.action} onAction={onAction} />
  );
  return (
    <Animated.View entering={entering} exiting={exiting}>
      {toast.situation ? (
        <Situation id={toast.situation} ground={false}>
          {strip}
        </Situation>
      ) : (
        strip
      )}
    </Animated.View>
  );
}

/**
 * `const toast = useToast(); toast.show({ kind: 'success', message: "You're in. 7 of 8." })`.
 * The toast takes the caller's situation, so it is white on a live (black) screen.
 */
export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  const situation = useSituation();
  if (!context) throw new Error('useToast must be used inside <ToastProvider>.');
  return useMemo(
    () => ({
      show: (toast) => context.show({ situation, ...toast }),
      dismiss: context.dismiss,
    }),
    [context, situation],
  );
}

function useScreenReader(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((on) => {
      if (alive) setEnabled(on);
    });
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setEnabled);
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);
  return enabled;
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: spacing['space-5'], right: spacing['space-5'] },
  // `.oj-toast-action`: underline 4px below the word on web.
  underline: {
    textDecorationLine: 'underline',
    ...(Platform.OS === 'web' ? ({ textUnderlineOffset: 4 } as object) : null),
  },
});
