/**
 * `/crew/[id]`: Crew Home (design-handoff/screens/CrewHome.png, calm; PRD §9.10, §9.12;
 * docs/COMMUNITIES_CONTRACT.md, Crew Home). Header CREW · PRIVATE with the chat and its new count;
 * CrewMomentum (name, faces, eight weeks of rhythm, NEXT with I'M DOWN); FREE TONIGHT as overlap
 * only; the crew's DOWN FOR board; the RITUAL (or a Make This a Ritual suggestion); CREW VS CREW with
 * CALL OUT for owners and admins; MEMORIES; OPEN CREW CHAT. Below the design, what Step 4's crew page
 * already did and still has to live somewhere: members (each opens their profile, where block
 * lives), the invite code for owners and admins, REPORT THE CREW and LEAVE THE CREW
 * (docs/DESIGN_DECISIONS.md, Step 6 SCR-COMMUNITIES).
 */
import { momentumHeadline, type CrewDownFor, type CrewHome, type CrewRitual, type MomentumState } from '@ojoro/contracts';
import { router, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Share, View } from 'react-native';

import {
  AvatarCluster,
  Avatar,
  Badge,
  Button,
  CrewMomentum,
  DisplayText,
  Divider,
  IconButton,
  Image,
  loadingProps,
  Modal,
  ParticipantList,
  ParticipantRow,
  Screen,
  Skeleton,
  Strip,
  Text,
  TextButton,
  useToast,
} from '@/design-system';
import { useUserId } from '@/lib/auth';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { newIdempotencyKey } from '@/lib/idempotency';
import { ojoroErrorOf } from '@/lib/rpc';
import { useReportBlock } from '@/features/safety';

import { useOnline } from '../activities/data';
import { InlineError, LoadingState, OfflineNote, PrivacyNote, ScreenHeader } from '../activities/ui';
import { useImDown, useNow } from '../plans/data';
import { CrewUnavailable } from './CrewChatScreen';
import { useCrewRoster, useInviteCode, useLeaveCrew, useRotateCode } from './data';
import {
  useCreateRitual,
  useCrewDownFor,
  useCrewFreeTonight,
  useCrewHome,
  useCrewHomeRealtime,
  useCrewMemories,
  useCrewRituals,
  useCrewVersus,
  useJoinDownFor,
  useSkipRitualWeek,
} from './homeData';
import {
  canJoinDownFor,
  canSkipWeek,
  chatButtonLabel,
  chatIconLabel,
  downForMeta,
  downForTitle,
  freeTonightLine,
  memoryCaption,
  nextLine,
  ritualHeadline,
  ritualLine,
  ritualSuggestion,
  ritualWeek,
  suggestionTitle,
  versusRow,
} from './homeLogic';
import { inviteText, isCrewAdmin, leaveBody, roleLabel } from './logic';

/** Members listed before ALL n MEMBERS. */
const MEMBERS_SHOWN = 5;

const chatHref = (id: string) => `/crew/${id}/chat` as Href;

export function CrewScreen({ id }: { id: string }) {
  const online = useOnline();
  useCrewHomeRealtime(id);
  const home = useCrewHome(id);
  const crew = home.data ?? null;
  const reportBlock = useReportBlock({ onBlocked: () => void home.refetch() });

  useEffect(() => {
    track('screen_viewed', { screen: 'crew_home', crew_id: id });
    track('crew_viewed', { crew_id: id });
  }, [id]);

  return (
    <Screen situation="calm" scroll gutter={false}>
      <ScreenHeader
        overline="CREW · PRIVATE"
        fallback={'/crew' as Href}
        right={
          <IconButton
            icon="chat"
            label={chatIconLabel(crew?.unread_count ?? 0)}
            count={crew?.unread_count ?? 0}
            onPress={() => {
              track('crew_chat_opened', { crew_id: id, from: 'header' });
              router.push(chatHref(id));
            }}
            testID="crew-header-chat"
          />
        }
      />
      {home.isPending && !crew ? (
        <LoadingState label="Loading the crew" kinds={['text', 'object', 'strip', 'strip']} />
      ) : !crew ? (
        <CrewUnavailable error={home.error} onRetry={() => void home.refetch()} />
      ) : (
        <CrewBody
          id={id}
          crew={crew}
          online={online}
          dataUpdatedAt={home.dataUpdatedAt}
          onReport={() => reportBlock.open({ subjectKind: 'crew', subjectId: id, personName: crew.name })}
        />
      )}
      {reportBlock.sheet}
    </Screen>
  );
}

function CrewBody({
  id,
  crew,
  online,
  dataUpdatedAt,
  onReport,
}: {
  id: string;
  crew: CrewHome;
  online: boolean;
  dataUpdatedAt: number;
  onReport: () => void;
}) {
  const now = useNow([crew.next_starts_at]);
  const tz = crew.time_zone;
  const roster = useCrewRoster(id);
  const imDown = useImDown(crew.next_plan_id ?? '');
  const next = nextLine(crew, now, tz);
  const faces = (roster.data ?? []).slice(0, 5).map((m) => ({ name: m.display_name }));

  return (
    <View className="gap-space-10 px-space-5 pb-space-10 pt-space-4" testID="crew-screen">
      {!online ? (
        <OfflineNote dataUpdatedAt={dataUpdatedAt} extra="I'M DOWN and changes wait until you're back." />
      ) : null}

      <View className="gap-space-2">
        <CrewMomentum
          crew={crew.name.toUpperCase()}
          memberCount={crew.member_count}
          members={faces}
          weeks={crew.weeks}
          streak={crew.streak_weeks}
          next={next ?? undefined}
          joined={!!crew.next_i_am_in || imDown.isSuccess}
          joining={imDown.isPending}
          onDown={
            crew.next_plan_id && online
              ? () =>
                  imDown.tap({
                    onSuccess: () => track('crew_next_joined', { crew_id: id, plan_id: crew.next_plan_id }),
                  })
              : undefined
          }
          testID="crew-momentum"
        />
        <MomentumNote momentum={crew.momentum as MomentumState} streak={crew.streak_weeks} perWeek={crew.rhythm_per_week} />
        {crew.next_plan_id && (crew.next_i_am_in || imDown.isSuccess) ? (
          <TextButton onPress={() => router.push(`/plan/${crew.next_plan_id}` as Href)} className="self-start" testID="crew-next-open">
            SEE THE PLAN
          </TextButton>
        ) : null}
        {imDown.isError ? <InlineError message={errorMessage(ojoroErrorOf(imDown.error))} /> : null}
      </View>

      <FreeTonight id={id} count={crew.free_tonight} />
      <DownForBoard id={id} timeZone={tz} now={now} online={online} />
      <RitualSection id={id} crew={crew} online={online} />
      <VersusSection id={id} crew={crew} now={now} online={online} />
      <Memories id={id} timeZone={tz} />

      <Button
        variant="secondary"
        block
        onPress={() => {
          track('crew_chat_opened', { crew_id: id, from: 'button' });
          router.push(chatHref(id));
        }}
        testID="crew-chat"
      >
        {chatButtonLabel(crew.unread_count)}
      </Button>

      <CrewAdmin id={id} crew={crew} online={online} roster={roster} onReport={onReport} />
    </View>
  );
}

/** Rhythm never shames: a missed week reads as a comeback, the first weeks as a start. */
function MomentumNote({ momentum, streak, perWeek }: { momentum: MomentumState; streak: number; perWeek: number }) {
  if (momentum === 'on_rhythm' && streak > 0) return null;
  const head = momentumHeadline(momentum, streak);
  const sessions = `${perWeek} ${perWeek === 1 ? 'session' : 'sessions'} a week`;
  const body =
    momentum === 'comeback'
      ? `The crew aims for ${sessions}. One this week and the rhythm is back.`
      : `The crew aims for ${sessions}. Every game together counts.`;
  return (
    <Text variant="body-sm" muted testID="crew-momentum-note">
      {`${head[0]}${head.slice(1).toLowerCase()}. ${body}`}
    </Text>
  );
}

function FreeTonight({ id, count }: { id: string; count: number }) {
  const free = useCrewFreeTonight(id, count > 0);
  const people = free.data ?? [];
  const line = freeTonightLine(
    people.map((p) => p.display_name),
    count,
  );
  return (
    <View className="gap-space-3" role="region" aria-label="Free tonight" testID="crew-free-tonight">
      <Divider label="FREE TONIGHT" />
      {count > 0 && free.isPending ? (
        <Skeleton kind="text" />
      ) : line ? (
        <View className="flex-row items-center gap-space-3">
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <AvatarCluster people={people.map((p) => ({ name: p.display_name }))} total={count} max={4} size="md" />
          </View>
          <Text variant="body-sm" className="flex-1">
            {line}
          </Text>
        </View>
      ) : (
        <Text variant="body-sm" muted>
          Nobody in the crew has said they're usually free this evening.
        </Text>
      )}
      <Text variant="caption" muted>
        Shown as overlap only. Nobody's calendar is visible.
      </Text>
    </View>
  );
}

function DownForBoard({ id, timeZone, now, online }: { id: string; timeZone: string; now: Date; online: boolean }) {
  const board = useCrewDownFor(id, true);
  const join = useJoinDownFor(id);
  const rows = board.data ?? [];
  return (
    <View className="gap-space-1" role="region" aria-label="Down for board" testID="crew-down-for">
      <Divider label="DOWN FOR" />
      {board.isPending ? (
        <View {...loadingProps('Loading the board')}>
          <Skeleton kind="strip" />
        </View>
      ) : board.isError && rows.length === 0 ? (
        <InlineError message={errorMessage(ojoroErrorOf(board.error))} action="RETRY" onAction={() => void board.refetch()} />
      ) : rows.length === 0 ? (
        <View className="gap-space-3 pt-space-2">
          <Text variant="body-sm" muted testID="crew-down-for-empty">
            Nobody in the crew has said what they're down for. Say it and the crew sees it here.
          </Text>
          <TextButton onPress={() => router.push('/create' as Href)} className="self-start">
            SAY WHAT YOU'RE DOWN FOR
          </TextButton>
        </View>
      ) : (
        rows.map((row) => <DownForRow key={row.signal_id} row={row} timeZone={timeZone} now={now} online={online} join={join} />)
      )}
      {join.isError ? <InlineError message={errorMessage(ojoroErrorOf(join.error))} /> : null}
    </View>
  );
}

function DownForRow({
  row,
  timeZone,
  now,
  online,
  join,
}: {
  row: CrewDownFor;
  timeZone: string;
  now: Date;
  online: boolean;
  join: ReturnType<typeof useJoinDownFor>;
}) {
  const title = downForTitle(row, now, timeZone);
  const meta = downForMeta(row, now, timeZone);
  const open = canJoinDownFor(row);
  const pending = join.isPending && join.variables === row.signal_id;
  return (
    <View className="min-h-[64px] flex-row items-center gap-space-3 border-b border-line py-space-2" testID={`crew-down-for-${row.signal_id}`}>
      <Avatar name={row.display_name} size="md" />
      <View className="flex-1">
        <Text variant="title-sm">{title}</Text>
        <Text variant="caption" muted>
          {meta}
        </Text>
      </View>
      {open ? (
        <Button
          variant="secondary"
          loading={pending}
          disabled={!online}
          accessibilityLabel={`I'm down: ${title}`}
          onPress={() => join.mutate(row.signal_id)}
          testID={`crew-down-for-join-${row.signal_id}`}
        >
          I'M DOWN
        </Button>
      ) : row.matched_plan_id ? (
        <TextButton onPress={() => router.push(`/plan/${row.matched_plan_id}` as Href)}>SEE THE PLAN</TextButton>
      ) : (
        <Badge>{row.is_mine ? 'YOURS' : "YOU'RE DOWN"}</Badge>
      )}
    </View>
  );
}

function RitualSection({ id, crew, online }: { id: string; crew: CrewHome; online: boolean }) {
  const rituals = useCrewRituals(id, true);
  const me = useUserId();
  const skip = useSkipRitualWeek(id);
  const create = useCreateRitual(id);
  const key = useRef<string | null>(null);
  const [confirmSkip, setConfirmSkip] = useState<CrewRitual | null>(null);
  const ritual = (rituals.data ?? []).find((r) => r.status !== 'ended') ?? null;
  const suggestion = ritual ? null : ritualSuggestion(crew);
  const admin = isCrewAdmin(crew.my_role);

  if (rituals.isPending) {
    return (
      <View {...loadingProps('Loading the Ritual')}>
        <Skeleton kind="object" />
      </View>
    );
  }
  if (rituals.isError && !ritual) {
    return <InlineError message={errorMessage(ojoroErrorOf(rituals.error))} action="RETRY" onAction={() => void rituals.refetch()} />;
  }

  if (ritual) {
    const week = ritualWeek(ritual, ritual.time_zone);
    return (
      <View className="gap-space-3 bg-surface-raised p-space-5" role="region" aria-label="Ritual" testID="crew-ritual">
        <View className="flex-row items-center justify-between gap-space-3">
          <Text variant="overline">RITUAL</Text>
          {ritual.status === 'paused' ? <Badge>PAUSED</Badge> : null}
        </View>
        <DisplayText size="sm">{ritualHeadline(ritual)}</DisplayText>
        <Text variant="body-sm">{ritualLine(ritual)}</Text>
        {week.kind === 'skipped' || week.kind === 'later' ? (
          <Text variant="body-sm" muted testID="crew-ritual-week-note">
            {week.label}
          </Text>
        ) : null}
        <View className="flex-row flex-wrap items-center gap-space-2">
          {week.kind === 'plan' ? (
            <Button href={`/plan/${week.planId}` as Href} testID="crew-ritual-week">
              {week.label}
            </Button>
          ) : null}
          {canSkipWeek(ritual, me) ? (
            <Button variant="ghost" disabled={!online || skip.isPending} onPress={() => setConfirmSkip(ritual)} testID="crew-ritual-skip">
              SKIP A WEEK
            </Button>
          ) : null}
          {week.kind === 'skipped' && (ritual.can_edit || ritual.host_id === me) ? (
            <Button
              variant="ghost"
              disabled={!online || skip.isPending}
              onPress={() => skip.mutate({ ritualId: ritual.ritual_id, occursOn: ritual.week_on, skip: false })}
              testID="crew-ritual-unskip"
            >
              PUT THIS WEEK BACK
            </Button>
          ) : null}
        </View>
        {skip.isError ? <InlineError message={errorMessage(ojoroErrorOf(skip.error))} /> : null}
        <Modal
          visible={!!confirmSkip}
          title="SKIP THIS WEEK?"
          body="This week's plan is called off and the crew is told. The Ritual carries on next week."
          confirm="SKIP A WEEK"
          cancel="KEEP IT"
          onCancel={() => setConfirmSkip(null)}
          onConfirm={() => {
            const r = confirmSkip;
            setConfirmSkip(null);
            if (r) skip.mutate({ ritualId: r.ritual_id, occursOn: r.week_on, skip: true });
          }}
        />
      </View>
    );
  }

  if (suggestion && admin && crew.suggest_sport_id && crew.suggest_day_of_week && crew.suggest_local_time) {
    const submit = () => {
      key.current ??= newIdempotencyKey();
      create.mutate(
        {
          key: key.current,
          sportId: crew.suggest_sport_id!,
          title: suggestionTitle(crew),
          dayOfWeek: crew.suggest_day_of_week!,
          localTime: crew.suggest_local_time!,
          capacity: Math.min(12, Math.max(2, crew.member_count)),
          placeId: crew.suggest_place_id,
        },
        { onSettled: (_d, e) => (!e ? (key.current = null) : undefined) },
      );
    };
    return (
      <View className="gap-space-3 bg-surface-raised p-space-5" role="region" aria-label="Make this a Ritual" testID="crew-ritual-suggestion">
        <Text variant="overline">MAKE THIS A RITUAL</Text>
        <DisplayText size="sm">{suggestion.title}</DisplayText>
        <Text variant="body-sm">{suggestion.body}</Text>
        <View className="self-start">
          <Button loading={create.isPending} disabled={!online} onPress={submit} testID="crew-ritual-make">
            MAKE THIS A RITUAL
          </Button>
        </View>
        {create.isError ? <InlineError message={errorMessage(ojoroErrorOf(create.error))} /> : null}
      </View>
    );
  }
  return null;
}

function VersusSection({ id, crew, now, online }: { id: string; crew: CrewHome; now: Date; online: boolean }) {
  const versus = useCrewVersus(id, true);
  const rows = versus.data ?? [];
  const admin = isCrewAdmin(crew.my_role);
  return (
    <View className="gap-space-1" role="region" aria-label="Crew versus crew" testID="crew-versus">
      <Divider kind="mark" label="CREW VS CREW" />
      {versus.isPending ? (
        <View {...loadingProps('Loading crew vs crew')}>
          <Skeleton kind="strip" />
        </View>
      ) : versus.isError && rows.length === 0 ? (
        <InlineError message={errorMessage(ojoroErrorOf(versus.error))} action="RETRY" onAction={() => void versus.refetch()} />
      ) : rows.length === 0 ? (
        <Text variant="body-sm" muted className="pt-space-2" testID="crew-versus-empty">
          {admin ? 'No crew vs crew yet. Call out another crew.' : 'No crew vs crew yet. Owners and admins can call out another crew.'}
        </Text>
      ) : (
        rows.map((v) => {
          const row = versusRow(v, now);
          return (
            <Strip
              key={v.event_id}
              leading={row.day}
              title={row.title}
              meta={row.meta}
              trailing={<Badge tone={row.signal ? 'signal' : 'neutral'}>{row.badge}</Badge>}
              href={`/event/${v.event_id}` as Href}
              testID={`crew-versus-${v.event_id}`}
            />
          );
        })
      )}
      {admin ? (
        // crew_home is members-only, so this page is always your own crew: an open crew Call-Out
        // any other crew's owner or admins can accept (Step 5 screens: A).
        <View className="flex-row flex-wrap items-center gap-space-3 pt-space-3">
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
    </View>
  );
}

function Memories({ id, timeZone }: { id: string; timeZone: string }) {
  const memories = useCrewMemories(id, true);
  const rows = memories.data ?? [];
  if (!memories.isPending && rows.length === 0) return null;
  return (
    <View className="gap-space-3" role="region" aria-label="Memories" testID="crew-memories">
      <Divider label="MEMORIES" />
      {memories.isPending ? (
        <View {...loadingProps('Loading memories')}>
          <Skeleton kind="object" />
        </View>
      ) : (
        <View className="flex-row flex-wrap gap-space-2">
          {rows.slice(0, 2).map((m) => {
            const caption = memoryCaption(m, timeZone);
            return (
              <Pressable
                key={m.activity_id}
                role="link"
                accessibilityLabel={`${m.moment_alt ?? 'A crew game'}. ${caption}. See the recap.`}
                onPress={() => router.push(`/activity/${m.activity_id}/recap` as Href)}
                style={{ width: '48.5%' }}
                testID={`crew-memory-${m.activity_id}`}
              >
                <Image src={m.photoUrl ?? undefined} alt={m.moment_alt ?? 'No photo from this game'} ratio="1:1" caption={caption} />
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

/** What Step 4's crew page did that the design has no place for: members, the code, report, leave. */
function CrewAdmin({
  id,
  crew,
  online,
  roster,
  onReport,
}: {
  id: string;
  crew: CrewHome;
  online: boolean;
  roster: ReturnType<typeof useCrewRoster>;
  onReport: () => void;
}) {
  const toast = useToast();
  const admin = isCrewAdmin(crew.my_role);
  const code = useInviteCode(id, admin);
  const rotate = useRotateCode(id);
  const leave = useLeaveCrew(id);
  const [confirm, setConfirm] = useState<'leave' | 'rotate' | null>(null);
  const [allMembers, setAllMembers] = useState(false);

  const share = async (value: string) => {
    track('crew_code_shared', { crew_id: id });
    try {
      await Share.share({ message: inviteText(crew.name, value) });
    } catch {
      toast.show({ kind: 'error', message: `Sharing isn't available here. The code is ${value}.` });
    }
  };

  return (
    <View className="gap-space-8">
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
            {(roster.data ?? []).slice(0, allMembers ? undefined : MEMBERS_SHOWN).map((m) => {
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
        {!allMembers && (roster.data?.length ?? 0) > MEMBERS_SHOWN ? (
          <TextButton onPress={() => setAllMembers(true)} className="self-start" testID="crew-members-all">
            {`ALL ${roster.data?.length ?? 0} MEMBERS`}
          </TextButton>
        ) : null}
        {(roster.data?.length ?? 0) < crew.member_count && roster.data ? (
          <PrivacyNote>Some members aren't shown to you.</PrivacyNote>
        ) : null}
      </View>

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

      <View className="flex-row flex-wrap items-center gap-space-4">
        <Button variant="ghost" onPress={() => setConfirm('leave')} disabled={!online} testID="crew-leave">
          LEAVE THE CREW
        </Button>
        <TextButton onPress={onReport} testID="crew-report">
          REPORT THE CREW
        </TextButton>
      </View>
      {leave.isError ? <InlineError message={errorMessage(ojoroErrorOf(leave.error))} testID="crew-leave-error" /> : null}

      <Modal
        visible={confirm === 'leave'}
        title="LEAVE THE CREW?"
        body={leaveBody(crew)}
        confirm="LEAVE"
        cancel="STAY"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          leave.mutate(undefined, {
            onSuccess: () => {
              toast.show({ kind: 'success', message: `You left ${crew.name}.` });
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
    </View>
  );
}
