/**
 * HostMembership (`/host/[programId]/payments`, HostMembership.png, PRD §13, §16.2, §17): the next
 * payout with its lines, NEEDS A DECISION (refund all / part / keep), PASSES, MEMBERS and PAST
 * PAYOUTS. Calm.
 *
 * Step 8 (docs/PAYMENTS_CONTRACT.md): the PAYMENTS block walks the owner through Stripe's hosted
 * onboarding (SET UP PAYOUTS → setup not finished → needs info → ready) and back; until it's ready
 * nothing is charged in the app and the screen says so. Past payouts read PAID only when Stripe paid
 * them. TEST MODE shows while live mode is off. The Ojoro service fee is a server-computed
 * placeholder, labelled as one. Refund decisions are recorded and authorized on the server.
 */
import {
  decisionSentence,
  formatMoney,
  moneyLineLabel,
  passCountLabel,
  passPriceLabel,
  pastPayoutMeta,
  payoutSourceSentence,
  type HostPassItem,
  type HostPassKind,
  type HostRefundDecisionItem,
} from '@ojoro/contracts';
import { type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import {
  Avatar,
  AvatarCluster,
  Badge,
  Button,
  Chip,
  DisplayText,
  Divider,
  Icon,
  Input,
  Ledger,
  Quote,
  Screen,
  Sheet,
  Strip,
  Text,
  TextButton,
  useToast,
  type LedgerLine,
} from '@/design-system';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { useOnline } from '../activities/data';
import { InlineError, LoadingState, OfflineNote, ScreenHeader } from '../activities/ui';
import { accountView, connectReturnNote, passSaleNote, payoutWord, refundProgressNote } from '../payments/logic';
import { TestModeNote } from '../payments/ui';
import { HostUnavailable } from './ui';
import {
  accountOf,
  useArchivePass,
  useConnect,
  useDecideRefund,
  useMoneyView,
  useSavePass,
  useUndoRefund,
  type PassDraft,
  type PaymentsMoneyView,
} from './moneyData';
import {
  dateOnlyMonthDay,
  parseRefundAmount,
  payoutDate,
  payoutLands,
  payoutOverline,
  membersSentence,
  refundContext,
  refundKind,
  SERVICE_FEE_LABEL,
} from './peopleLogic';

type HostMoneyView = PaymentsMoneyView;

export function HostMembershipScreen({ programId, connect }: { programId: string; connect?: string | undefined }) {
  const online = useOnline();
  const money = useMoneyView(programId);
  const view = money.data ?? null;

  useEffect(() => {
    track('screen_viewed', { screen: 'host_membership', program_id: programId });
  }, [programId]);

  return (
    <Screen situation="calm" scroll gutter={false}>
      <ScreenHeader overline="MEMBERSHIPS & PAYMENTS" fallback={`/host/${programId}` as Href} />
      {money.isPending ? (
        <LoadingState label="Loading payments" kinds={['text', 'strip', 'strip', 'strip']} />
      ) : !view ? (
        <HostUnavailable error={money.error} onRetry={() => void money.refetch()} />
      ) : (
        <View className="gap-space-10 px-space-5 pb-space-10 pt-space-4" testID="host-membership">
          {!online ? (
            <OfflineNote dataUpdatedAt={money.dataUpdatedAt} extra="Decisions and pass changes wait until you're back." />
          ) : null}
          <PaymentsAccount programId={programId} view={view} connect={connect} online={online} />
          <NextPayout view={view} />
          <Decisions programId={programId} view={view} online={online} />
          <Passes programId={programId} view={view} />
          <Members programId={programId} view={view} />
          <PastPayouts programId={programId} view={view} />
        </View>
      )}
    </Screen>
  );
}

/**
 * PAYMENTS: the program's Stripe account. Not connected → SET UP PAYOUTS (Stripe-hosted onboarding),
 * then setup not finished / needs info / ready, from Stripe's own flags. Coming back from Stripe
 * (`?connect=return`) reads Stripe again; an expired link (`?connect=refresh`) offers a fresh one.
 * Until it's ready, the honest note stays: nothing is charged, refunded or paid out in the app.
 */
function PaymentsAccount({
  programId,
  view,
  connect,
  online,
}: {
  programId: string;
  view: HostMoneyView;
  connect: string | undefined;
  online: boolean;
}) {
  const account = accountOf(view);
  const a = accountView(account);
  const run = useConnect(programId);
  const returned = useRef(false);
  const ready = account.status === 'ready' && view.payments_connected;

  useEffect(() => {
    // Back from Stripe's onboarding: ask Stripe now rather than wait for the webhook.
    if (connect === 'return' && !returned.current && account.status !== 'not_connected') {
      returned.current = true;
      run.mutate('refresh');
    }
  }, [connect, account.status, run]);

  const note = connectReturnNote(connect);
  return (
    <View className="gap-space-3" role="region" aria-label="Payments" testID="host-payments">
      <View
        className={`flex-row items-start gap-space-3 bg-surface-raised p-space-4 ${ready ? 'border-l-2 border-line-strong' : 'border-l-4 border-text'}`}
        role="note"
        testID={ready ? 'host-payments-ready' : 'host-payments-not-connected'}
      >
        <Icon name={ready ? 'check' : 'alert'} size={20} label={ready ? 'Ready' : 'Note'} />
        <View className="flex-1 gap-space-2">
          <View className="flex-row flex-wrap items-center gap-space-2">
            <Text variant="title-sm">{a.title}</Text>
            <Badge tone={ready ? 'verified' : 'neutral'}>{a.word}</Badge>
          </View>
          <Text variant="body-sm" testID="host-payments-sentence">
            {a.body}
          </Text>
          {note ? (
            <Text variant="body-sm" muted testID="host-connect-return">
              {note}
            </Text>
          ) : null}
          {!ready ? (
            <Text variant="body-sm" muted>
              Until then these are records of what people owe and paid at the field. No card is charged, no refund is
              sent and no payout reaches your bank through Ojoro. The Ojoro service fee isn't decided; the amount shown is
              a placeholder.
            </Text>
          ) : (
            <Text variant="body-sm" muted>
              People can pay for drop-ins, packs and memberships in the app. The Ojoro service fee isn't decided; the
              amount shown is a placeholder.
            </Text>
          )}
          {a.ownerOnlyNote ? (
            <Text variant="caption" muted>
              {a.ownerOnlyNote}
            </Text>
          ) : null}
          {a.primary || a.secondary ? (
            <View className="mt-space-1 flex-row flex-wrap gap-space-2">
              {a.primary ? (
                <Button
                  variant="primary"
                  compact
                  loading={run.isPending && run.variables === a.primary.action}
                  disabled={!online || run.isPending}
                  onPress={() => run.mutate(a.primary!.action)}
                  testID="host-connect-primary"
                >
                  {connect === 'refresh' && a.primary.action === 'onboard' ? 'OPEN A FRESH LINK' : a.primary.label}
                </Button>
              ) : null}
              {a.secondary ? (
                <Button
                  variant="secondary"
                  compact
                  loading={run.isPending && run.variables === a.secondary.action}
                  disabled={!online || run.isPending}
                  onPress={() => run.mutate(a.secondary!.action)}
                  testID="host-connect-secondary"
                >
                  {a.secondary.label}
                </Button>
              ) : null}
            </View>
          ) : null}
          {run.isError ? <InlineError message={errorMessage(ojoroErrorOf(run.error))} testID="host-connect-error" /> : null}
        </View>
      </View>
      <TestModeNote testID="host-payments-test-mode" />
      {(view.disputes?.length ?? 0) > 0 ? (
        <View className="flex-row items-start gap-space-3 border-l-4 border-text p-space-4" role="alert" testID="host-disputes">
          <Icon name="alert" size={20} label="Disputed" />
          <Text variant="body-sm" className="flex-1">
            {`${view.disputes!.length} ${view.disputes!.length === 1 ? 'payment is' : 'payments are'} disputed with the buyer’s bank (${view.disputes!
              .map((d) => formatMoney(d.amount_cents, d.currency))
              .join(', ')}). Stripe shows what to send; open Stripe to answer.`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function NextPayout({ view }: { view: HostMoneyView }) {
  const p = view.next_payout;
  const lines: LedgerLine[] = [
    ...p.lines.map((l) => ({ key: `${l.kind}-${l.unit_cents}`, label: moneyLineLabel(l, p.currency), amountCents: l.amount_cents })),
    { key: 'refunds', label: 'Refunds', amountCents: -p.refunds_cents },
    { key: 'fee', label: SERVICE_FEE_LABEL, amountCents: -p.fee_cents },
  ];
  return (
    <View className="gap-space-3" role="region" aria-label="Next payout" testID="host-next-payout">
      <Text variant="overline">{payoutOverline(p.pays_on)}</Text>
      <DisplayText size="xl" accessibilityRole="header" style={{ fontVariant: ['tabular-nums'] }} testID="host-payout-net">
        {formatMoney(p.net_cents, p.currency)}
      </DisplayText>
      <Text variant="body">{`${payoutSourceSentence(p)} ${payoutLands(p.pays_on, view.payments_connected)}`}</Text>
      <View className="mt-space-2">
        <Ledger
          lines={lines}
          currency={p.currency}
          total={{ label: 'You get', amountCents: p.net_cents }}
          label="Next payout"
          locale="en-CA"
          testID="host-payout-ledger"
        />
      </View>
    </View>
  );
}

function Decisions({ programId, view, online }: { programId: string; view: HostMoneyView; online: boolean }) {
  const recent = view.recent_decisions;
  if (view.decisions.length === 0 && recent.length === 0) return null;
  return (
    <View className="gap-space-4" testID="host-decisions">
      {view.decisions.map((d) => (
        <DecisionCard key={d.request_id} programId={programId} item={d} timeZone={view.time_zone} online={online} />
      ))}
      {recent.map((r) => (
        <DecidedRow key={r.request_id} programId={programId} decided={r} connected={view.payments_connected} />
      ))}
    </View>
  );
}

function DecisionCard({
  programId,
  item,
  timeZone,
  online,
}: {
  programId: string;
  item: HostRefundDecisionItem;
  timeZone: string;
  online: boolean;
}) {
  const toast = useToast();
  const decide = useDecideRefund(programId);
  const [partial, setPartial] = useState<string | null>(null);
  const [partialError, setPartialError] = useState<string | null>(null);
  const first = item.person.display_name.split(' ')[0] ?? item.person.display_name;
  const all = item.refundable_cents;
  const suggested = item.suggested_partial_cents;
  const send = (decision: 'full' | 'partial' | 'keep', amountCents?: number) =>
    decide.mutate(
      { requestId: item.request_id, decision, ...(amountCents != null ? { amountCents } : null) },
      {
        onSuccess: (state) =>
          toast.show({
            kind: 'success',
            message: decisionSentence(state, first, state.membership_ends_at ? dateOnlyMonthDay(state.membership_ends_at) : undefined),
          }),
      },
    );

  return (
    <View
      className="gap-space-4 bg-surface-raised p-space-5"
      role="region"
      aria-label={`Needs a decision: ${item.person.display_name}`}
      testID={`host-decision-${item.request_id}`}
    >
      <Text variant="overline">NEEDS A DECISION</Text>
      <View className="flex-row items-center gap-space-3">
        <Avatar name={item.person.display_name} size="md" />
        <View className="flex-1 gap-space-1">
          <Text variant="title-sm">{`${item.person.display_name} · ${refundKind(item.charge_kind)}`}</Text>
          <Text variant="body-sm" muted>
            {refundContext(item, timeZone)}
          </Text>
        </View>
      </View>
      {item.note ? <Quote>{item.note}</Quote> : null}
      <Text variant="caption" muted>
        {`Your policy leaves ${item.membership_id ? 'membership refunds' : 'this refund'} to you. Whatever you pick, ${first} hears it from Ojoro, kindly worded.`}
      </Text>
      {partial != null ? (
        <View className="gap-space-2">
          <Input
            label="Refund amount"
            keyboardType="decimal-pad"
            value={partial}
            onChangeText={(t) => {
              setPartial(t);
              setPartialError(null);
            }}
            hint={`Less than ${formatMoney(all, item.currency)}.`}
            error={partialError ?? undefined}
            testID="host-refund-amount"
          />
          <View className="flex-row gap-space-2">
            <View className="flex-1">
              <Button
                variant="primary"
                block
                loading={decide.isPending}
                onPress={() => {
                  const parsed = parseRefundAmount(partial, all);
                  if ('error' in parsed) return setPartialError(parsed.error);
                  send('partial', parsed.cents);
                }}
                testID="host-refund-partial-confirm"
              >
                REFUND IT
              </Button>
            </View>
            <View className="flex-1">
              <Button variant="ghost" block onPress={() => setPartial(null)}>
                CANCEL
              </Button>
            </View>
          </View>
        </View>
      ) : (
        <View className="gap-space-2">
          <Button
            variant="primary"
            block
            loading={decide.isPending && decide.variables?.decision === 'full'}
            disabled={decide.isPending || all <= 0}
            onPress={() => send('full')}
            testID="host-refund-full"
          >
            {`REFUND ALL ${formatMoney(all, item.currency)}`}
          </Button>
          <View className="flex-row gap-space-2">
            <View className="flex-1">
              <Button
                variant="secondary"
                block
                loading={decide.isPending && decide.variables?.decision === 'partial'}
                disabled={decide.isPending}
                onPress={() => (suggested ? send('partial', suggested) : setPartial(''))}
                onLongPress={() => setPartial(suggested ? String(suggested / 100) : '')}
                accessibilityHint={suggested ? 'Long press to choose another amount.' : undefined}
                testID="host-refund-partial"
              >
                {suggested ? `REFUND ${formatMoney(suggested, item.currency)}` : 'REFUND PART'}
              </Button>
            </View>
            <View className="flex-1">
              <Button
                variant="ghost"
                block
                loading={decide.isPending && decide.variables?.decision === 'keep'}
                disabled={decide.isPending}
                onPress={() => send('keep')}
                testID="host-refund-keep"
              >
                KEEP IT
              </Button>
            </View>
          </View>
          {suggested ? (
            <View className="self-center">
              <TextButton onPress={() => setPartial(String(suggested / 100))} testID="host-refund-other">
                ANOTHER AMOUNT
              </TextButton>
            </View>
          ) : null}
        </View>
      )}
      {decide.isError ? <InlineError message={errorMessage(ojoroErrorOf(decide.error))} testID="host-refund-error" /> : null}
      {!online ? (
        <Text variant="caption" muted>
          Offline. Your decision goes through when you're back.
        </Text>
      ) : null}
    </View>
  );
}

function DecidedRow({
  programId,
  decided,
  connected,
}: {
  programId: string;
  decided: HostMoneyView['recent_decisions'][number];
  connected: boolean;
}) {
  const undo = useUndoRefund(programId);
  const first = decided.person.display_name.split(' ')[0] ?? decided.person.display_name;
  const canUndo = decided.undo_until != null && new Date(decided.undo_until).getTime() > Date.now();
  return (
    <View className="gap-space-2 bg-surface-raised p-space-5" testID={`host-decided-${decided.request_id}`}>
      <View className="flex-row items-center gap-space-3" role="status" accessibilityLiveRegion="polite">
        <Icon name="check" />
        <Text variant="body-sm" className="flex-1">
          {decisionSentence(
            decided,
            first,
            decided.membership_ends_at ? dateOnlyMonthDay(decided.membership_ends_at) : undefined,
          )}
          {refundProgressNote(decided, connected)}
        </Text>
        {canUndo ? (
          <TextButton
            onPress={() => undo.mutate(decided.request_id)}
            disabled={undo.isPending}
            accessibilityLabel={`Undo the decision for ${decided.person.display_name}`}
            testID="host-refund-undo"
          >
            UNDO
          </TextButton>
        ) : null}
      </View>
      {undo.isError ? <InlineError message={errorMessage(ojoroErrorOf(undo.error))} /> : null}
    </View>
  );
}

const PASS_KIND_LABEL: Record<HostPassKind, string> = {
  drop_in: 'Drop-in',
  pack: 'Pack',
  monthly: 'Monthly',
  free: 'Free',
};

function Passes({ programId, view }: { programId: string; view: HostMoneyView }) {
  const [editing, setEditing] = useState<HostPassItem | 'new' | null>(null);
  return (
    <View role="region" aria-label="Passes" testID="host-passes">
      <Divider kind="strong" label="PASSES" />
      {view.passes.length === 0 ? (
        <Text variant="body-sm" muted className="py-space-4">
          No passes yet. Add a drop-in price, a pack or a monthly membership.
        </Text>
      ) : (
        view.passes.map((p) => (
          <View key={p.id} className="flex-row items-start gap-space-4 border-b border-line py-space-4" testID={`host-pass-${p.id}`}>
            <View className="w-[72px]">
              <DisplayText size="sm" style={{ fontVariant: ['tabular-nums'] }}>
                {passPriceLabel(p)}
              </DisplayText>
            </View>
            <View className="flex-1 gap-space-1">
              <Text variant="title-sm">{p.name}</Text>
              {p.description ? (
                <Text variant="body-sm" muted>
                  {p.description}
                </Text>
              ) : null}
              <Text variant="label-sm" className="mt-space-1" style={{ fontVariant: ['tabular-nums'] }}>
                {passCountLabel(p)}
              </Text>
            </View>
            <TextButton onPress={() => setEditing(p)} accessibilityLabel={`Edit ${p.name}`} testID={`host-pass-edit-${p.id}`}>
              EDIT
            </TextButton>
          </View>
        ))
      )}
      <View className="w-full flex-row justify-center pt-space-2">
        <Button variant="ghost" onPress={() => setEditing('new')} testID="host-pass-new">
          NEW PASS
        </Button>
      </View>
      {editing ? (
        <PassSheet
          programId={programId}
          pass={editing === 'new' ? null : editing}
          currency={view.next_payout.currency}
          connected={view.payments_connected}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </View>
  );
}

function priceText(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

function PassSheet({
  programId,
  pass,
  currency,
  connected,
  onClose,
}: {
  programId: string;
  pass: HostPassItem | null;
  currency: string;
  connected: boolean;
  onClose: () => void;
}) {
  const save = useSavePass(programId);
  const archive = useArchivePass(programId);
  const toast = useToast();
  const [kind, setKind] = useState<HostPassKind>(pass?.kind ?? 'drop_in');
  const [name, setName] = useState(pass?.name ?? '');
  const [description, setDescription] = useState(pass?.description ?? '');
  const [price, setPrice] = useState(pass ? priceText(pass.price_cents) : '');
  const [sessions, setSessions] = useState(pass?.sessions_included != null ? String(pass.sessions_included) : '10');
  const [days, setDays] = useState(pass?.valid_days != null ? String(pass.valid_days) : '120');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Give the pass a name.';
    let cents = 0;
    if (kind !== 'free') {
      const t = price.trim().replace(/^\$/, '');
      if (!/^\d+(\.\d{1,2})?$/.test(t) || Number(t) <= 0) e.price = 'Write a price, like 8 or 8.50.';
      else cents = Math.round(Number(t) * 100);
    }
    const n = Number(sessions);
    const d = Number(days);
    if (kind === 'pack' && (!Number.isInteger(n) || n < 2 || n > 100)) e.sessions = 'A pack holds 2 to 100 sessions.';
    if (kind === 'pack' && (!Number.isInteger(d) || d < 1 || d > 730)) e.days = 'Use within 1 to 730 days.';
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    const draft: PassDraft = {
      kind,
      name,
      description,
      priceCents: cents,
      sessionsIncluded: kind === 'pack' ? n : null,
      validDays: kind === 'pack' ? d : null,
    };
    save.mutate(
      { passId: pass?.id ?? null, draft, currency },
      {
        onSuccess: () => {
          toast.show({ kind: 'success', message: pass ? `${name.trim()} saved. New prices apply to the next sale.` : `${name.trim()} added.` });
          onClose();
        },
      },
    );
  };

  return (
    <Sheet
      visible
      title={pass ? `Edit ${pass.name}` : 'New pass'}
      onClose={onClose}
      actions={
        <View className="gap-space-2">
          <Button variant="primary" block loading={save.isPending} onPress={submit} testID="host-pass-save">
            {pass ? 'SAVE PASS' : 'ADD PASS'}
          </Button>
          {pass ? (
            <Button
              variant="ghost"
              block
              loading={archive.isPending}
              onPress={() =>
                archive.mutate(pass.id, {
                  onSuccess: () => {
                    toast.show({ kind: 'neutral', message: `${pass.name} isn't on sale anymore. People who hold one keep it.` });
                    onClose();
                  },
                })
              }
              testID="host-pass-archive"
            >
              STOP SELLING IT
            </Button>
          ) : null}
        </View>
      }
    >
      <View className="gap-space-4">
        {!pass ? (
          <View className="gap-space-2">
            <Text variant="label">KIND</Text>
            <View className="flex-row flex-wrap gap-space-2" role="radiogroup" aria-label="Kind">
              {(Object.keys(PASS_KIND_LABEL) as HostPassKind[]).map((k) => (
                <Chip key={k} selected={kind === k} onPress={() => setKind(k)}>
                  {PASS_KIND_LABEL[k]}
                </Chip>
              ))}
            </View>
          </View>
        ) : null}
        <Input label="Name" value={name} onChangeText={setName} error={errors.name} testID="host-pass-name" />
        <Input
          label="What it covers"
          value={description}
          onChangeText={setDescription}
          placeholder="One session, any Tuesday or Thursday"
        />
        {kind !== 'free' ? (
          <Input
            label={`Price (${currency})`}
            keyboardType="decimal-pad"
            value={price}
            onChangeText={setPrice}
            error={errors.price}
            hint={pass ? 'A new price applies to the next sale. What people paid stays as it was.' : undefined}
            testID="host-pass-price"
          />
        ) : null}
        {kind === 'pack' ? (
          <>
            <Input label="Sessions" keyboardType="number-pad" value={sessions} onChangeText={setSessions} error={errors.sessions} />
            <Input label="Use within (days)" keyboardType="number-pad" value={days} onChangeText={setDays} error={errors.days} />
          </>
        ) : null}
        <Text variant="caption" muted>
          {passSaleNote(connected)}
        </Text>
        {save.isError ? <InlineError message={errorMessage(ojoroErrorOf(save.error))} testID="host-pass-error" /> : null}
        {archive.isError ? <InlineError message={errorMessage(ojoroErrorOf(archive.error))} /> : null}
      </View>
    </Sheet>
  );
}

function Members({ programId, view }: { programId: string; view: HostMoneyView }) {
  const m = view.members;
  return (
    <View className="gap-space-3" role="region" aria-label="Members" testID="host-members">
      <Divider kind="strong" label={`MEMBERS · ${m.count}`} />
      {m.faces.length > 0 ? (
        <AvatarCluster people={m.faces.map((f) => ({ name: f.display_name }))} total={m.count} max={7} size="md" />
      ) : null}
      <Text variant="body-sm">{membersSentence(m)}</Text>
      <Strip
        title="See members in People"
        titleVariant="title-sm"
        trailing="chevron"
        href={`/host/${programId}/people?filter=members` as Href}
        testID="host-members-people"
      />
    </View>
  );
}

function PastPayouts({ programId, view }: { programId: string; view: HostMoneyView }) {
  const connected = view.payments_connected;
  return (
    <View className="gap-space-1" role="region" aria-label="Past payouts" testID="host-past-payouts">
      <Divider label="PAST PAYOUTS" />
      {view.past_payouts.length === 0 ? (
        <Text variant="body-sm" muted className="py-space-3">
          No payouts yet. Each Friday's week shows here once it closes.
        </Text>
      ) : (
        view.past_payouts.map((x) => (
          <Strip
            key={x.id}
            leading={payoutDate(x.pays_on)}
            leadingLabel={dateOnlyMonthDay(x.pays_on)}
            title={formatMoney(x.net_cents, x.currency)}
            titleVariant="title-sm"
            meta={pastPayoutMeta(x)}
            trailing={<Badge tone={payoutWord(x, connected) === 'PAID' ? 'verified' : 'neutral'}>{payoutWord(x, connected)}</Badge>}
            testID={`host-past-payout-${x.id}`}
          />
        ))
      )}
      {!connected && view.past_payouts.length > 0 ? (
        <Text variant="caption" muted className="pt-space-2">
          NOT SENT: the week is closed and recorded. It's paid out once payments are connected.
        </Text>
      ) : connected && view.past_payouts.length > 0 ? (
        <Text variant="caption" muted className="pt-space-2">
          PAID means Stripe has paid the week to your bank. SCHEDULED weeks are waiting for Stripe's Friday payout.
        </Text>
      ) : null}
      <View className="mt-space-4">
        <Button variant="secondary" block href={`/host/${programId}/insights` as Href} testID="host-revenue-reports">
          REVENUE & REPORTS
        </Button>
      </View>
    </View>
  );
}
