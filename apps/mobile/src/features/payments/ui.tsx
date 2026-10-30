/**
 * Participant payment pieces (not designed; HANDOFF.md "What isn't designed yet"). Built only from
 * design-system parts and the nearby patterns (Activity's raised waitlist block, HostMembership's
 * pass rows). Calm. Every state is a sentence; the test-mode line is always shown while live mode
 * is off (docs/DESIGN_DECISIONS.md, Step 8 SCR-PAYMENTS).
 */
import { formatMoney, purchaseReasonSentence, type HostPurchaseOptions, type PurchasePass } from '@ojoro/contracts';
import { type Href } from 'expo-router';
import { View } from 'react-native';

import { Badge, Button, DisplayText, Icon, Text } from '@/design-system';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { useNow, useOnline } from '../activities/data';
import { InlineError } from '../activities/ui';
import { resumeCheckout, useHostSessionOf, usePurchaseOptions, useStartCheckout } from './data';
import {
  holdingLine,
  holdingWord,
  isTestMode,
  passCta,
  passPrice,
  passTerms,
  resumable,
  sessionPayView,
  TEST_MODE_LABEL,
  TEST_MODE_NOTE,
} from './logic';

/** TEST MODE + the sentence. Status in words, with a strong rule (never colour only). */
export function TestModeNote({ testID = 'payments-test-mode' }: { testID?: string }) {
  if (!isTestMode()) return null;
  return (
    <View className="flex-row items-center gap-space-3 border-l-2 border-line-strong py-space-1 pl-space-3" testID={testID}>
      <Badge tone="neutral">{TEST_MODE_LABEL}</Badge>
      <Text variant="caption" muted className="flex-1">
        {TEST_MODE_NOTE}
      </Text>
    </View>
  );
}

/**
 * The pay block on a host session's Activity screen: how my spot is paid, PAY $8 when I can pay in
 * the app, and GET A PASS for the program's packs and memberships. Nothing for ordinary games.
 */
export function SessionPayBlock({ activityId, inGame }: { activityId: string; inGame: boolean }) {
  const of = useHostSessionOf(activityId);
  const programId = of.data?.programId ?? null;
  const sessionId = of.data?.sessionId ?? null;
  const options = usePurchaseOptions(programId, sessionId);
  const o = options.data ?? null;
  if (!of.data || !o) return null;
  const s = o.session;
  const view = s ? sessionPayView(s, o.payments_connected) : null;
  const buyablePasses = o.passes.some((p) => p.buyable);
  if (!view && !buyablePasses && !o.holding) return null;
  return (
    <SessionPayCard
      programId={of.data.programId}
      sessionId={of.data.sessionId}
      options={o}
      view={view}
      inGame={inGame}
    />
  );
}

function SessionPayCard({
  programId,
  sessionId,
  options: o,
  view,
  inGame,
}: {
  programId: string;
  sessionId: string;
  options: HostPurchaseOptions;
  view: ReturnType<typeof sessionPayView>;
  inGame: boolean;
}) {
  const start = useStartCheckout(programId);
  const online = useOnline();
  const now = useNow(30_000);
  const open = o.open_checkout && o.open_checkout.kind === 'drop_in' && o.open_checkout.session_id === sessionId ? o.open_checkout : null;
  const canResume = resumable(open, now);
  return (
    <View className="gap-space-3 bg-surface-raised p-space-5" role="region" aria-label="Paying for your spot" testID="session-pay">
      <Text variant="overline">PAYMENT</Text>
      {view ? (
        <View className="gap-space-1">
          <Text variant="title-sm" testID="session-pay-title">
            {view.title}
          </Text>
          <Text variant="body-sm">{view.body}</Text>
        </View>
      ) : null}
      {o.holding ? (
        <Text variant="body-sm" muted testID="session-pay-holding">
          {`Your pass here: ${holdingLine(o.holding)}`}
        </Text>
      ) : null}
      {view?.cta && inGame ? (
        canResume && open ? (
          <Button block onPress={() => void resumeCheckout(open)} disabled={!online} testID="session-pay-resume">
            {`BACK TO PAYING ${formatMoney(open.amount_cents, open.currency)}`}
          </Button>
        ) : (
          <Button
            block
            loading={start.isPending}
            disabled={!online}
            onPress={() => start.mutate({ sessionId })}
            testID="session-pay-button"
          >
            {view.cta}
          </Button>
        )
      ) : null}
      {o.passes.some((p) => p.buyable) ? (
        <Button
          variant="secondary"
          block
          href={`/pay/program/${programId}?session=${sessionId}` as Href}
          testID="session-get-pass"
        >
          GET A PASS
        </Button>
      ) : null}
      {start.isError ? <InlineError message={errorMessage(ojoroErrorOf(start.error))} testID="session-pay-error" /> : null}
      {!online && view?.cta ? (
        <Text variant="caption" muted>
          Paying needs a connection.
        </Text>
      ) : null}
      {view?.cta || o.passes.some((p) => p.buyable) ? <TestModeNote testID="session-pay-test-mode" /> : null}
    </View>
  );
}

/** One pass a person can buy: price, name, terms, and its PAY button or the reason it can't be. */
export function PassRow({
  pass,
  onBuy,
  busy,
  disabled,
}: {
  pass: PurchasePass;
  onBuy: () => void;
  busy: boolean;
  disabled: boolean;
}) {
  const cta = passCta(pass);
  return (
    <View className="gap-space-3 border-b border-line py-space-4" testID={`pay-pass-${pass.id}`}>
      <View className="flex-row items-start gap-space-4">
        <View className="w-[88px]">
          <DisplayText size="sm" style={{ fontVariant: ['tabular-nums'] }}>
            {passPrice(pass)}
          </DisplayText>
        </View>
        <View className="flex-1 gap-space-1">
          <Text variant="title-sm">{pass.name}</Text>
          {pass.description ? (
            <Text variant="body-sm" muted>
              {pass.description}
            </Text>
          ) : null}
          <Text variant="label-sm" className="mt-space-1">
            {passTerms(pass)}
          </Text>
        </View>
      </View>
      {cta ? (
        <Button block variant="primary" loading={busy} disabled={disabled} onPress={onBuy} testID={`pay-pass-buy-${pass.id}`}>
          {cta}
        </Button>
      ) : pass.reason ? (
        <Text variant="body-sm" muted testID={`pay-pass-reason-${pass.id}`}>
          {purchaseReasonSentence(pass.reason)}
        </Text>
      ) : null}
    </View>
  );
}

/** The pass I hold here, as a row with its status word. */
export function HoldingRow({ options }: { options: HostPurchaseOptions }) {
  const h = options.holding;
  if (!h) return null;
  return (
    <View className="flex-row items-center gap-space-3 border-l-4 border-text bg-surface-raised p-space-4" testID="pay-holding">
      <Icon name="check" size={20} />
      <View className="flex-1 gap-space-1">
        <Text variant="title-sm">You hold a pass here</Text>
        <Text variant="body-sm">{holdingLine(h)}</Text>
      </View>
      <Badge tone="verified">{holdingWord(h)}</Badge>
    </View>
  );
}
