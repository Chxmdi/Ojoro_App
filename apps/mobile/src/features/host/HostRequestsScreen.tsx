/**
 * HostRequests (`/host/[programId]/session/[id]/requests`, HostRequests.png, PRD §13 approval
 * workflows): approve or decline each request with what the person has done on Ojoro, their note
 * and who you both know; undo for 10 minutes; LET THESE STRAIGHT IN rules. Areas only, never an
 * address. Declining is quiet. Calm.
 */
import { canUndo, type JoinRequestRow } from '@ojoro/contracts';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import {
  Avatar,
  Badge,
  Button,
  DisplayText,
  Divider,
  Icon,
  Progress,
  Quote,
  Screen,
  Switch,
  Text,
  TextButton,
  useToast,
} from '@/design-system';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { useOnline } from '../activities/data';
import { firstName } from '../activities/format';
import { InlineError, LoadingState, OfflineNote, ScreenHeader } from '../activities/ui';
import {
  useDecideRequest,
  useHostSessionRealtime,
  useIntentKeys,
  useSessionRequests,
  useSessionView,
  useUndoDecision,
  useUpdateRules,
} from './data';
import {
  approvalIntro,
  crewsRuleBody,
  decidedText,
  requestArea,
  requestContext,
  requestFacts,
  requestsCountLabel,
  requestsHeadline,
  sessionOverline,
} from './logic';
import { HostUnavailable } from './ui';

export function HostRequestsScreen({ programId, sessionId }: { programId: string; sessionId: string }) {
  const online = useOnline();
  const toast = useToast();
  const view = useSessionView(programId, sessionId);
  const v = view.data ?? null;
  const requests = useSessionRequests(programId, sessionId, !!v);
  useHostSessionRealtime(programId, sessionId, v?.activity_id);
  const decide = useDecideRequest(programId, sessionId);
  const undo = useUndoDecision(programId, sessionId);
  const rules = useUpdateRules(programId, sessionId);
  const intents = useIntentKeys();
  const [, tick] = useState(0);
  const now = new Date();

  useEffect(() => {
    track('screen_viewed', { screen: 'host_requests', program_id: programId, session_id: sessionId });
    // UNDO goes away when its 10 minutes are up.
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [programId, sessionId]);

  const rows = requests.data ?? [];
  // Pending first, then what was answered here; withdrawn requests aren't the host's to act on.
  const visible = rows.filter((r) => r.status !== 'withdrawn');
  const pending = visible.filter((r) => r.status === 'pending').length;
  const decided = visible.length - pending;
  const tz = v?.time_zone ?? 'America/Toronto';
  const overline = v ? `${v.name.toUpperCase()} · ${sessionOverline(v.starts_at, tz, now).split(' · ')[1] ?? ''}` : 'REQUESTS';
  const mutationError = [decide, undo, rules].find((m) => m.isError)?.error;

  const answer = (r: JoinRequestRow, approve: boolean) => {
    const intent = `decide:${r.request_id}:${approve}`;
    decide.mutate(
      { requestId: r.request_id, approve, key: intents.key(intent) },
      { onSettled: (_d, e) => intents.settle(intent, e) },
    );
  };

  return (
    <Screen situation="calm" scroll gutter={false}>
      <ScreenHeader overline={overline} fallback={`/host/${programId}` as Href} />
      {view.isPending && !v ? (
        <LoadingState label="Loading requests" kinds={['text', 'strip', 'strip']} />
      ) : !v ? (
        <HostUnavailable what="session" error={view.error} onRetry={() => void view.refetch()} />
      ) : (
        <View className="gap-space-10 px-space-5 pb-space-10 pt-space-4" testID="host-requests">
          {!online ? <OfflineNote dataUpdatedAt={requests.dataUpdatedAt || view.dataUpdatedAt} extra="Answers wait until you're back." /> : null}
          <View className="gap-space-3">
            <DisplayText size="lg" accessibilityRole="header" testID="requests-headline">
              {requests.data ? requestsHeadline(pending, decided) : requestsHeadline(v.asking_count, 0)}
            </DisplayText>
            <Text variant="body">{approvalIntro(v.approval_required)}</Text>
            <Progress value={v.in_count} max={v.capacity} label={`${v.in_count} of ${v.capacity} in`} />
            <Text variant="label" aria-live="polite" testID="requests-count">
              {requestsCountLabel(v.in_count, v.capacity, requests.data ? pending : v.asking_count)}
            </Text>
          </View>

          {mutationError ? <InlineError message={errorMessage(ojoroErrorOf(mutationError))} testID="requests-error" /> : null}

          {requests.isPending ? (
            <LoadingState label="Loading requests" kinds={['strip', 'strip']} />
          ) : requests.isError ? (
            <InlineError message={errorMessage(ojoroErrorOf(requests.error))} action="RETRY" onAction={() => void requests.refetch()} />
          ) : visible.length === 0 ? (
            <View className="gap-space-2" testID="requests-empty">
              <Text variant="title-sm">Nobody has asked to join this one.</Text>
              <Text variant="body-sm" muted>
                When approval is on, people who don't meet a rule below ask here first, and you hear about it.
              </Text>
            </View>
          ) : (
            visible.map((r) => {
              const open = r.status === 'pending';
              const area = requestArea(r);
              const first = firstName(r.display_name);
              return (
                <View
                  key={r.request_id}
                  className="gap-space-4 bg-surface-raised p-space-5"
                  role="article"
                  aria-label={`Request from ${r.display_name}`}
                  testID={`request-${r.user_id}`}
                >
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={`${r.display_name}${area ? `, ${area}` : ''}`}
                    accessibilityHint={`Opens ${r.display_name}'s profile, where you can report or block`}
                    onPress={() => router.push(`/profile/${r.user_id}` as Href)}
                    className="flex-row items-center gap-space-3"
                  >
                    <Avatar name={r.display_name} size="lg" />
                    <View className="flex-1 gap-space-1">
                      <Text variant="title">{r.display_name}</Text>
                      {area ? (
                        <Text variant="body-sm" muted>
                          {area}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                  {open ? (
                    <View className="gap-space-4">
                      {requestFacts(r).length > 0 ? (
                        <View className="flex-row flex-wrap gap-space-2">
                          {requestFacts(r).map((f) => (
                            <Badge key={f}>{f}</Badge>
                          ))}
                        </View>
                      ) : null}
                      {r.note ? <Quote>{r.note}</Quote> : null}
                      <Text variant="body-sm" muted>
                        {requestContext(r)}
                      </Text>
                      <View className="flex-row items-center gap-space-2">
                        <Button
                          className="flex-1"
                          disabled={!online}
                          onPress={() => answer(r, true)}
                          accessibilityLabel={`Approve ${r.display_name}`}
                          testID={`request-${r.user_id}-approve`}
                        >
                          APPROVE
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={!online}
                          onPress={() => answer(r, false)}
                          accessibilityLabel={`Decline ${r.display_name}`}
                          testID={`request-${r.user_id}-decline`}
                        >
                          DECLINE
                        </Button>
                      </View>
                      <Button
                        variant="ghost"
                        className="self-center"
                        href={`/profile/${r.user_id}` as Href}
                        accessibilityHint="Messages aren't built yet; their profile has what they've shared"
                        testID={`request-${r.user_id}-profile`}
                      >
                        {`SEE ${first.toUpperCase()}’S PROFILE`}
                      </Button>
                    </View>
                  ) : (
                    <View className="flex-row items-center gap-space-3" accessibilityLiveRegion="polite">
                      <Icon name={r.status === 'approved' ? 'check' : 'close'} label={r.status === 'approved' ? 'Approved' : 'Declined'} />
                      <Text variant="body-sm" className="flex-1" testID={`request-${r.user_id}-done`}>
                        {decidedText(r)}
                      </Text>
                      {r.approved_via !== null && r.approved_via !== 'host' ? null : canUndo(r.undo_until, now) ? (
                        <TextButton
                          accessibilityLabel={`Undo the answer to ${r.display_name}`}
                          disabled={!online}
                          onPress={() => undo.mutate(r.request_id)}
                          testID={`request-${r.user_id}-undo`}
                        >
                          UNDO
                        </TextButton>
                      ) : null}
                    </View>
                  )}
                </View>
              );
            })
          )}

          <View role="region" aria-label="Approve automatically">
            <Divider kind="strong" label="LET THESE STRAIGHT IN" />
            <Switch
              label="People who've played with you"
              description="Anyone who checked in to one of your sessions before."
              value={v.rule_played_with}
              disabled={!online}
              onValueChange={(on) => rules.mutate({ played_with: on }, { onSuccess: () => toast.show({ kind: 'success', message: on ? 'They get in straight away now.' : 'They ask first now.' }) })}
            />
            <Switch
              label="3 or more checked-in games"
              description="Anyone who has shown up to at least 3 Ojoro games, anywhere."
              value={v.rule_experienced}
              disabled={!online}
              onValueChange={(on) => rules.mutate({ experienced: on })}
            />
            <Switch
              label="Your Crews"
              description={crewsRuleBody(v.crew_names)}
              value={v.rule_crews}
              disabled={!online}
              onValueChange={(on) => rules.mutate({ crews: on })}
            />
            <Text variant="caption" muted className="mt-space-4">
              Declining is quiet. They're told you couldn't take them this time and shown similar sessions nearby.
            </Text>
          </View>
        </View>
      )}
    </Screen>
  );
}
