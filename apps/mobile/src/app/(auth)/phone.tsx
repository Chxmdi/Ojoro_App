import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, DisplayText, IconButton, Input, Screen, Text } from '@/design-system';
import { authErrorMessage, normalizePhone } from '@/features/auth/phone';
import { useIsOnline } from '@/features/profile/states';
import { track } from '@/lib/analytics';
import { supabase } from '@/lib/supabase';

/**
 * Phone number entry. Not designed (HANDOFF.md, "What isn't designed yet"): the onboarding header
 * pattern, one Input, one primary button. Country handling is kept simple (features/auth/phone.ts).
 */
export default function PhoneEntry() {
  const online = useIsOnline();
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [sending, setSending] = useState(false);

  const send = async () => {
    const phone = normalizePhone(raw);
    if (!phone.ok) {
      setError(phone.error);
      return;
    }
    setError(undefined);
    setSending(true);
    const { error: failed } = await supabase.auth.signInWithOtp({ phone: phone.e164 });
    setSending(false);
    if (failed) {
      track('sign_in_failed', { method: 'phone', step: 'send', code: failed.code ?? 'unknown' });
      setError(authErrorMessage(failed, 'send'));
      return;
    }
    track('sign_in_code_sent', { method: 'phone' });
    router.push({ pathname: '/code', params: { phone: phone.e164, sentAt: String(Date.now()) } });
  };

  return (
    <Screen situation="calm" scroll gutter={false}>
      <View className="flex-row items-center pl-space-2 pt-space-2">
        <IconButton
          icon="back"
          label="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/welcome'))}
        />
      </View>
      <View className="gap-space-6 px-space-5 pb-space-8 pt-space-6">
        <View className="gap-space-3">
          <DisplayText size="lg" accessibilityRole="header">
            {"WHAT'S YOUR NUMBER?"}
          </DisplayText>
          <Text variant="body">
            We text you a 6-digit code. Your number never shows on your profile.
          </Text>
        </View>
        <Input
          label="Phone number"
          value={raw}
          onChangeText={(next) => {
            setRaw(next);
            if (error) setError(undefined);
          }}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          returnKeyType="send"
          onSubmitEditing={() => void send()}
          placeholder="+1 514 555 0123"
          hint="Canada and the US work without +1. Elsewhere, start with + and the country code."
          error={error}
          testID="phone-input"
        />
        {!online ? (
          <Text variant="body-sm" muted testID="phone-offline">
            {"You're offline. Sending a code needs a connection."}
          </Text>
        ) : null}
        <Button
          block
          onPress={() => void send()}
          loading={sending}
          disabled={!online}
          testID="phone-send"
        >
          SEND CODE
        </Button>
      </View>
    </Screen>
  );
}
