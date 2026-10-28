import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, DisplayText, Screen, Text } from '@/design-system';
import { authErrorMessage } from '@/features/auth/phone';
import { parseAuthProviders, phoneButtonVariant } from '@/features/auth/providers';
import { InlineError } from '@/features/profile/states';
import { track } from '@/lib/analytics';
import { supabase } from '@/lib/supabase';

// Literal reads: Expo inlines EXPO_PUBLIC_* only by full name.
const providers = parseAuthProviders({
  apple: process.env.EXPO_PUBLIC_AUTH_APPLE,
  google: process.env.EXPO_PUBLIC_AUTH_GOOGLE,
});

/** Welcome (Welcome.png): the confirmed situation, I WANT TO DO SOMETHING. → WE'RE DOING IT AT 7. */
export default function Welcome() {
  const insets = useSafeAreaInsets();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    track('screen_viewed', { screen: 'welcome' });
  }, []);

  const social = async (provider: 'apple' | 'google') => {
    track('sign_in_started', { method: provider });
    setError(null);
    if (Platform.OS !== 'web') {
      // Native social sign-in needs expo-apple-authentication / a browser session (not installed).
      setError(`Sign in with ${provider === 'apple' ? 'Apple' : 'Google'} isn't ready in this build. Use a phone number.`);
      return;
    }
    const { error: failed } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
    if (failed) {
      track('sign_in_failed', { method: provider, code: failed.code ?? 'unknown' });
      setError(authErrorMessage(failed, 'send'));
    }
  };

  return (
    <Screen situation="confirmed" contentClassName="justify-between pt-space-6">
      <DisplayText size="xs" accessibilityRole="header" style={{ letterSpacing: 0.06 * 24 }}>
        OJORO
      </DisplayText>

      <View className="gap-space-5" aria-label="Ojoro">
        <Text
          variant="label"
          muted
          style={{ textDecorationLine: 'line-through', textDecorationStyle: 'solid' }}
        >
          I WANT TO DO SOMETHING.
        </Text>
        <DisplayText size="xl" accessibilityRole="header">
          {"WE'RE DOING IT AT 7."}
        </DisplayText>
        <Text variant="body" style={{ maxWidth: 320 }}>
          Ojoro finds the people, the time and the place, then gets you out the door.
        </Text>
      </View>

      <View className="gap-space-2" style={{ paddingBottom: Math.max(36, insets.bottom + 16) }}>
        {error ? <InlineError message={error} /> : null}
        {providers.apple ? (
          <Button block onPress={() => void social('apple')}>
            CONTINUE WITH APPLE
          </Button>
        ) : null}
        {providers.google ? (
          <Button variant="secondary" block onPress={() => void social('google')}>
            CONTINUE WITH GOOGLE
          </Button>
        ) : null}
        <Button
          variant={phoneButtonVariant(providers)}
          block
          testID="welcome-phone"
          onPress={() => {
            track('sign_in_started', { method: 'phone' });
            router.push('/phone');
          }}
        >
          USE A PHONE NUMBER
        </Button>
        <Text variant="caption" muted className="mt-space-2 text-center">
          By continuing you agree to the Terms and Privacy Policy. Ojoro never shows your exact
          location to anyone by default.
        </Text>
      </View>
    </Screen>
  );
}
