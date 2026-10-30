/**
 * `/pay/return?checkout_id=…&result=success|cancel` (not designed; minimal): where Stripe's return
 * link lands. The link itself proves nothing: the screen reads `payment_checkout` and waits (realtime
 * plus polling) until the webhook says `completed`, `failed`, `expired` or `refunded`, and says each
 * state honestly while it waits. Calm; the headline changes, nothing else moves.
 */
import { isCheckoutPending, parsePaymentsReturn, type PaymentCheckoutState } from '@ojoro/contracts';
import { useQuery } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Button, DisplayText, Icon, Screen, Text } from '@/design-system';
import { track } from '@/lib/analytics';
import { useUserId } from '@/lib/auth';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

import { useNow } from '../activities/data';
import { InlineError, LoadingState, ScreenHeader } from '../activities/ui';
import { resumeCheckout, useCheckoutState } from './data';
import { resumable, returnBody, returnHeadline } from './logic';
import { TestModeNote } from './ui';

const WAITED_LONG_MS = 20_000;

export function PayReturnScreen({ checkoutId, result }: { checkoutId: string; result: string | undefined }) {
  const userId = useUserId();
  const parsed = parsePaymentsReturn(`ojoro://pay/return?checkout_id=${checkoutId}&result=${result ?? ''}`);
  const valid = parsed?.kind === 'checkout';
  const r: 'success' | 'cancel' = parsed?.kind === 'checkout' ? parsed.result : 'success';
  const q = useCheckoutState(valid ? checkoutId : '', userId);
  const c = q.data ?? null;
  const [startedAt] = useState(() => Date.now());
  const now = useNow(5_000);
  const waitedLong = now.getTime() - startedAt > WAITED_LONG_MS;

  const seen = useRef(false);
  useEffect(() => {
    if (c && !seen.current) {
      seen.current = true;
      track('payment_return_viewed', { result: r, status: c.status, kind: c.kind });
    }
  }, [c, r]);

  return (
    <Screen situation="calm" scroll gutter={false}>
      <ScreenHeader overline="PAYMENT" fallback={'/pay' as Href} />
      {!valid ? (
        <View className="gap-space-4 px-space-5 pt-space-6" testID="pay-return-invalid">
          <Text variant="title">That payment link isn’t complete.</Text>
          <Text variant="body-sm" muted>
            Your passes and payments show what Stripe has confirmed.
          </Text>
          <Button variant="secondary" block href={'/pay' as Href}>
            YOUR PASSES AND PAYMENTS
          </Button>
        </View>
      ) : q.isPending ? (
        <LoadingState label="Checking the payment" kinds={['text', 'text']} />
      ) : !c ? (
        <View className="gap-space-4 px-space-5 pt-space-6" testID="pay-return-error">
          <InlineError
            message={q.isError ? errorMessage(ojoroErrorOf(q.error)) : 'We can’t find that payment. It may not be yours.'}
            action="TRY AGAIN"
            onAction={() => void q.refetch()}
          />
        </View>
      ) : (
        <ReturnBody checkout={c} result={r} waitedLong={waitedLong} now={now} />
      )}
    </Screen>
  );
}

/** The activity a drop-in paid for, to go back to the game. */
function useActivityOfSession(sessionId: string | null) {
  return useQuery({
    queryKey: ['pay', 'activity-of', sessionId],
    queryFn: async () => {
      const { data } = await supabase.from('host_sessions').select('activity_id').eq('id', sessionId!).maybeSingle();
      return (data?.activity_id as string | null | undefined) ?? null;
    },
    enabled: !!sessionId,
    staleTime: Infinity,
  });
}

function ReturnBody({
  checkout: c,
  result,
  waitedLong,
  now,
}: {
  checkout: PaymentCheckoutState;
  result: 'success' | 'cancel';
  waitedLong: boolean;
  now: Date;
}) {
  const activity = useActivityOfSession(c.kind === 'drop_in' ? c.session_id : null).data ?? null;
  const pending = isCheckoutPending(c.status);
  const again: Href = (
    c.kind === 'drop_in' ? (activity ? `/activity/${activity}` : '/pay') : `/pay/program/${c.program_id}`
  ) as Href;
  return (
    <View className="gap-space-6 px-space-5 pb-space-10 pt-space-4" testID="pay-return">
      <View className="gap-space-3" role="status" accessibilityLiveRegion="polite" aria-live="polite">
        <Text variant="overline">{c.program_name.toUpperCase()}</Text>
        <View className="flex-row items-center gap-space-3">
          <Icon name={c.status === 'completed' ? 'check' : pending ? 'clock' : 'alert'} size={24} />
          <DisplayText size="lg" accessibilityRole="header" testID="pay-return-headline">
            {returnHeadline(c.status, result, waitedLong)}
          </DisplayText>
        </View>
        <Text variant="body" testID="pay-return-body">
          {returnBody(c, result, waitedLong)}
        </Text>
      </View>
      <TestModeNote />
      <View className="gap-space-3">
        {pending && result === 'cancel' && resumable(c, now) ? (
          <Button block onPress={() => void resumeCheckout(c)} testID="pay-return-resume">
            BACK TO PAYING
          </Button>
        ) : null}
        {c.status === 'expired' || c.status === 'failed' ? (
          <Button block href={again} testID="pay-return-again">
            TRY AGAIN
          </Button>
        ) : null}
        {c.kind === 'drop_in' && activity ? (
          <Button
            variant={c.status === 'completed' ? 'primary' : 'secondary'}
            block
            onPress={() => router.replace(`/activity/${activity}` as Href)}
            testID="pay-return-game"
          >
            BACK TO THE GAME
          </Button>
        ) : null}
        <Button variant={c.kind === 'drop_in' ? 'ghost' : 'secondary'} block href={'/pay' as Href} testID="pay-return-mine">
          YOUR PASSES AND PAYMENTS
        </Button>
      </View>
    </View>
  );
}
