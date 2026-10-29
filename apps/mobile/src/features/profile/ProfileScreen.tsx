import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import {
  Avatar,
  Badge,
  Button,
  DisplayText,
  Divider,
  IconButton,
  loadingProps,
  PassportStamp,
  Screen,
  Sheet,
  Situation,
  Skeleton,
  Strip,
  StripList,
  Text,
  TextButton,
  useToast,
} from '@/design-system';
import { YourCrews } from '@/features/crews/CrewsScreens';
import { useReportBlock } from '@/features/safety';
import { firstName } from '@/features/safety/reasons';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf, rpc } from '@/lib/rpc';
import { signOutWithPush } from '@/lib/push';

import {
  profileKeys,
  useAvailabilityOverlap,
  useMyBlocks,
  usePassport,
  useProfileReputation,
  useProfileSports,
  useProfileView,
} from './data';
import {
  formatHours,
  gamesWithMe,
  overlapLine,
  ownAvailabilityLine,
  passportHeadline,
  reputationLabel,
  sportMeta,
  stampFor,
  visibilityLine,
} from './logic';
import { InlineError, OfflineNote, PrivacyNote, useIsOnline } from './states';

const tabular = { fontVariant: ['tabular-nums' as const] };

/**
 * The physical identity profile (You.png). `self` is the You tab; otherwise `profile/[id]` with
 * the friend/public/blocked views of PRD §9.1, all decided by the server (`profile_view`,
 * `profile_sports`, `profile_reputation`, `availability_overlap`, `passport_entries` RLS).
 * Goal, ID verification, Crews, Clans and hosting have no Slice 01 data and aren't shown.
 */
export function ProfileScreen({ userId, self }: { userId: string; self: boolean }) {
  const online = useIsOnline();
  const view = useProfileView(userId);
  const profile = view.data ?? null;
  const viewed = useRef(false);

  useEffect(() => {
    if (!profile || viewed.current) return;
    viewed.current = true;
    track('profile_viewed', {
      relation: profile.is_me ? 'self' : 'other',
      history_visible: profile.history_visible,
      sports_visible: profile.sports_visible,
    });
  }, [profile]);

  // Opening your own id from a link shows the You tab.
  useEffect(() => {
    if (!self && profile?.is_me) router.replace('/you');
  }, [self, profile?.is_me]);

  const reportBlock = useReportBlock({ onBlocked: () => void view.refetch() });
  const [settingsOpen, setSettingsOpen] = useState(false);

  const header = self ? (
    <View className="flex-row items-center justify-between pl-space-5 pr-space-2 pt-space-3">
      <Text variant="overline">YOU · PHYSICAL IDENTITY</Text>
      <IconButton icon="more" label="Settings and privacy" onPress={() => setSettingsOpen(true)} />
    </View>
  ) : (
    <View className="flex-row items-center justify-between px-space-2 pt-space-2">
      <IconButton
        icon="back"
        label="Back"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
      {profile ? (
        <IconButton
          icon="more"
          label={`Report or block ${profile.display_name}`}
          testID="profile-report-block"
          onPress={() =>
            reportBlock.open({
              subjectKind: 'profile',
              subjectId: userId,
              personName: profile.display_name,
            })
          }
        />
      ) : null}
    </View>
  );

  let body: ReactNode;
  if (view.isPending) {
    body = <ProfileSkeleton />;
  } else if (!profile && view.isError) {
    body = (
      <InlineError
        message={errorMessage(ojoroErrorOf(view.error))}
        action="TRY AGAIN"
        onAction={() => void view.refetch()}
      />
    );
  } else if (!profile) {
    body = self ? (
      <InlineError message="We can't load your profile right now." action="TRY AGAIN" onAction={() => void view.refetch()} />
    ) : (
      <UnavailableProfile userId={userId} />
    );
  } else {
    body = <ProfileBody profile={profile} self={self} onReportBlock={() =>
      reportBlock.open({ subjectKind: 'profile', subjectId: userId, personName: profile.display_name })
    } />;
  }

  return (
    <Screen situation="calm" scroll gutter={false}>
      {header}
      <View className="gap-space-10 px-space-5 pb-space-10 pt-space-3">
        {!online && profile ? (
          <OfflineNote
            dataUpdatedAt={view.dataUpdatedAt}
            what={self ? 'your profile' : 'this profile'}
            extra={self ? 'Changes wait until you are back.' : 'Report and block send when you are back.'}
          />
        ) : null}
        {body}
      </View>
      {reportBlock.sheet}
      {self ? <SettingsSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} /> : null}
    </Screen>
  );
}

type ProfileRow = NonNullable<ReturnType<typeof useProfileView>['data']>;

function ProfileBody({
  profile,
  self,
  onReportBlock,
}: {
  profile: ProfileRow;
  self: boolean;
  onReportBlock: () => void;
}) {
  const id = profile.user_id;
  const first = firstName(profile.display_name ?? '');
  const sports = useProfileSports(id, profile.sports_visible);
  const reputation = useProfileReputation(id);
  const availability = useAvailabilityOverlap(id, profile.availability_visible);
  const passport = usePassport(id, profile.history_visible);
  const together = gamesWithMe(profile.games_with_me);
  const meta = [profile.handle ? `@${profile.handle}` : null, profile.area].filter(Boolean).join(' · ');

  return (
    <>
      <View className="gap-space-4" aria-label="Profile">
        <View className="flex-row items-center gap-space-4">
          <Avatar name={profile.display_name ?? ''} size="lg" />
          <View className="flex-1 gap-space-1" style={{ gap: 6 }}>
            <DisplayText size="md" accessibilityRole="header" testID="profile-name">
              {(profile.display_name ?? '').toUpperCase()}
            </DisplayText>
            {meta ? (
              <Text variant="body-sm" muted>
                {meta}
              </Text>
            ) : null}
            {!self && together ? (
              <Text variant="body-sm" style={tabular}>
                {together}
              </Text>
            ) : null}
          </View>
        </View>

        {profile.history_visible ? (
          <View className="flex-row gap-space-3 border-t border-line pt-space-4">
            <Stat value={formatHours(profile.ojoro_hours)} label="Ojoro hours" />
            <Stat value={String(profile.sessions ?? 0)} label="Sessions" />
            <Stat value={String(profile.people_moved_with ?? 0)} label="People moved with" />
          </View>
        ) : (
          <View className="border-t border-line pt-space-4">
            <PrivacyNote>{`${first} keeps their games and Passport to a smaller circle.`}</PrivacyNote>
          </View>
        )}

        {self ? (
          <View className="gap-space-1">
            <Text variant="caption" muted testID="visibility-line">
              {visibilityLine({
                sports: profile.sports_visibility,
                history: profile.history_visibility,
                availability: profile.availability_visibility,
              })}
            </Text>
            <TextButton onPress={() => router.push('/settings/privacy')} testID="edit-visibility">
              EDIT VISIBILITY
            </TextButton>
          </View>
        ) : null}
      </View>

      <View className="gap-space-2" aria-label={self ? 'What I do' : `What ${first} does`}>
        <Divider label={self ? 'WHAT I DO' : 'WHAT THEY DO'} />
        {!profile.sports_visible ? (
          <PrivacyNote>{`${first} shares their sports with fewer people.`}</PrivacyNote>
        ) : sports.isPending ? (
          <View {...loadingProps('Loading sports')}>
            <Skeleton kind="strip" />
          </View>
        ) : sports.isError && !sports.data ? (
          <InlineError
            message={errorMessage(ojoroErrorOf(sports.error))}
            action="TRY AGAIN"
            onAction={() => void sports.refetch()}
          />
        ) : sports.data && sports.data.length > 0 ? (
          <StripList>
            {sports.data.map((s) => (
              <Strip
                key={s.sport_id}
                title={s.sport_name}
                meta={sportMeta(s, self) ?? undefined}
                trailing={
                  s.is_main ? (
                    <Badge tone="signal">MAIN</Badge>
                  ) : self && s.level === 'learning' ? (
                    <Badge>LEARNING</Badge>
                  ) : undefined
                }
              />
            ))}
          </StripList>
        ) : (
          <Text variant="body-sm" muted>
            {self ? 'No sports on your profile yet.' : `${first} hasn't added any sports yet.`}
          </Text>
        )}
      </View>

      {self ? <YourCrews /> : null}

      <ReputationSection self={self} rows={reputation.data ?? []} />

      {self || profile.history_visible ? (
        <PassportBlock
          stamps={passport.data?.count ?? 0}
          places={profile.places ?? 0}
          people={profile.people_moved_with ?? 0}
          recent={passport.data?.recent ?? []}
          loading={passport.isPending}
          self={self}
        />
      ) : null}

      <AvailabilityLine self={self} profile={profile} rows={availability.data} />

      {!self ? (
        <View className="items-start border-t border-line pt-space-4">
          <TextButton onPress={onReportBlock} testID="profile-report-block-link">
            REPORT OR BLOCK
          </TextButton>
        </View>
      ) : null}
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View className="flex-1" accessible accessibilityLabel={`${value} ${label}`}>
      <DisplayText size="sm" style={tabular}>
        {value}
      </DisplayText>
      <Text variant="caption" muted>
        {label}
      </Text>
    </View>
  );
}

function ReputationSection({
  self,
  rows,
}: {
  self: boolean;
  rows: readonly { kind: Parameters<typeof reputationLabel>[0]; confirmations: number }[];
}) {
  // Others: nothing until a signal has 5 confirmations (the server returns only those).
  if (!self && rows.length === 0) return null;
  return (
    <View className="gap-space-3" aria-label="Reputation">
      <Divider label="REPUTATION" />
      {rows.length > 0 ? (
        <View className="flex-row flex-wrap gap-space-2">
          {rows.map((r) => (
            <Badge key={r.kind} tone="verified">
              {reputationLabel(r.kind, r.confirmations)}
            </Badge>
          ))}
        </View>
      ) : null}
      {self ? (
        <Text variant="caption" muted>
          {"From people you've played with. A signal only appears after 5 confirmations."}
        </Text>
      ) : null}
    </View>
  );
}

function PassportBlock({
  stamps,
  places,
  people,
  recent,
  loading,
  self,
}: {
  stamps: number;
  places: number;
  people: number;
  recent: import('./data').PassportSummary['recent'];
  loading: boolean;
  self: boolean;
}) {
  const lines = passportHeadline(stamps, places, people);
  return (
    <Situation
      id="after"
      className="-mx-space-5 px-space-5 py-space-6"
      style={{ paddingVertical: 28, gap: 20 }}
      accessible={!loading}
      accessibilityLabel={`Passport: ${lines.join(' ')}`}
      testID="passport-block"
    >
      <Text variant="overline">PASSPORT</Text>
      <DisplayText size="md" style={tabular}>
        {lines.join('\n')}
      </DisplayText>
      {recent.length > 0 ? (
        <View className="flex-row justify-center gap-space-2">
          {recent.map((entry, i) => {
            const stamp = stampFor(entry, entry.place_time_zone ?? undefined);
            return (
              <PassportStamp
                key={entry.id}
                title={stamp.title}
                place={stamp.place}
                date={stamp.date}
                kind={stamp.kind}
                tilt={i === 0}
              />
            );
          })}
        </View>
      ) : loading ? null : (
        <Text variant="body-sm">
          {self ? 'No stamps yet. Your first game adds one.' : 'No stamps yet.'}
        </Text>
      )}
    </Situation>
  );
}

function AvailabilityLine({
  self,
  profile,
  rows,
}: {
  self: boolean;
  profile: ProfileRow;
  rows: { day_of_week: number; part: 'morning' | 'midday' | 'evening' }[] | undefined;
}) {
  if (self) {
    return (
      <Text variant="caption" muted testID="availability-line">
        {ownAvailabilityLine(rows ?? [], profile.availability_visibility)}
      </Text>
    );
  }
  if (!profile.availability_visible || !rows) return null;
  const line = overlapLine(rows);
  return line ? (
    <Text variant="caption" muted testID="availability-line">
      {line}
    </Text>
  ) : null;
}

function ProfileSkeleton() {
  return (
    <View className="gap-space-6" {...loadingProps('Loading profile')}>
      <Skeleton kind="text" lines={3} />
      <Skeleton kind="strip" />
      <Skeleton kind="strip" />
      <Skeleton kind="strip" />
    </View>
  );
}

/**
 * No profile row: blocked either way, or no such person. If you blocked them, say so and offer
 * UNBLOCK; otherwise the same words for every case, so a block on their side stays private.
 */
function UnavailableProfile({ userId }: { userId: string }) {
  const blocks = useMyBlocks();
  const queryClient = useQueryClient();
  const toast = useToast();
  const mine = blocks.data?.find((b) => b.user_id === userId);
  const unblock = useMutation({
    mutationFn: () => rpc('unblock_user', { p_user_id: userId }),
    onSuccess: () => {
      track('user_unblocked', { from: 'profile' });
      void queryClient.invalidateQueries();
      toast.show({ kind: 'success', message: `Unblocked ${firstName(mine?.display_name ?? '')}.` });
    },
    onError: (e) => toast.show({ kind: 'error', message: errorMessage(ojoroErrorOf(e)) }),
  });

  if (mine) {
    return (
      <View className="gap-space-4" testID="profile-blocked">
        <DisplayText size="sm" accessibilityRole="header">
          {`YOU BLOCKED ${firstName(mine.display_name).toUpperCase()}.`}
        </DisplayText>
        <Text variant="body">
          {"You don't see each other's profiles, plans or games. They aren't told."}
        </Text>
        <Button
          variant="secondary"
          onPress={() => unblock.mutate()}
          loading={unblock.isPending}
          className="self-start"
          testID="profile-unblock"
        >
          UNBLOCK
        </Button>
      </View>
    );
  }
  return (
    <View className="gap-space-3" testID="profile-unavailable">
      <DisplayText size="sm" accessibilityRole="header">
        {"THIS PROFILE ISN'T AVAILABLE."}
      </DisplayText>
      <Text variant="body" muted>
        It may have been removed, or it isn't shown to you.
      </Text>
    </View>
  );
}

/** The You header's more button: privacy, blocked people, sign out. Not designed. */
function SettingsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const go = (href: '/settings/privacy' | '/settings/blocked' | '/settings/area' | '/settings/notifications') => {
    onClose();
    router.push(href);
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Settings and privacy"
      actions={
        <Button
          variant="secondary"
          block
          testID="sign-out"
          onPress={() => {
            onClose();
            void signOutWithPush();
          }}
        >
          SIGN OUT
        </Button>
      }
    >
      <StripList>
        <Strip
          title="Who sees what"
          titleVariant="title-sm"
          meta="Sports, Passport and free times"
          trailing="chevron"
          onPress={() => go('/settings/privacy')}
        />
        <Strip
          title="Your area"
          titleVariant="title-sm"
          meta="The neighbourhood Ojoro shows things around"
          trailing="chevron"
          onPress={() => go('/settings/area')}
          testID="settings-area"
        />
        <Strip
          title="Notifications"
          titleVariant="title-sm"
          meta="Quiet hours, lock screen, what pushes"
          trailing="chevron"
          onPress={() => go('/settings/notifications')}
          testID="settings-notifications"
        />
        <Strip
          title="Blocked people"
          titleVariant="title-sm"
          meta="Unblock someone"
          trailing="chevron"
          onPress={() => go('/settings/blocked')}
        />
      </StripList>
    </Sheet>
  );
}

export { profileKeys };
