/**
 * HostSeason (`/host/[programId]/league/[id]`, HostSeason.png, PRD §13 tournament & season
 * operations, §9.15): ROUND 3 OF 10 · WINTER LEAGUE. · RESULT TO CONFIRM (confirm → standings
 * recompute on the server; dispute → the captains send it again) · STANDINGS (points, then goal
 * difference, then goals scored) · the next round's fixtures with referee and readiness · SEASON.
 * Calm. The route layout has already checked that you run the program.
 *
 * Results are final once confirmed (docs/HOSTS_OPS_CONTRACT.md): the prototype's UNDO isn't offered.
 */
import { type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Share, View } from 'react-native';

import {
  Badge,
  Button,
  DataTable,
  DisplayText,
  Divider,
  IconButton,
  Screen,
  Strip,
  Text,
  useToast,
  VerificationBadge,
  type DataTableColumn,
} from '@/design-system';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';
import type { HostFixtureResultState, HostLeagueView, HostResultToConfirm } from '@ojoro/contracts';

import { useNow, useOnline } from '../activities/data';
import { InlineError, LoadingState, OfflineNote, ScreenHeader } from '../activities/ui';
import { useAskReferee, useConfirmResult, useDisputeResult, useLeague, useLeagueRealtime } from './opsData';
import {
  canConfirm,
  canDispute,
  confirmBlockedNote,
  fixtureModel,
  fixturesMeta,
  readinessNote,
  resultDetail,
  resultScore,
  roundHeading,
  seasonOverline,
  seasonSummary,
  seasonTitle,
  standingsNote,
  standingsRows,
  standingsShareText,
  teamsMeta,
  tieBreakLine,
} from './seasonLogic';

const STANDINGS_COLUMNS: DataTableColumn[] = [
  { key: 'pos', title: '#', accessibilityLabel: 'Position', align: 'left', width: 24, strong: true },
  { key: 'team', title: 'TEAM', accessibilityLabel: 'Team', align: 'left' },
  { key: 'p', title: 'P', accessibilityLabel: 'Played', width: 28 },
  { key: 'w', title: 'W', accessibilityLabel: 'Won', width: 28 },
  { key: 'd', title: 'D', accessibilityLabel: 'Drawn', width: 28 },
  { key: 'l', title: 'L', accessibilityLabel: 'Lost', width: 28 },
  { key: 'gd', title: 'GD', accessibilityLabel: 'Goal difference', width: 32 },
  { key: 'pts', title: 'PTS', accessibilityLabel: 'Points', width: 32, strong: true },
];

/** A result confirmed on this screen: kept in place (RESULT CONFIRMED) after it leaves `to_confirm`. */
type Confirmed = { item: HostResultToConfirm; state: HostFixtureResultState };

export function HostSeasonScreen({ programId, leagueId }: { programId: string; leagueId: string }) {
  const online = useOnline();
  const league = useLeague(programId, leagueId);
  useLeagueRealtime(programId, league.data ? leagueId : '');
  const view = league.data ?? null;
  // A league of another program isn't this program's to run: treat it as not found.
  const mine = view && view.league.program_id === programId && view.is_host ? view : null;
  const toast = useToast();

  useEffect(() => {
    track('host_season_viewed', { program_id: programId, league_id: leagueId });
  }, [programId, leagueId]);

  const share = async () => {
    if (!mine) return;
    track('cta_tapped', { cta: 'league_share', league_id: leagueId });
    try {
      await Share.share({ message: standingsShareText(mine.league, mine.standings) });
    } catch {
      toast.show({ kind: 'neutral', message: "Sharing isn't available here." });
    }
  };

  return (
    <Screen situation="calm" scroll gutter={false}>
      <ScreenHeader
        overline={mine ? seasonOverline(mine.league, mine.round) : 'LEAGUE'}
        fallback={`/host/${programId}` as Href}
        right={mine ? <IconButton icon="share" label="Share the standings" onPress={() => void share()} testID="season-share" /> : undefined}
      />
      {league.isPending ? (
        <LoadingState label="Loading the league" kinds={['text', 'object', 'strip', 'strip', 'strip']} />
      ) : !mine ? (
        <SeasonUnavailable error={league.error} onRetry={() => void league.refetch()} />
      ) : (
        <SeasonBody
          programId={programId}
          leagueId={leagueId}
          view={mine}
          online={online}
          dataUpdatedAt={league.dataUpdatedAt}
        />
      )}
    </Screen>
  );
}

function SeasonUnavailable({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const code = error ? ojoroErrorOf(error).code : 'league_not_found';
  if (code === 'league_not_found' || code === 'not_program_host' || code === 'invalid_argument') {
    return (
      <View className="gap-space-3 px-space-5 pt-space-8" testID="season-not-found">
        <Text variant="title" accessibilityRole="header">
          We can't find that league.
        </Text>
        <Text variant="body-sm" muted>
          It may have been removed, or it belongs to a program you don't run.
        </Text>
      </View>
    );
  }
  return (
    <View className="px-space-5 pt-space-8">
      <InlineError message={errorMessage(ojoroErrorOf(error))} action="RETRY" onAction={onRetry} testID="screen-error" />
    </View>
  );
}

function SeasonBody({
  programId,
  leagueId,
  view,
  online,
  dataUpdatedAt,
}: {
  programId: string;
  leagueId: string;
  view: HostLeagueView;
  online: boolean;
  dataUpdatedAt: number;
}) {
  const now = useNow(60_000);
  const { league, round } = view;
  const [confirmed, setConfirmed] = useState<Confirmed[]>([]);
  const confirmedIds = new Set(confirmed.map((c) => c.item.fixture_id));
  const pending = view.to_confirm.filter((t) => !confirmedIds.has(t.fixture_id));
  const moved = useMemo(
    () => new Set(confirmed.flatMap((c) => [c.item.home.id, c.item.away.id])),
    [confirmed],
  );
  const note = standingsNote(view.standings, confirmed.length > 0);

  return (
    <View className="gap-space-10 px-space-5 pb-space-10 pt-space-4" testID="host-season">
      {!online ? (
        <OfflineNote dataUpdatedAt={dataUpdatedAt} extra="Confirming results and asking refs wait until you're back." />
      ) : null}

      <View className="gap-space-3" role="region" aria-label="League">
        <DisplayText size="lg" accessibilityRole="header">
          {seasonTitle(league.name)}
        </DisplayText>
        <Text variant="body" testID="season-summary">
          {seasonSummary(league, round, now)}
        </Text>
      </View>

      {confirmed.map((c) => (
        <ResultBlock
          key={c.item.fixture_id}
          programId={programId}
          leagueId={leagueId}
          item={c.item}
          timeZone={league.time_zone}
          online={online}
          confirmedState={c.state}
          onConfirmed={() => undefined}
        />
      ))}
      {pending.map((item) => (
        <ResultBlock
          key={item.fixture_id}
          programId={programId}
          leagueId={leagueId}
          item={item}
          timeZone={league.time_zone}
          online={online}
          confirmedState={null}
          onConfirmed={(state) => setConfirmed((list) => [...list, { item, state }])}
        />
      ))}

      <View className="gap-space-3" role="region" aria-label="Standings">
        <Divider kind="strong" label="STANDINGS" />
        <DataTable
          label="Standings"
          columns={STANDINGS_COLUMNS}
          rows={standingsRows(view.standings, moved)}
          rowHeaderKey="team"
          highlightLabel="Moved with the result you confirmed"
          empty="No teams yet."
          testID="season-standings"
        />
        {note ? (
          <Text variant="caption" muted testID="season-standings-note">
            {note}
          </Text>
        ) : null}
      </View>

      <RoundSection programId={programId} leagueId={leagueId} view={view} online={online} />

      <View role="region" aria-label="Season tools">
        <Divider label="SEASON" />
        <Strip title="Fixtures" titleVariant="title-sm" meta={fixturesMeta(league)} testID="season-tool-fixtures" />
        <Strip title="Teams and captains" titleVariant="title-sm" meta={teamsMeta(league)} testID="season-tool-teams" />
        <Strip
          title="Rules and tie-breaks"
          titleVariant="title-sm"
          meta={tieBreakLine(league.tie_breaks)}
          testID="season-tool-rules"
        />
        <Strip
          title="Season page"
          titleVariant="title-sm"
          meta="Public standings, results and the final"
          trailing={<Badge>SOON</Badge>}
          trailingLabel="Not open yet"
          testID="season-tool-page"
        />
      </View>
    </View>
  );
}

function ResultBlock({
  programId,
  leagueId,
  item,
  timeZone,
  online,
  confirmedState,
  onConfirmed,
}: {
  programId: string;
  leagueId: string;
  item: HostResultToConfirm;
  timeZone: string;
  online: boolean;
  confirmedState: HostFixtureResultState | null;
  onConfirmed: (state: HostFixtureResultState) => void;
}) {
  const toast = useToast();
  const confirm = useConfirmResult(programId, leagueId);
  const dispute = useDisputeResult(programId, leagueId);
  const result = confirmedState ?? item.result;
  const score = resultScore(result);
  const busy = confirm.isPending || dispute.isPending;
  const error = confirm.error ?? dispute.error;
  const blocked = confirmedState ? null : confirmBlockedNote(result);

  return (
    <View className="gap-space-4 bg-surface-raised p-space-5" role="region" aria-label="Result to confirm" testID={`season-result-${item.fixture_id}`}>
      <Text variant="overline">{confirmedState ? 'RESULT CONFIRMED' : 'RESULT TO CONFIRM'}</Text>
      <View className="flex-row items-center gap-space-3">
        <Text variant="title" className="flex-1">
          {item.home.name}
        </Text>
        <DisplayText size="md" accessibilityLabel={score.spoken} style={{ fontVariant: ['tabular-nums'] }}>
          {score.shown}
        </DisplayText>
        <Text variant="title" className="flex-1 text-right">
          {item.away.name}
        </Text>
      </View>
      <Text variant="body-sm" muted>
        {resultDetail({ ...item, result }, timeZone)}
      </Text>

      {confirmedState ? (
        <View className="flex-row flex-wrap items-center gap-space-3" role="status" testID="season-result-confirmed">
          <VerificationBadge level="result" />
          <Text variant="body-sm" className="min-w-[160px] flex-1">
            Standings updated. Both teams told.
          </Text>
        </View>
      ) : (
        <>
          {blocked ? (
            <Text variant="body-sm" testID="season-result-blocked">
              {blocked}
            </Text>
          ) : null}
          <View className="flex-row gap-space-2">
            {canConfirm(result) ? (
              <Button
                variant="primary"
                className="flex-1"
                loading={confirm.isPending}
                disabled={!online || busy}
                onPress={() =>
                  confirm.mutate(item.fixture_id, {
                    onSuccess: (state) => onConfirmed(state),
                  })
                }
                testID="season-confirm"
              >
                CONFIRM RESULT
              </Button>
            ) : null}
            {canDispute(result) ? (
              <Button
                variant="secondary"
                loading={dispute.isPending}
                disabled={!online || busy}
                onPress={() =>
                  dispute.mutate(item.fixture_id, {
                    onSuccess: () =>
                      toast.show({
                        kind: 'neutral',
                        message: 'Disputed. Both captains are asked to send the score again.',
                      }),
                  })
                }
                testID="season-dispute"
              >
                DISPUTE
              </Button>
            ) : null}
          </View>
        </>
      )}
      {error && !confirmedState ? (
        <InlineError message={errorMessage(ojoroErrorOf(error))} testID="season-result-error" />
      ) : null}
    </View>
  );
}

function RoundSection({
  programId,
  leagueId,
  view,
  online,
}: {
  programId: string;
  leagueId: string;
  view: HostLeagueView;
  online: boolean;
}) {
  const toast = useToast();
  const ask = useAskReferee(programId, leagueId);
  const { league, round } = view;
  if (!round) {
    return (
      <View className="gap-space-3" role="region" aria-label="Next round">
        <Divider kind="strong" label="NEXT ROUND" />
        <Text variant="body-sm" muted testID="season-no-round">
          Every round has been played. The table above is final once the last results are confirmed.
        </Text>
      </View>
    );
  }
  const fixtures = [...round.fixtures].sort((a, b) => a.kicks_off_at.localeCompare(b.kicks_off_at));
  return (
    <View role="region" aria-label={`Round ${round.number}`} testID="season-round">
      <Divider kind="strong" label={roundHeading(round)} />
      {fixtures.length === 0 ? (
        <Text variant="body-sm" muted className="pt-space-4">
          No fixtures in this round yet.
        </Text>
      ) : null}
      {fixtures.map((f) => {
        const m = fixtureModel(f, league);
        const asking = ask.isPending && ask.variables?.fixtureId === f.fixture_id;
        return (
          <View key={m.key} className="gap-[10px] border-b border-line py-space-4" testID={`season-fixture-${m.key}`}>
            <View className="flex-row items-baseline gap-space-3">
              <DisplayText size="xs" style={{ fontVariant: ['tabular-nums'] }}>
                {m.time}
              </DisplayText>
              {m.pitch ? (
                <Text variant="caption" muted>
                  {m.pitch}
                </Text>
              ) : null}
            </View>
            <Text variant="title-sm">{m.match}</Text>
            <View className="flex-row items-center gap-space-3">
              <Text variant="body-sm" muted className="min-w-0 flex-1" testID={`season-ref-${m.key}`}>
                {m.refLine}
              </Text>
              <Badge tone={m.badge.tone}>{m.badge.label}</Badge>
            </View>
            {m.ask ? (
              <View className="self-start">
                <Button
                  variant="secondary"
                  loading={asking}
                  disabled={!online || ask.isPending}
                  onPress={() =>
                    ask.mutate(
                      { fixtureId: f.fixture_id, userId: m.ask!.userId },
                      {
                        onSuccess: () =>
                          toast.show({ kind: 'success', message: `Asked ${m.ask!.name} to ref. They answer from their notification.` }),
                        onError: (e) => toast.show({ kind: 'error', message: errorMessage(ojoroErrorOf(e)) }),
                      },
                    )
                  }
                  testID={`season-ask-ref-${m.key}`}
                >
                  {m.ask.label}
                </Button>
              </View>
            ) : null}
          </View>
        );
      })}
      <Text variant="body-sm" className="mt-space-4">
        {readinessNote(league)}
      </Text>
    </View>
  );
}
