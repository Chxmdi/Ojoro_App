import { Anton_400Regular } from '@expo-google-fonts/anton';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';

/**
 * The display face. Anton stands in for the licensed Druk Condensed; when the
 * licence is settled, swap the asset and this name here and nowhere else.
 */
export const DISPLAY_FAMILY = 'Anton_400Regular';

const uiFamilies = {
  400: 'Inter_400Regular',
  500: 'Inter_500Medium',
  600: 'Inter_600SemiBold',
  700: 'Inter_700Bold',
} as const;

export type UiWeight = keyof typeof uiFamilies;

/** React Native ignores fontWeight for custom fonts on Android, so each weight is its own family. */
export function uiFamily(weight: number): string {
  return uiFamilies[weight as UiWeight] ?? uiFamilies[400];
}

export function useOjoroFonts(): [loaded: boolean, error: Error | null] {
  return useFonts({
    [DISPLAY_FAMILY]: Anton_400Regular,
    [uiFamilies[400]]: Inter_400Regular,
    [uiFamilies[500]]: Inter_500Medium,
    [uiFamilies[600]]: Inter_600SemiBold,
    [uiFamilies[700]]: Inter_700Bold,
  });
}
