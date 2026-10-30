/**
 * `/pay` (not designed; minimal, calm): YOUR PASSES (packs, memberships, free passes, from any
 * program, however they were bought) and PAID IN THE APP (Stripe checkouts: paid, refunded, didn't go
 * through). Reached from You → Settings → Passes and payments, and from the return screen. Stripe
 * emails the card receipt; this list is Ojoro's record.
 */
import { formatMoney } from '@ojoro/contracts';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { Badge, DisplayText, Divider, IconButton, Screen, Strip, StripList, Text } from '@/design-system';
import { track } from '@/lib/analytics';
import { useUserId } from '@/lib/auth';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { shortDate } from '../activities/format';
import { LoadingState } from '../activities/ui';
import { InlineError, OfflineNote, useIsOnline } from '../profile/states';
import { useMyPayments } from './data';
import { holdingLine, holdingWord, receiptsToShow, receiptTitle, receiptWord } from './logic';
import { TestModeNote } from './ui';

export function MyPaymentsScreen() {
  const userId = useUserId();
  const q = useMyPayments(userId);
  const online = useIsOnline();

  useEffect(() => {
    track('screen_viewed', { screen: 'pay_mine' });
  }, []);

  const passes = q.data?.passes ?? [];
  const receipts = receiptsToShow(q.data?.receipts ?? []);
  const current = passes.filter((p) => p.status !== 'ended');
  const past = passes.filter((p) => p.status === 'ended');

  return (
    <Screen situation="calm" scroll gutter={false}>
      <View className="flex-row items-center pl-space-2 pt-space-2">
        <IconButton icon="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/you'))} />
      </View>
      <View className="gap-space-8 px-space-5 pb-space-10 pt-space-4" testID="pay-mine">
        <View className="gap-space-3">
          <DisplayText size="lg" accessibilityRole="header">
            PASSES AND PAYMENTS
          </DisplayText>
          <Text variant="body">What you hold with hosts, and what you paid in the app. Stripe emails your card receipts.</Text>
          <TestModeNote />
        </View>
        {!online && q.data ? <OfflineNote dataUpdatedAt={q.dataUpdatedAt} what="your passes" /> : null}
        {q.isPending ? (
          <LoadingState label="Loading your passes" kinds={['strip', 'strip']} />
        ) : !q.data ? (
          <InlineError message={errorMessage(ojoroErrorOf(q.error))} action="TRY AGAIN" onAction={() => void q.refetch()} />
        ) : (
          <>
            <View role="region" aria-label="Your passes" testID="pay-mine-passes">
              <Divider kind="strong" label={`YOUR PASSES · ${current.length}`} />
              {current.length === 0 ? (
                <Text variant="body-sm" muted className="py-space-4">
                  No passes yet. Hosts’ packs and memberships show here once you have one.
                </Text>
              ) : (
                <StripList>
                  {current.map((p) => (
                    <Strip
                      key={p.membership_id}
                      title={p.program_name}
                      titleVariant="title-sm"
                      meta={holdingLine(p)}
                      trailing={<Badge tone={p.status === 'active' ? 'verified' : 'neutral'}>{holdingWord(p)}</Badge>}
                      href={`/pay/program/${p.program_id}` as Href}
                      testID={`pay-mine-pass-${p.membership_id}`}
                    />
                  ))}
                </StripList>
              )}
              {past.length > 0 ? (
                <Text variant="caption" muted className="pt-space-2">
                  {`${past.length} ended ${past.length === 1 ? 'pass' : 'passes'} not shown.`}
                </Text>
              ) : null}
            </View>
            <View role="region" aria-label="Paid in the app" testID="pay-mine-receipts">
              <Divider label={`PAID IN THE APP · ${receipts.length}`} />
              {receipts.length === 0 ? (
                <Text variant="body-sm" muted className="py-space-4">
                  Nothing paid in the app yet.
                </Text>
              ) : (
                <StripList>
                  {receipts.map((r) => (
                    <Strip
                      key={r.checkout_id}
                      title={`${formatMoney(r.amount_cents, r.currency)} · ${receiptTitle(r)}`}
                      titleVariant="title-sm"
                      meta={shortDate(r.completed_at ?? r.created_at)}
                      trailing={<Badge tone={r.status === 'completed' ? 'verified' : 'neutral'}>{receiptWord(r.status)}</Badge>}
                      testID={`pay-mine-receipt-${r.checkout_id}`}
                    />
                  ))}
                </StripList>
              )}
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}
