/**
 * `/pay/program/[programId]` (not designed; minimal, calm): a program's passes I can buy, the pass I
 * hold there, and the way back to a checkout page that's still open. Opened from GET A PASS on a host
 * session. Prices come from the server; PAY opens Stripe Checkout (hosted) with expo-linking.
 */
import { formatMoney } from '@ojoro/contracts';
import { type Href } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { Button, DisplayText, Divider, Screen, Text } from '@/design-system';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { useNow, useOnline } from '../activities/data';
import { InlineError, LoadingState, ScreenHeader } from '../activities/ui';
import { OfflineNote } from '../profile/states';
import { resumeCheckout, usePurchaseOptions, useStartCheckout } from './data';
import { resumable } from './logic';
import { HoldingRow, PassRow, TestModeNote } from './ui';

export function ProgramPassesScreen({ programId, sessionId }: { programId: string; sessionId: string | null }) {
  const options = usePurchaseOptions(programId, sessionId);
  const o = options.data ?? null;
  const start = useStartCheckout(programId);
  const online = useOnline();
  const now = useNow(30_000);

  useEffect(() => {
    track('screen_viewed', { screen: 'pay_program', program_id: programId });
  }, [programId]);

  const open = o?.open_checkout && o.open_checkout.kind !== 'drop_in' ? o.open_checkout : null;
  const passes = o?.passes.filter((p) => p.kind !== 'drop_in') ?? [];

  return (
    <Screen situation="calm" scroll gutter={false}>
      <ScreenHeader overline="PASSES" fallback={(sessionId ? '/' : '/pay') as Href} />
      {options.isPending ? (
        <LoadingState label="Loading passes" kinds={['text', 'strip', 'strip']} />
      ) : !o ? (
        <View className="px-space-5 pt-space-6">
          <InlineError
            message={errorMessage(ojoroErrorOf(options.error))}
            action="TRY AGAIN"
            onAction={() => void options.refetch()}
            testID="pay-program-error"
          />
        </View>
      ) : (
        <View className="gap-space-8 px-space-5 pb-space-10 pt-space-4" testID="pay-program">
          {!online ? <OfflineNote dataUpdatedAt={options.dataUpdatedAt} what="these passes" extra="Paying needs a connection." /> : null}
          <View className="gap-space-3">
            <DisplayText size="lg" accessibilityRole="header">
              {o.program_name.toUpperCase()}
            </DisplayText>
            <Text variant="body">
              {o.payments_connected
                ? 'Pay through Stripe. Stripe takes the card; Ojoro never sees it.'
                : 'This host doesn’t take payments in the app yet. Pay at the field.'}
            </Text>
            <TestModeNote />
          </View>
          <HoldingRow options={o} />
          {open && resumable(open, now) ? (
            <View className="gap-space-2 bg-surface-raised p-space-4" testID="pay-open-checkout">
              <Text variant="title-sm">{`${open.pass_name ?? 'A pass'} isn’t paid yet`}</Text>
              <Text variant="body-sm">
                {`Your payment page for ${formatMoney(open.amount_cents, open.currency)} is still open. Nothing has been charged.`}
              </Text>
              <Button variant="secondary" block disabled={!online} onPress={() => void resumeCheckout(open)} testID="pay-resume">
                BACK TO PAYING
              </Button>
            </View>
          ) : null}
          <View role="region" aria-label="Passes">
            <Divider kind="strong" label={`PASSES · ${passes.length}`} />
            {passes.length === 0 ? (
              <Text variant="body-sm" muted className="py-space-4">
                No passes on sale here right now.
              </Text>
            ) : (
              passes.map((p) => (
                <PassRow
                  key={p.id}
                  pass={p}
                  busy={start.isPending && start.variables?.passId === p.id}
                  disabled={!online || start.isPending}
                  onBuy={() => start.mutate({ passId: p.id })}
                />
              ))
            )}
          </View>
          {start.isError ? <InlineError message={errorMessage(ojoroErrorOf(start.error))} testID="pay-start-error" /> : null}
          <Text variant="caption" muted>
            Drop-ins are paid from the session you’re in. Refunds follow the host’s policy and go back to the same card.
          </Text>
        </View>
      )}
    </Screen>
  );
}
