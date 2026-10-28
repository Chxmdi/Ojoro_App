import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Button, DisplayText, IconButton, Input, Screen, Text, TextButton } from '@/design-system';
import {
  authErrorMessage,
  cleanCode,
  formatPhone,
  isCompleteCode,
  normalizePhone,
  resendSecondsLeft,
} from '@/features/auth/phone';
import { useIsOnline } from '@/features/profile/states';
import { track } from '@/lib/analytics';
import { supabase } from '@/lib/supabase';

/**
 * Code verification. Not designed (HANDOFF.md): one Input, auto-verify at six digits, a resend
 * with a countdown, errors in words. After a good code the auth gate moves on (onboarding or Home,
 * or the deep link that was opened before signing in).
 */
export default function CodeEntry() {
  const params = useLocalSearchParams<{ phone?: string; sentAt?: string }>();
  const parsed = normalizePhone(params.phone ?? '');
  if (!parsed.ok) return <Redirect href="/phone" />;
  return <CodeForm phone={parsed.e164} sentAt={Number(params.sentAt) || Date.now()} />;
}

function CodeForm({ phone, sentAt: initialSentAt }: { phone: string; sentAt: number }) {
  const online = useIsOnline();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [verifying, setVerifying] = useState(false);
  const [sentAt, setSentAt] = useState(initialSentAt);
  const [now, setNow] = useState(() => Date.now());
  const [resent, setResent] = useState(false);
  const tried = useRef<string | null>(null);

  const waitS = resendSecondsLeft(sentAt, now);
  useEffect(() => {
    if (waitS === 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [waitS]);

  const verify = async (value: string) => {
    if (!isCompleteCode(value)) {
      setError('Enter all 6 digits.');
      return;
    }
    tried.current = value;
    setError(undefined);
    setVerifying(true);
    const { error: failed } = await supabase.auth.verifyOtp({ phone, token: value, type: 'sms' });
    setVerifying(false);
    if (failed) {
      track('sign_in_failed', { method: 'phone', step: 'verify', code: failed.code ?? 'unknown' });
      setError(authErrorMessage(failed, 'verify'));
      return;
    }
    track('sign_in_completed', { method: 'phone' });
    // The gate (RouteGuard) takes it from here.
  };

  const resend = async () => {
    setError(undefined);
    const { error: failed } = await supabase.auth.signInWithOtp({ phone });
    if (failed) {
      setError(authErrorMessage(failed, 'send'));
      return;
    }
    track('sign_in_code_sent', { method: 'phone', resend: true });
    setSentAt(Date.now());
    setNow(Date.now());
    setResent(true);
    setCode('');
    tried.current = null;
  };

  return (
    <Screen situation="calm" scroll gutter={false}>
      <View className="flex-row items-center pl-space-2 pt-space-2">
        <IconButton
          icon="back"
          label="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/phone'))}
        />
      </View>
      <View className="gap-space-6 px-space-5 pb-space-8 pt-space-6">
        <View className="gap-space-3">
          <DisplayText size="lg" accessibilityRole="header">
            ENTER THE CODE
          </DisplayText>
          <Text variant="body">{`We sent 6 digits to ${formatPhone(phone)}.`}</Text>
          <TextButton
            onPress={() => router.replace('/phone')}
            accessibilityLabel="Change the phone number"
            className="self-start"
          >
            CHANGE NUMBER
          </TextButton>
        </View>
        <Input
          label="6-digit code"
          value={code}
          onChangeText={(next) => {
            const clean = cleanCode(next);
            setCode(clean);
            if (error) setError(undefined);
            // Verify by itself at six digits, once per code.
            if (isCompleteCode(clean) && tried.current !== clean && online) void verify(clean);
          }}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={6}
          autoFocus
          error={error}
          hint={resent ? 'New code sent. Older codes stop working.' : undefined}
          testID="code-input"
        />
        {!online ? (
          <Text variant="body-sm" muted>
            {"You're offline. Checking the code needs a connection."}
          </Text>
        ) : null}
        <Button
          block
          onPress={() => void verify(code)}
          loading={verifying}
          disabled={!online}
          testID="code-verify"
        >
          SIGN IN
        </Button>
        <View className="items-center gap-space-1">
          <TextButton
            onPress={() => void resend()}
            disabled={waitS > 0 || !online}
            testID="code-resend"
          >
            SEND A NEW CODE
          </TextButton>
          {waitS > 0 ? (
            <Text variant="caption" muted style={{ fontVariant: ['tabular-nums'] }}>
              {`You can ask for a new code in ${waitS} s.`}
            </Text>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}
