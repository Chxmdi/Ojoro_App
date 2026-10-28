import type { SituationId } from '@ojoro/design-tokens';
import { useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Situation, statusBarStyle } from '../Situation';

export type ScreenProps = {
  /** The screen's situation: sets the ground, the semantic colours inside and the status bar. */
  situation: SituationId;
  /** Scroll the content. Default false. */
  scroll?: boolean;
  /** Apply the `space-5` page gutter to the content. Default true. */
  gutter?: boolean;
  /** Classes for the content container (inside the scroll view when `scroll`). */
  contentClassName?: string;
  children?: ReactNode;
};

/**
 * A screen root: the situation's ground edge to edge, top safe-area padding,
 * the status bar style for that ground, and the `space-5` phone gutter.
 * Must render inside an Expo Router navigator: only the focused screen sets the
 * status bar, so a calm tab doesn't inherit a live tab's light content.
 */
export function Screen({
  situation,
  scroll = false,
  gutter = true,
  contentClassName,
  children,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const contentClasses = [gutter ? 'px-space-5' : null, contentClassName]
    .filter(Boolean)
    .join(' ');

  return (
    <Situation id={situation} className="flex-1" style={{ paddingTop: insets.top }}>
      {focused ? <StatusBar style={statusBarStyle(situation)} /> : null}
      {scroll ? (
        <ScrollView
          className="flex-1"
          contentContainerClassName={contentClasses}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View className={['flex-1', contentClasses].filter(Boolean).join(' ')}>{children}</View>
      )}
    </Situation>
  );
}
