/**
 * HostRoster (`/host/[programId]/session/[id]`, HostRoster.png, PRD §13 participant management and
 * waitlists): who's in with how their spot is paid (in words), the waitlist in order with the
 * auto-fill cutoff, who dropped, MESSAGE ALL, CHECK-IN. Calm.
 *
 * Payment status comes from the ops ledger (docs/HOSTS_OPS_CONTRACT.md); no payments provider is
 * connected, so nothing is charged through Ojoro and the screen says so.
 */
import { type Href, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Share, View } from 'react-native';

import {
  Badge,
  Button,
  DisplayText,
  Divider,
  Icon,
  IconButton,
  ParticipantList,
  ParticipantRow,
  Progress,
  Screen,
  Strip,
  Text,
  useToast,
} from '@/design-system';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { newIdempotencyKey } from '@/lib/idempotency';
import { ojoroErrorOf } from '@/lib/rpc';
import { isRetryable, type RosterRow } from '@ojoro/contracts';

import { useOnline } from '../activities/data';
import { firstName } from '../activities/format';
import { InlineError, LoadingState, OfflineNote, ScreenHeader } from '../activities/ui';
import {
  useAddSpot,
  useHostCheckIn,
  useHostSessionRealtime,
  useMarkPaid,
  usePromote,
  useReorderWaitlist,
  useSessionRoster,
  useSessionView,
} from './data';
import {
  addSpotLabel,
  canCheckIn,
  checkInNote,
  moveDown,
  moveUp,
  positionWord,
  rosterBadge,
  rosterCountLabel,
  rosterMeta,
  sessionHeadline,
  sessionLine,
  sessionOverline,
  settlement,
  waitlistNote,
} from './logic';
import { HostUnavailable } from './ui';

const SHOWN_AT_FIRST = 8;

/** One idempotency key per intention ("promote:<user>"), reused on a retry, cleared on an answer. */
export function useIntentKeys() {
  const keys = useRef(new Map<string, string>());
  return {
    key(intent: string): string {
      let k = keys.current.get(intent);
      if (!k) {
        k = newIdempotencyKey();
        keys.current.set(intent, k);
      }
      return k;
    },
    settle(intent: string, error: unknown): void {
      if (!error || !isRetryable(ojoroErrorOf(error))) keys.current.delete(intent);
    },
  };
}

export function HostRosterScreen({ programId, sessionId }: { programId: string; sessionId: string }) {
  const online = useOnline();
  const toast = useToast();
  const view = useSessionView(programId, sessionId);
  const v = view.data ?? null;
  const roster = useSessionRoster(programId, sessionId, !!v);
  useHostSessionRealtime(programId, sessionId, v?.activity_id);
  const checkIn = useHostCheckIn(programId, sessionId);
  const promote = usePromote(programId, sessionId);
  const reorder = useReorderWaitlist(programId, sessionId);
  const addSpot = useAddSpot(programId, sessionId);
  const markPaid = useMarkPaid(programId, sessionId);
  const intents = useIntentKeys();
  const [showAll, setShowAll] = useState(false);
  const [checkInMode, setCheckInMode] = useState(false);
  const [order, setOrder] = useState<RosterRow[] | null>(null);
  const [, tick] = useState(0);
  const now = new Date();

  useEffect(() => {
    track('screen_viewed', { screen: 'host_roster', program_id: programId, session_id: sessionId });
    // "Starts in 50 minutes" and the check-in window move with the clock.
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, [programId, sessionId]);

  const rows = roster.data ?? [];
  const inRows = rows.filter((r) => r.section === 'in');
  const waiting = rows.filter((r) => r.section === 'waitlist');
  const dropped = rows.filter((r) => r.section === 'dropped');
  const shown = showAll ? inRows : inRows.slice(0, SHOWN_AT_FIRST);
  const waitRows = order ?? waiting;
  const tz = v?.time_zone ?? 'America/Toronto';
  const settle = v ? settlement(v) : null;
  const checkInOpen = v ? canCheckIn(v, now) : false;
  const spotOpen = v ? v.in_count < v.capacity : false;
  const actionsOff = !online || v?.status === 'skipped';
  const firstError = [checkIn, promote, reorder, addSpot, markPaid].find((m) => m.isError)?.error;

  const share = async () => {
    if (!v) return;
    try {
      await Share.share({ message: `${v.name}, ${sessionOverline(v.starts_at, tz, now).toLowerCase()}. Join on Ojoro: /activity/${v.activity_id}` });
    } catch {
      toast.show({ kind: 'error', message: "Sharing isn't available here." });
    }
  };

  return (
    <Screen situation="calm" scroll gutter={false}>
      <ScreenHeader
        overline={v ? sessionOverline(v.starts_at, tz, now) : 'SESSION'}
        fallback={`/host/${programId}` as Href}
        right={v ? <IconButton icon="share" label="Share session link" onPress={() => void share()} testID="roster-share" /> : undefined}
      />
      {view.isPending && !v ? (
        <LoadingState label="Loading the roster" kinds={['text', 'strip', 'strip', 'strip']} />
      ) : !v ? (
        <HostUnavailable what="session" error={view.error} onRetry={() => void view.refetch()} />
      ) : (
        <View className="gap-space-10 px-space-5 pb-space-10 pt-space-4" testID="host-roster">
          {!online ? <OfflineNote dataUpdatedAt={view.dataUpdatedAt} extra="Check-ins and changes wait until you're back." /> : null}
          <View className="gap-space-3">
            <DisplayText size="lg" accessibilityRole="header">
              {sessionHeadline(v.name)}
            </DisplayText>
            <Text variant="body">{sessionLine(v, now)}</Text>
            <Progress value={v.in_count} max={v.capacity} label={`${v.in_count} of ${v.capacity} in`} />
            <Text variant="label" testID="roster-count">
              {rosterCountLabel(v)}
            </Text>
            <View className="mt-space-2 flex-row gap-space-2">
              <Button
                className="flex-1"
                href={`/host/${programId}/announce?session=${sessionId}` as Href}
                disabled={v.status === 'skipped'}
                testID="roster-message-all"
              >
                {`MESSAGE ALL ${v.in_count + v.waitlist_count}`}
              </Button>
              <Button
                variant="secondary"
                onPress={() => {
                  setCheckInMode((m) => !m);
                  setShowAll(true);
                }}
                disabled={!checkInOpen || actionsOff}
                accessibilityLabel={checkInMode ? 'Done checking people in' : 'Check people in'}
                testID="roster-check-in"
              >
                {checkInMode ? 'DONE' : 'CHECK-IN'}
              </Button>
            </View>
            <Text variant="caption" muted>
              {checkInNote(v, now)}
            </Text>
          </View>

          {settle ? (
            <View className="flex-row items-start gap-space-3 bg-surface-raised p-space-4" role="region" aria-label="Payments" testID="roster-settlement">
              <Icon name={settle.kind === 'settled' ? 'check' : settle.kind === 'open' ? 'clock' : 'offline'} size={20} />
              <View className="flex-1 gap-space-1">
                <Text variant="title-sm">{settle.kind === 'not-connected' ? 'Payments aren’t connected' : settle.title}</Text>
                <Text variant="body-sm" muted>
                  {settle.kind === 'not-connected'
                    ? 'Nobody pays through Ojoro yet. Collect at the field and mark it here, and it shows in your payout.'
                    : (settle.note ?? (settle.kind === 'settled' ? 'Everyone in is paid for.' : 'Mark spots paid at the field as people pay.'))}
                </Text>
              </View>
            </View>
          ) : null}

          {firstError ? <InlineError message={errorMessage(ojoroErrorOf(firstError))} testID="roster-error" /> : null}

          <View role="region" aria-label="In">
            <Divider kind="strong" label={`IN · ${v.in_count}`} />
            {roster.isPending ? (
              <LoadingState label="Loading who's in" kinds={['strip', 'strip', 'strip']} />
            ) : roster.isError ? (
              <InlineError message={errorMessage(ojoroErrorOf(roster.error))} action="RETRY" onAction={() => void roster.refetch()} />
            ) : inRows.length === 0 ? (
              <Text variant="body-sm" muted className="py-space-4">
                Nobody's in yet. People join from the session's page once it opens.
              </Text>
            ) : (
              <ParticipantList>
                {shown.map((r) => {
                  const badge = rosterBadge(r);
                  const due = r.payment_status === 'due';
                  const action = checkInMode && !r.checked_in_at ? 'MARK IN' : due && !checkInMode ? 'MARK PAID' : undefined;
                  return (
                    <ParticipantRow
                      key={r.user_id}
                      person={{ name: r.display_name }}
                      meta={rosterMeta(r, tz, now)}
                      trailing={badge ? <Badge tone={badge.signal ? 'signal' : 'neutral'}>{badge.label}</Badge> : null}
                      {...(action
                        ? {
                            action,
                            actionLabel: `${action === 'MARK IN' ? 'Check in' : 'Mark paid at the field:'} ${r.display_name}`,
                            onAction: () => {
                              if (actionsOff) return;
                              if (action === 'MARK IN') checkIn.mutate(r.user_id);
                              else {
                                const intent = `paid:${r.user_id}`;
                                markPaid.mutate(
                                  { userId: r.user_id, key: intents.key(intent) },
                                  { onSettled: (_d, e) => intents.settle(intent, e) },
                                );
                              }
                            },
                          }
                        : null)}
                      onPress={() => router.push(`/profile/${r.user_id}` as Href)}
                      accessibilityHint={`Opens ${r.display_name}'s profile, where you can report or block`}
                      testID={`roster-in-${r.user_id}`}
                    />
                  );
                })}
              </ParticipantList>
            )}
            {inRows.length > SHOWN_AT_FIRST ? (
              <View className="mt-space-2 self-start">
                <Button
                  variant="ghost"
                  onPress={() => setShowAll((s) => !s)}
                  aria-expanded={showAll}
                  className="-ml-space-5"
                  testID="roster-show-all"
                >
                  {showAll ? 'SHOW FEWER' : `SHOW ALL ${inRows.length}`}
                </Button>
              </View>
            ) : null}
          </View>

          <View role="region" aria-label="Waitlist">
            <Divider kind="strong" label={`WAITLIST · ${v.waitlist_count}`} />
            {waitRows.length === 0 ? (
              <Text variant="body-sm" muted className="py-space-4">
                Nobody's waiting.
              </Text>
            ) : (
              <ParticipantList>
                {waitRows.map((r, i) => {
                  const reordering = order !== null;
                  const letIn = !reordering && spotOpen && !v.auto_fill_active;
                  return (
                    <ParticipantRow
                      key={r.user_id}
                      person={{ name: r.display_name }}
                      avatarSize="sm"
                      leading={
                        <View className="w-[28px]" accessibilityLabel={positionWord(i + 1)}>
                          <DisplayText size="xs">{String(i + 1)}</DisplayText>
                        </View>
                      }
                      meta={rosterMeta(r, tz, now)}
                      trailing={null}
                      {...(reordering
                        ? {
                            action: i === 0 ? 'DOWN' : 'UP',
                            actionLabel: `Move ${r.display_name} ${i === 0 ? 'down' : 'up'}`,
                            onAction: () => setOrder((o) => (o ? (i === 0 ? moveDown(o, i) : moveUp(o, i)) : o)),
                          }
                        : letIn
                          ? {
                              action: 'LET IN',
                              actionLabel: `Let ${r.display_name} in`,
                              onAction: () => {
                                if (actionsOff) return;
                                const intent = `promote:${r.user_id}`;
                                promote.mutate(
                                  { userId: r.user_id, key: intents.key(intent) },
                                  {
                                    onSettled: (_d, e) => intents.settle(intent, e),
                                    onSuccess: () => toast.show({ kind: 'success', message: `${firstName(r.display_name)} is in and has been told.` }),
                                  },
                                );
                              },
                            }
                          : null)}
                      onPress={() => router.push(`/profile/${r.user_id}` as Href)}
                      accessibilityHint={`Opens ${r.display_name}'s profile, where you can report or block`}
                      testID={`roster-wait-${r.user_id}`}
                    />
                  );
                })}
              </ParticipantList>
            )}
            <Text variant="body-sm" className="mt-space-4" testID="roster-waitlist-note">
              {waitlistNote(v)}
            </Text>
            <View className="mt-space-3 flex-row flex-wrap gap-space-2">
              {order ? (
                <>
                  <Button
                    variant="secondary"
                    disabled={actionsOff}
                    loading={reorder.isPending}
                    onPress={() =>
                      reorder.mutate(
                        order.map((r) => r.user_id),
                        { onSuccess: () => setOrder(null) },
                      )
                    }
                    testID="roster-save-order"
                  >
                    SAVE ORDER
                  </Button>
                  <Button variant="ghost" onPress={() => setOrder(null)} testID="roster-cancel-order">
                    CANCEL
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="secondary"
                    disabled={actionsOff || v.capacity >= 100}
                    loading={addSpot.isPending}
                    onPress={() =>
                      addSpot.mutate(intents.key('add-spot'), {
                        onSettled: (_d, e) => intents.settle('add-spot', e),
                        onSuccess: () => toast.show({ kind: 'success', message: `Added a spot. ${v.capacity + 1} can play.` }),
                      })
                    }
                    testID="roster-add-spot"
                  >
                    {addSpotLabel(v.capacity)}
                  </Button>
                  {waiting.length > 1 ? (
                    <Button variant="ghost" disabled={actionsOff} onPress={() => setOrder(waiting)} testID="roster-reorder">
                      REORDER
                    </Button>
                  ) : null}
                </>
              )}
            </View>
          </View>

          {dropped.length > 0 ? (
            <View role="region" aria-label="Dropped">
              <Divider label={`DROPPED · ${dropped.length}`} />
              <ParticipantList>
                {dropped.map((r) => (
                  <ParticipantRow
                    key={r.user_id}
                    person={{ name: r.display_name }}
                    meta={rosterMeta(r, tz, now)}
                    trailing={null}
                    onPress={() => router.push(`/profile/${r.user_id}` as Href)}
                    accessibilityHint={`Opens ${r.display_name}'s profile, where you can report or block`}
                    testID={`roster-dropped-${r.user_id}`}
                  />
                ))}
              </ParticipantList>
            </View>
          ) : null}

          {v.series_id ? (
            <Strip
              title="Series settings"
              titleVariant="title-sm"
              meta="Approval, waitlist, price and refunds"
              trailing="chevron"
              href={`/host/${programId}/series/${v.series_id}` as Href}
              testID="roster-series"
            />
          ) : null}
        </View>
      )}
    </Screen>
  );
}
