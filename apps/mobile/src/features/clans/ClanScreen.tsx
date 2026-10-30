/**
 * `/clan/[id]`: Clan (design-handoff/screens/Clan.png, calm with the mission on the after ground;
 * PRD §9.13; docs/COMMUNITIES_CONTRACT.md, Clans). Header CLAN · YOU'RE A CONNECTOR with ···
 * (report, leaderboard, leave); the name, tagline and three numbers; START A CLUB RUN and INVITE for
 * the roles that can (JOIN / ASK TO JOIN for people outside); THIS WEEK's club runs; the month's
 * MISSION; OJORO CLASH; WHO RUNS IT; MOST RUNS · {MONTH} · CLAN ONLY (members only).
 */
import type { ClanRun, ClanView } from '@ojoro/contracts';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Share, View } from 'react-native';

import {
  ActivityStrip,
  Avatar,
  Badge,
  Button,
  DisplayText,
  Divider,
  IconButton,
  loadingProps,
  Modal,
  Progress,
  Screen,
  Sheet,
  Situation,
  Skeleton,
  Strip,
  Text,
  useToast,
} from '@/design-system';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';
import { useReportBlock } from '@/features/safety';

import { useOnline } from '../activities/data';
import { speakName } from '../clash/logic';
import { InlineError, LoadingState, OfflineNote, PrivacyNote, ScreenHeader } from '../activities/ui';
import { useNow } from '../plans/data';
import {
  useClanClashes,
  useClanInviteCode,
  useClanLeaderboard,
  useClanMission,
  useClanRealtime,
  useClanRoles,
  useClanView,
  useClanWeek,
  useJoinClan,
  useJoinClanRun,
  useLeaveClan,
  useSetClanLeaderboard,
  useWithdrawClanRequest,
} from './data';
import {
  canJoinRun,
  clanHeadline,
  clanInviteText,
  clanOverline,
  clanStats,
  clashRow,
  grouped,
  joinState,
  leaderboardLabel,
  leaderboardRow,
  missionBar,
  missionHeadline,
  missionLine,
  missionOverline,
  roleMeta,
  roleWord,
  runStrip,
  upcomingRuns,
} from './logic';

const tabular = { fontVariant: ['tabular-nums' as const] };

export function ClanScreen({ id }: { id: string }) {
  const online = useOnline();
  useClanRealtime(id);
  const view = useClanView(id);
  const clan = view.data ?? null;
  const [menu, setMenu] = useState(false);
  const reportBlock = useReportBlock({ onBlocked: () => void view.refetch() });

  useEffect(() => {
    track('screen_viewed', { screen: 'clan', clan_id: id });
    track('clan_viewed', { clan_id: id });
  }, [id]);

  return (
    <Screen situation="calm" scroll gutter={false}>
      <ScreenHeader
        overline={clan ? clanOverline(clan) : 'CLAN'}
        fallback={'/you' as Href}
        right={
          clan ? (
            <IconButton icon="more" label="Clan settings, report" onPress={() => setMenu(true)} testID="header-more" />
          ) : undefined
        }
      />
      {view.isPending && !clan ? (
        <LoadingState label="Loading the clan" kinds={['text', 'text', 'strip', 'strip']} />
      ) : !clan ? (
        <ClanUnavailable error={view.error} onRetry={() => void view.refetch()} />
      ) : (
        <ClanBody id={id} clan={clan} online={online} dataUpdatedAt={view.dataUpdatedAt} />
      )}
      {clan ? (
        <ClanMenu
          id={id}
          clan={clan}
          visible={menu}
          online={online}
          onClose={() => setMenu(false)}
          onReport={() => {
            setMenu(false);
            reportBlock.open({ subjectKind: 'clan', subjectId: id, personName: clan.name });
          }}
        />
      ) : null}
      {reportBlock.sheet}
    </Screen>
  );
}

function ClanUnavailable({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const e = ojoroErrorOf(error);
  const gone = !error || e.code === 'clan_not_found';
  return (
    <View className="gap-space-4 px-space-5 pt-space-8" testID="clan-unavailable">
      {gone ? (
        <>
          <Text variant="title">This clan isn't available.</Text>
          <Text variant="body-sm" muted>
            Invite-only clans are seen by their members. It may also have closed.
          </Text>
          <View className="self-start">
            <Button variant="secondary" onPress={() => router.replace('/you' as Href)}>
              BACK TO YOU
            </Button>
          </View>
        </>
      ) : (
        <InlineError message={errorMessage(e)} action="RETRY" onAction={onRetry} testID="screen-error" />
      )}
    </View>
  );
}

function ClanBody({ id, clan, online, dataUpdatedAt }: { id: string; clan: ClanView; online: boolean; dataUpdatedAt: number }) {
  const now = useNow([]);
  return (
    <View testID="clan-screen">
      <View className="gap-space-10 px-space-5 pb-space-10 pt-space-4">
        {!online ? (
          <OfflineNote dataUpdatedAt={dataUpdatedAt} extra="I'M DOWN and joining wait until you're back." />
        ) : null}
        <Identity id={id} clan={clan} online={online} />
        <ThisWeek id={id} clan={clan} now={now} online={online} />
      </View>
      <Mission id={id} clan={clan} />
      <View className="gap-space-10 px-space-5 pb-space-10 pt-space-10">
        <ClanClashes id={id} timeZone={clan.time_zone} />
        <WhoRunsIt id={id} />
        {clan.is_member ? <Leaderboard id={id} clan={clan} now={now} /> : null}
      </View>
    </View>
  );
}

function Identity({ id, clan, online }: { id: string; clan: ClanView; online: boolean }) {
  const toast = useToast();
  const invite = useClanInviteCode(id);
  const join = useJoinClan(id);
  const withdraw = useWithdrawClanRequest(id);
  const state = joinState(clan);

  const shareInvite = () =>
    invite.mutate(undefined, {
      onSuccess: async (code) => {
        track('clan_invite_shared', { clan_id: id });
        try {
          await Share.share({ message: clanInviteText(clan.name, code) });
        } catch {
          toast.show({ kind: 'neutral', message: `Sharing isn't available here. The code is ${code}.` });
        }
      },
    });

  return (
    <View className="gap-space-4" role="region" aria-label={clan.name}>
      <DisplayText size="lg" accessibilityRole="header" testID="clan-name">
        {clanHeadline(clan.name)}
      </DisplayText>
      {clan.tagline ? <Text variant="body">{clan.tagline}</Text> : null}
      <View className="flex-row gap-space-3 border-t border-line pt-space-4" testID="clan-stats">
        {clanStats(clan).map((s) => (
          <View key={s.label} className="flex-1" accessible accessibilityLabel={`${s.value} ${s.label.toLowerCase()}`}>
            <DisplayText size="sm" style={tabular}>
              {grouped(s.value)}
            </DisplayText>
            <Text variant="caption" muted>
              {s.label}
            </Text>
          </View>
        ))}
      </View>
      <View className="flex-row flex-wrap items-center gap-space-2">
        {state.kind === 'member' && clan.can_start_run ? (
          <Button
            disabled={!online}
            onPress={() => {
              // The club-run form isn't designed yet (HANDOFF.md gaps; docs/DESIGN_DECISIONS.md, Step 6
              // SCR-COMMUNITIES): say so instead of opening a form that can't make one.
              track('clan_run_started_tapped', { clan_id: id });
              toast.show({ kind: 'neutral', message: "Starting a club run from the app isn't ready yet. Runs set up as weekly Rituals appear here on their own." });
            }}
            testID="clan-start-run"
          >
            START A CLUB RUN
          </Button>
        ) : null}
        {state.kind === 'member' && clan.can_invite ? (
          <Button variant="secondary" loading={invite.isPending} disabled={!online} onPress={shareInvite} testID="clan-invite">
            INVITE
          </Button>
        ) : null}
        {state.kind === 'join' ? (
          <Button loading={join.isPending} disabled={!online} onPress={() => join.mutate()} testID="clan-join">
            {state.label}
          </Button>
        ) : null}
        {state.kind === 'requested' ? (
          <>
            <View testID="clan-requested">
              <Badge>ASKED TO JOIN</Badge>
            </View>
            <Button variant="ghost" loading={withdraw.isPending} disabled={!online} onPress={() => withdraw.mutate()} testID="clan-withdraw">
              TAKE IT BACK
            </Button>
          </>
        ) : null}
      </View>
      {state.kind === 'requested' ? (
        <Text variant="body-sm" muted>
          The people who admit new members see your request. You hear back here.
        </Text>
      ) : null}
      {state.kind === 'invite' ? (
        <PrivacyNote>Invite only. Ask someone in the clan for the code.</PrivacyNote>
      ) : null}
      {join.isError ? <InlineError message={errorMessage(ojoroErrorOf(join.error))} testID="clan-join-error" /> : null}
      {invite.isError ? <InlineError message={errorMessage(ojoroErrorOf(invite.error))} /> : null}
      {clan.can_admit && (clan.pending_requests ?? 0) > 0 ? (
        <Text variant="body-sm" testID="clan-pending">
          {`${clan.pending_requests} ${clan.pending_requests === 1 ? 'person is' : 'people are'} asking to join.`}
        </Text>
      ) : null}
    </View>
  );
}

function ThisWeek({ id, clan, now, online }: { id: string; clan: ClanView; now: Date; online: boolean }) {
  const week = useClanWeek(id, true);
  const join = useJoinClanRun(id);
  const rows = upcomingRuns(week.data ?? []);
  return (
    <View className="gap-space-1" role="region" aria-label="This week" testID="clan-week">
      <Divider label="THIS WEEK" />
      {week.isPending ? (
        <View {...loadingProps('Loading this week')}>
          <Skeleton kind="strip" />
          <Skeleton kind="strip" />
        </View>
      ) : week.isError && rows.length === 0 ? (
        <InlineError message={errorMessage(ojoroErrorOf(week.error))} action="RETRY" onAction={() => void week.refetch()} />
      ) : rows.length === 0 ? (
        <Text variant="body-sm" muted className="pt-space-2" testID="clan-week-empty">
          {clan.can_start_run ? 'No club runs in the next 7 days. Start one.' : 'No club runs in the next 7 days.'}
        </Text>
      ) : (
        rows.map((r) => <RunRow key={r.run_id} run={r} clan={clan} now={now} online={online} join={join} />)
      )}
      {join.isError ? <InlineError message={errorMessage(ojoroErrorOf(join.error))} /> : null}
    </View>
  );
}

function RunRow({
  run,
  clan,
  now,
  online,
  join,
}: {
  run: ClanRun;
  clan: ClanView;
  now: Date;
  online: boolean;
  join: ReturnType<typeof useJoinClanRun>;
}) {
  const strip = runStrip(run, now, clan.time_zone);
  const open = clan.is_member && canJoinRun(run);
  return (
    <View testID={`clan-run-${run.run_id}`}>
      <ActivityStrip {...strip} />
      {open || run.i_am_down ? (
        <View className="flex-row items-center justify-end gap-space-3 pb-space-3">
          {run.i_am_down ? (
            <Text variant="label" muted>
              YOU'RE DOWN
            </Text>
          ) : (
            <Button
              variant="secondary"
              compact
              loading={join.isPending && join.variables === run.run_id}
              disabled={!online}
              accessibilityLabel={`I'm down: ${run.title}`}
              onPress={() => join.mutate(run.run_id)}
              testID={`clan-run-join-${run.run_id}`}
            >
              I'M DOWN
            </Button>
          )}
        </View>
      ) : null}
    </View>
  );
}

function Mission({ id, clan }: { id: string; clan: ClanView }) {
  const mission = useClanMission(id, true);
  const m = mission.data ?? null;
  if (mission.isPending) {
    return (
      <View className="px-space-5" {...loadingProps('Loading the mission')}>
        <Skeleton kind="object" />
      </View>
    );
  }
  if (mission.isError && !m) {
    return (
      <View className="px-space-5">
        <InlineError message={errorMessage(ojoroErrorOf(mission.error))} action="RETRY" onAction={() => void mission.refetch()} />
      </View>
    );
  }
  if (!m) {
    return (
      <View className="gap-space-2 px-space-5" testID="clan-mission-empty">
        <Divider label="MISSION" />
        <Text variant="body-sm" muted>
          {clan.can_set_mission
            ? 'No mission this month. A mission is a goal the whole clan runs toward, counted from club runs.'
            : 'No mission this month.'}
        </Text>
      </View>
    );
  }
  const bar = missionBar(m);
  return (
    <Situation id="after" className="gap-space-3 px-space-5 py-space-7" role="region" aria-label={missionOverline(m.starts_on)} testID="clan-mission">
      <Text variant="overline">{missionOverline(m.starts_on)}</Text>
      <DisplayText size="md">{missionHeadline(m.title)}</DisplayText>
      <Progress value={bar.value} max={bar.max} label={bar.label} />
      <Text variant="body-sm" style={tabular}>
        {missionLine(m)}
      </Text>
    </Situation>
  );
}

function ClanClashes({ id, timeZone }: { id: string; timeZone: string }) {
  const clashes = useClanClashes(id, true);
  const rows = (clashes.data ?? []).filter((c) => c.stage !== 'declined' && c.stage !== 'cancelled');
  if (clashes.isPending || rows.length === 0) return null;
  return (
    <View className="gap-space-1" role="region" aria-label="Ojoro Clash" testID="clan-clashes">
      <Divider kind="mark" label="OJORO CLASH" />
      {rows.map((c) => {
        // "Fall Clash vs McGill": the short name, in the clan's own casing.
        const opponent = c.opponent_name && c.opponent_short_name ? speakName(c.opponent_short_name, c.opponent_name) : c.opponent_name;
        const row = clashRow({ ...c, opponent_name: opponent }, timeZone);
        return (
          <Strip
            key={c.clash_id}
            leading={row.score}
            leadingLabel={`${c.our_wins} to ${c.their_wins}`}
            title={row.title}
            meta={row.meta}
            trailing={<Badge tone={row.signal ? 'signal' : 'neutral'}>{row.badge}</Badge>}
            href={`/clash/${c.clash_id}` as Href}
            testID={`clan-clash-${c.clash_id}`}
          />
        );
      })}
    </View>
  );
}

function WhoRunsIt({ id }: { id: string }) {
  const roles = useClanRoles(id, true);
  const rows = roles.data ?? [];
  return (
    <View className="gap-space-1" role="region" aria-label="Roles" testID="clan-roles">
      <Divider label="WHO RUNS IT" />
      {roles.isPending ? (
        <View {...loadingProps('Loading roles')}>
          <Skeleton kind="strip" />
        </View>
      ) : roles.isError && rows.length === 0 ? (
        <InlineError message={errorMessage(ojoroErrorOf(roles.error))} action="RETRY" onAction={() => void roles.refetch()} />
      ) : (
        <View role="list">
          {rows.map((p) => {
            const meta = roleMeta(p);
            const content = (
              <>
                <Avatar name={p.display_name} size="md" />
                <View className="flex-1">
                  <Text variant="title-sm">{p.display_name}</Text>
                  {meta ? (
                    <Text variant="caption" muted>
                      {meta}
                    </Text>
                  ) : null}
                </View>
                <Badge tone={p.role === 'captain' ? 'signal' : 'neutral'}>{roleWord(p.role)}</Badge>
              </>
            );
            const cls = 'min-h-[64px] flex-row items-center gap-space-3 border-b border-line py-space-2';
            return p.is_me ? (
              <View key={p.user_id} role="listitem" className={cls} testID={`clan-role-${p.user_id}`}>
                {content}
              </View>
            ) : (
              <Pressable
                key={p.user_id}
                role="link"
                accessibilityLabel={`${p.display_name}, ${p.role}${meta ? `, ${meta}` : ''}`}
                accessibilityHint={`Opens ${p.display_name}'s profile, where you can report or block`}
                onPress={() => router.push(`/profile/${p.user_id}` as Href)}
                className={cls}
                testID={`clan-role-${p.user_id}`}
              >
                {content}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

function Leaderboard({ id, clan, now }: { id: string; clan: ClanView; now: Date }) {
  const board = useClanLeaderboard(id, clan.is_member);
  const rows = board.data ?? [];
  return (
    <View className="gap-space-1" role="region" aria-label="Most runs this month" testID="clan-leaderboard">
      <Divider label={leaderboardLabel(now, clan.time_zone)} />
      {board.isPending ? (
        <View {...loadingProps('Loading the leaderboard')}>
          <Skeleton kind="strip" />
        </View>
      ) : board.isError && rows.length === 0 ? (
        <InlineError message={errorMessage(ojoroErrorOf(board.error))} action="RETRY" onAction={() => void board.refetch()} />
      ) : rows.length === 0 ? (
        <Text variant="body-sm" muted className="pt-space-2">
          No club runs checked in this month yet.
        </Text>
      ) : (
        rows.map((r) => {
          const row = leaderboardRow(r);
          return (
            <Strip
              key={r.user_id}
              leading={String(r.rank)}
              leadingLabel={`Rank ${r.rank}`}
              title={row.name}
              titleVariant="title-sm"
              href={r.is_me ? undefined : (`/profile/${r.user_id}` as Href)}
              trailing={
                <Text variant="body" style={tabular}>
                  {row.runs}
                </Text>
              }
              testID={`clan-rank-${r.user_id}`}
            />
          );
        })
      )}
      {clan.on_leaderboard === false ? (
        <PrivacyNote>You're hidden from this list. Others don't see your runs here; you still see your own.</PrivacyNote>
      ) : null}
    </View>
  );
}

/** ···: report the clan; for members, the leaderboard switch and leaving. */
function ClanMenu({
  id,
  clan,
  visible,
  online,
  onClose,
  onReport,
}: {
  id: string;
  clan: ClanView;
  visible: boolean;
  online: boolean;
  onClose: () => void;
  onReport: () => void;
}) {
  const toast = useToast();
  const leave = useLeaveClan(id);
  const board = useSetClanLeaderboard(id);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const onBoard = clan.on_leaderboard !== false;
  const captain = clan.my_role === 'captain';
  return (
    <>
      <Sheet title={clan.name} visible={visible} onClose={onClose}>
        <View className="gap-space-3" testID="clan-menu">
          {clan.is_member ? (
            <Button
              variant="secondary"
              block
              disabled={!online || board.isPending}
              onPress={() =>
                board.mutate(!onBoard, {
                  onSuccess: () => {
                    onClose();
                    toast.show({ kind: 'neutral', message: onBoard ? "You're off the clan leaderboard." : "You're back on the clan leaderboard." });
                  },
                })
              }
              testID="clan-menu-leaderboard"
            >
              {onBoard ? 'HIDE ME FROM THE LEADERBOARD' : 'SHOW ME ON THE LEADERBOARD'}
            </Button>
          ) : null}
          <Button variant="secondary" block onPress={onReport} testID="clan-menu-report">
            REPORT THE CLAN
          </Button>
          {clan.is_member ? (
            <Button
              variant="ghost"
              block
              disabled={!online}
              onPress={() => {
                onClose();
                setConfirmLeave(true);
              }}
              testID="clan-menu-leave"
            >
              LEAVE THE CLAN
            </Button>
          ) : null}
          {board.isError ? <InlineError message={errorMessage(ojoroErrorOf(board.error))} /> : null}
          <Text variant="caption" muted>
            To block someone, open their profile from WHO RUNS IT or the leaderboard.
          </Text>
        </View>
      </Sheet>
      <Modal
        visible={confirmLeave}
        title="LEAVE THE CLAN?"
        body={
          captain && clan.member_count > 1
            ? `You're the captain of ${clan.name}. Hand the captaincy to someone else first; then you can leave.`
            : `You leave ${clan.name}, its runs and its leaderboard. ${grouped(Math.max(0, clan.member_count - 1))} stay. You can ask to come back.`
        }
        confirm="LEAVE"
        cancel="STAY"
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() => {
          setConfirmLeave(false);
          leave.mutate(undefined, {
            onSuccess: () => toast.show({ kind: 'neutral', message: `You left ${clan.name}.` }),
            onError: (e) => toast.show({ kind: 'error', message: errorMessage(ojoroErrorOf(e)) }),
          });
        }}
      />
    </>
  );
}
