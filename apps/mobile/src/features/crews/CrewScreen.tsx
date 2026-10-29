/**
 * `/crew/[id]`: a minimal stand-in for CrewHome (CrewHome.png is step 6: who's free, the Down For
 * board, rituals, crew-vs-crew and momentum are not built). It shows what the chat needs: the
 * crew's name and size, CHAT, the members (each opens their profile, where report and block live),
 * the invite code for owners and admins, and LEAVE THE CREW. docs/DESIGN_DECISIONS.md, Step 4
 * screens.
 */
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Share, View } from 'react-native';

import {
  Badge,
  Button,
  DisplayText,
  Divider,
  loadingProps,
  Modal,
  ParticipantList,
  ParticipantRow,
  Screen,
  Skeleton,
  Text,
  TextButton,
  useToast,
} from '@/design-system';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { useOnline } from '../activities/data';
import { InlineError, OfflineNote, ScreenHeader } from '../activities/ui';
import { CrewUnavailable } from './CrewChatScreen';
import { useCrewRealtime, useCrewRoster, useCrewView, useInviteCode, useLeaveCrew, useRotateCode } from './data';
import { crewCaption, inviteText, isCrewAdmin, leaveBody, roleLabel } from './logic';

export function CrewScreen({ id }: { id: string }) {
  const online = useOnline();
  const toast = useToast();
  useCrewRealtime(id);
  const view = useCrewView(id);
  const crew = view.data ?? null;
  const roster = useCrewRoster(id, !!crew);
  const admin = isCrewAdmin(crew?.my_role);
  const code = useInviteCode(id, !!crew && admin);
  const rotate = useRotateCode(id);
  const leave = useLeaveCrew(id);
  const [confirm, setConfirm] = useState<'leave' | 'rotate' | null>(null);

  useEffect(() => {
    track('screen_viewed', { screen: 'crew', crew_id: id });
  }, [id]);

  const share = async (value: string) => {
    if (!crew) return;
    track('crew_code_shared', { crew_id: id });
    try {
      await Share.share({ message: inviteText(crew.name, value) });
    } catch {
      toast.show({ kind: 'error', message: `Sharing isn't available here. The code is ${value}.` });
    }
  };

  return (
    <Screen situation="calm" scroll gutter={false}>
      <ScreenHeader overline="CREW" fallback={'/crew' as Href} />
      {view.isPending && !crew ? (
        <View className="gap-space-6 px-space-5 pt-space-6" {...loadingProps('Loading the crew')}>
          <Skeleton kind="text" />
          <Skeleton kind="strip" />
          <Skeleton kind="strip" />
        </View>
      ) : !crew ? (
        <CrewUnavailable error={view.error} onRetry={() => void view.refetch()} />
      ) : (
        <View className="gap-space-8 px-space-5 pb-space-10 pt-space-4" testID="crew-screen">
          {!online ? <OfflineNote dataUpdatedAt={view.dataUpdatedAt} extra="Leaving and new codes need a connection." /> : null}
          <View className="gap-space-2">
            <DisplayText size="md" accessibilityRole="header" testID="crew-name">
              {crew.name.toUpperCase()}
            </DisplayText>
            <Text variant="body-sm" muted>
              {crewCaption(crew)}
            </Text>
            <Text variant="caption" muted>
              Private. Only people in the crew see it. More of this page is coming.
            </Text>
          </View>
          <Button block href={`/crew/${id}/chat` as Href} testID="crew-chat">
            CHAT
          </Button>

          {admin ? (
            // crew_view is members-only, so this page is always your own crew: an open crew
            // Call-Out any other crew's owner or admins can accept (Step 5 screens: A).
            <View className="flex-row flex-wrap items-center gap-space-3">
              <Button
                variant="secondary"
                href={`/challenge/new?myCrew=${encodeURIComponent(id)}&myCrewName=${encodeURIComponent(crew.name)}` as Href}
                disabled={!online}
                testID="crew-call-out"
              >
                CALL OUT
              </Button>
              <Text variant="body-sm" muted className="shrink">
                Challenge another crew. No stakes, ever.
              </Text>
            </View>
          ) : null}

          {admin ? (
            <View className="gap-space-3" role="region" aria-label="Invite code">
              <Divider label="INVITE CODE" />
              {code.isPending ? (
                <Skeleton kind="text" />
              ) : code.data ? (
                <>
                  <Text variant="display-sm" testID="crew-code" selectable>
                    {code.data}
                  </Text>
                  <Text variant="caption" muted>
                    Anyone with the code can join. Share it with people you want in; get a new one to stop the old one working.
                  </Text>
                  <View className="flex-row flex-wrap items-center gap-space-4">
                    <Button variant="secondary" onPress={() => void share(code.data!)} testID="crew-share-code">
                      SHARE THE CODE
                    </Button>
                    <TextButton onPress={() => setConfirm('rotate')} disabled={!online} testID="crew-rotate-code">
                      NEW CODE
                    </TextButton>
                  </View>
                </>
              ) : code.isError ? (
                <InlineError message={errorMessage(ojoroErrorOf(code.error))} action="RETRY" onAction={() => void code.refetch()} />
              ) : null}
              {rotate.isError ? <InlineError message={errorMessage(ojoroErrorOf(rotate.error))} /> : null}
            </View>
          ) : null}

          <View className="gap-space-2" role="region" aria-label="Members">
            <Divider label={`MEMBERS · ${crew.member_count}`} />
            {roster.isPending ? (
              <View {...loadingProps('Loading members')}>
                <Skeleton kind="strip" />
              </View>
            ) : roster.isError ? (
              <InlineError message={errorMessage(ojoroErrorOf(roster.error))} action="RETRY" onAction={() => void roster.refetch()} />
            ) : (
              <ParticipantList>
                {(roster.data ?? []).map((m) => {
                  const role = roleLabel(m.role);
                  const games = m.games_with_me ? `${m.games_with_me} ${m.games_with_me === 1 ? 'game' : 'games'} with you` : null;
                  return (
                    <ParticipantRow
                      key={m.user_id}
                      person={{ name: m.display_name }}
                      meta={[m.is_me ? 'You' : null, role, games].filter(Boolean).join(' · ') || undefined}
                      trailing={role ? <Badge>{role.toUpperCase()}</Badge> : null}
                      {...(m.is_me
                        ? null
                        : {
                            onPress: () => router.push(`/profile/${m.user_id}` as Href),
                            accessibilityHint: `Opens ${m.display_name}'s profile, where you can report or block`,
                          })}
                      testID={`crew-member-${m.user_id}`}
                    />
                  );
                })}
              </ParticipantList>
            )}
            {(roster.data?.length ?? 0) < crew.member_count ? (
              <Text variant="caption" muted>
                Some members aren't shown to you.
              </Text>
            ) : null}
            <Text variant="caption" muted>
              To report or block someone, open their profile, or press and hold their message in the chat.
            </Text>
          </View>

          <View className="items-start">
            <Button variant="ghost" onPress={() => setConfirm('leave')} disabled={!online} testID="crew-leave">
              LEAVE THE CREW
            </Button>
            {leave.isError ? <InlineError message={errorMessage(ojoroErrorOf(leave.error))} testID="crew-leave-error" /> : null}
          </View>
        </View>
      )}
      <Modal
        visible={confirm === 'leave'}
        title="LEAVE THE CREW?"
        body={crew ? leaveBody(crew) : ''}
        confirm="LEAVE"
        cancel="STAY"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          leave.mutate(undefined, {
            onSuccess: () => {
              toast.show({ kind: 'success', message: `You left ${crew?.name ?? 'the crew'}.` });
              router.replace('/crew' as Href);
            },
          });
        }}
      />
      <Modal
        visible={confirm === 'rotate'}
        title="NEW INVITE CODE?"
        body="The old code stops working at once. People already in the crew stay in."
        confirm="NEW CODE"
        cancel="KEEP THIS ONE"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          rotate.mutate();
        }}
      />
    </Screen>
  );
}
