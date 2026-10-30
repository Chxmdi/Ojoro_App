/**
 * HostInsights (`/host/[programId]/insights`, HostInsights.png, PRD §13 analytics & revenue, §15):
 * LAST 30 DAYS · Ojoro hours (the north star, hero) · show-up / came back / fill time / payout tiles ·
 * PEOPLE PER WEEK (one series, last week in words, readout, SHOW AS TABLE) · BY SESSION fill rates ·
 * REVENUE ledger · DOWNLOAD CSV and PAYOUTS. Calm. Hosts only (the route layout checks).
 *
 * The server computes every number (docs/HOSTS_OPS_CONTRACT.md). The Ojoro service fee is a
 * PLACEHOLDER computed server-side and labelled so here; no money moves (provider 'none').
 */
import { insightsCsvFileName, type HostInsights } from '@ojoro/contracts';
import { type Href } from 'expo-router';
import { useEffect } from 'react';
import { Platform, Share, View } from 'react-native';

import {
  Button,
  ColumnChart,
  DisplayText,
  Divider,
  IconButton,
  Ledger,
  Meter,
  Screen,
  StatTile,
  StatTiles,
  Text,
  useToast,
} from '@/design-system';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { useNow, useOnline } from '../activities/data';
import { InlineError, LoadingState, OfflineNote, PrivacyNote, ScreenHeader } from '../activities/ui';
import { useProgram } from './data';
import { useInsights, useInsightsCsv } from './opsData';
import {
  chartCaption,
  countText,
  feeNote,
  hoursExplainer,
  insightTiles,
  lastWeekLabel,
  moneyLocale,
  revenueLines,
  seriesRow,
  weekData,
} from './seasonLogic';

/** Save on web (a file download); the share sheet on a phone (Files, Mail, Drive…). */
async function exportCsv(csv: string, fileName: string): Promise<'saved' | 'shared' | 'dismissed'> {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'saved';
  }
  const r = await Share.share({ message: csv, title: fileName });
  return r.action === Share.dismissedAction ? 'dismissed' : 'shared';
}

export function HostInsightsScreen({ programId }: { programId: string }) {
  const online = useOnline();
  const program = useProgram(programId);
  const insights = useInsights(programId);
  const csv = useInsightsCsv(programId);
  const toast = useToast();
  const data = insights.data ?? null;
  const name = data?.program_name ?? program.data?.name ?? '';

  useEffect(() => {
    track('host_insights_viewed', { program_id: programId });
  }, [programId]);

  const download = () => {
    if (!online || csv.isPending) return;
    csv.mutate(undefined, {
      onSuccess: async (text) => {
        const fileName = insightsCsvFileName(name || 'ojoro');
        try {
          const how = await exportCsv(text, fileName);
          if (how === 'saved') toast.show({ kind: 'success', message: `Saved ${fileName}.` });
        } catch {
          toast.show({ kind: 'error', message: "Couldn't open the share sheet. Try again." });
        }
      },
      onError: (e) => toast.show({ kind: 'error', message: errorMessage(ojoroErrorOf(e)) }),
    });
  };

  return (
    <Screen situation="calm" scroll gutter={false}>
      <ScreenHeader
        overline={name ? `INSIGHTS · ${name.toUpperCase()}` : 'INSIGHTS'}
        fallback={`/host/${programId}` as Href}
        right={
          <IconButton
            icon="share"
            label="Export report as CSV"
            onPress={download}
            disabled={!online || csv.isPending || !data}
            testID="insights-export"
          />
        }
      />
      {insights.isPending ? (
        <LoadingState label="Loading insights" kinds={['text', 'object', 'object', 'strip', 'strip']} />
      ) : !data ? (
        <View className="px-space-5 pt-space-8">
          <InlineError
            message={errorMessage(ojoroErrorOf(insights.error))}
            action="RETRY"
            onAction={() => void insights.refetch()}
            testID="screen-error"
          />
        </View>
      ) : (
        <InsightsBody
          programId={programId}
          data={data}
          online={online}
          dataUpdatedAt={insights.dataUpdatedAt}
          onDownload={download}
          downloading={csv.isPending}
        />
      )}
    </Screen>
  );
}

function InsightsBody({
  programId,
  data,
  online,
  dataUpdatedAt,
  onDownload,
  downloading,
}: {
  programId: string;
  data: HostInsights;
  online: boolean;
  dataUpdatedAt: number;
  onDownload: () => void;
  downloading: boolean;
}) {
  const now = useNow(60_000);
  const tz = data.time_zone;
  const tiles = insightTiles(data);
  const weeks = weekData(data.weeks, tz);
  const series = data.by_series.map(seriesRow);
  const nothingYet = data.sessions === 0 && data.weeks.every((w) => w.people === 0);

  return (
    <View className="gap-space-10 px-space-5 pb-space-10 pt-space-4" testID="host-insights">
      {!online ? <OfflineNote dataUpdatedAt={dataUpdatedAt} extra="The CSV downloads when you're back." /> : null}

      <View className="gap-space-2" role="region" aria-label="Ojoro hours">
        <Text variant="overline">{`LAST ${data.days} DAYS`}</Text>
        <DisplayText size="xl" style={{ fontVariant: ['tabular-nums'] }} testID="insights-hours">
          {countText(data.ojoro_hours)}
        </DisplayText>
        <Text variant="title" accessibilityRole="header">
          Ojoro hours at your sessions
        </Text>
        <Text variant="body-sm" muted>
          {nothingYet
            ? 'Everyone who checked in, times how long they played. Numbers show up after your first session ends.'
            : hoursExplainer(data)}
        </Text>
      </View>

      <StatTiles label="Key numbers" testID="insights-tiles">
        {tiles.map((t) => (
          <StatTile key={t.key} value={t.value} label={t.label} delta={t.delta} testID={`insights-tile-${t.key}`} />
        ))}
      </StatTiles>

      <View className="gap-space-4" role="region" aria-label="People per week">
        <View className="gap-space-1">
          <Divider kind="strong" label="PEOPLE PER WEEK" />
          <Text variant="body-sm" muted>
            {`Checked in across all your sessions, last ${weeks.length} weeks.`}
          </Text>
        </View>
        <ColumnChart
          title="People per week"
          data={weeks}
          unit="people"
          lastLabel={lastWeekLabel(data.weeks, now, tz)}
          categoryTitle="WEEK OF"
          valueTitle="PEOPLE"
          extraColumns={[{ key: 'sessions', title: 'SESSIONS', accessibilityLabel: 'Sessions' }]}
          caption={chartCaption(data.weeks, tz)}
          onViewChange={(view) => track('host_insights_table_toggled', { program_id: programId, view })}
          testID="insights-chart"
        />
      </View>

      <View className="gap-space-1" role="region" aria-label="By session">
        <Divider kind="strong" label="BY SESSION" />
        {series.length === 0 ? (
          <Text variant="body-sm" muted className="pt-space-4">
            No series yet. Fill rates show here once a series has run.
          </Text>
        ) : null}
        {series.map((s) => (
          <View key={s.key} className="gap-space-2 border-b border-line py-space-4" testID={`insights-series-${s.key}`}>
            <View className="flex-row items-baseline justify-between gap-space-3">
              <Text variant="title-sm" className="shrink">
                {s.name}
              </Text>
              <Text variant="title-sm" style={{ fontVariant: ['tabular-nums'] }}>
                {s.full}
              </Text>
            </View>
            <Meter value={s.pct ?? 0} label={s.aria} />
            {s.meta ? (
              <Text variant="body-sm" muted>
                {s.meta}
              </Text>
            ) : null}
          </View>
        ))}
      </View>

      <View className="gap-space-2" role="region" aria-label="Revenue">
        <Divider kind="strong" label={`REVENUE · LAST ${data.days} DAYS`} />
        <Ledger
          label={`Revenue, last ${data.days} days`}
          lines={revenueLines(data.revenue)}
          currency={data.revenue.currency}
          locale={moneyLocale(data.revenue.currency)}
          total={{ label: 'Paid out to you', amountCents: data.revenue.net_cents }}
          testID="insights-ledger"
        />
        <PrivacyNote>{feeNote(data.fee_policy, data.payments_connected)}</PrivacyNote>
        <View className="mt-space-4 flex-row flex-wrap gap-space-2">
          <Button
            variant="secondary"
            loading={downloading}
            disabled={!online || downloading}
            onPress={onDownload}
            testID="insights-csv"
          >
            DOWNLOAD CSV
          </Button>
          <Button variant="ghost" href={`/host/${programId}/payments` as Href} testID="insights-payouts">
            PAYOUTS
          </Button>
        </View>
      </View>
    </View>
  );
}
