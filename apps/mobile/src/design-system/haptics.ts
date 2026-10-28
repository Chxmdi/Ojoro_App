import * as Haptics from 'expo-haptics';

/**
 * Haptics only when meaning changes (design-system README, Haptics). Most
 * presses don't vibrate. Call these, never expo-haptics directly.
 */
export const haptics = {
  imDownAccepted: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  gameOn: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  challengeAccepted: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
  bothCheckedIn: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  resultVerified: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
} as const;

export type HapticMoment = keyof typeof haptics;
