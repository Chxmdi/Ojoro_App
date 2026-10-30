/**
 * HostHome (`/host/[programId]`, HostHome.png, PRD §13): YOUR WEEK., NEEDS YOU, THIS WEEK, the
 * last 30 days and the tools. Calm. The route layout has already checked that you run the program.
 */
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';

import {
  Badge,
  Button,
  DisplayText,
  Divider,
  loadingProps,
  Screen,
  Skeleton,
  Strip,
  StripList,
  Text,
} from '@/design-system';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { useOnline } from '../activities/data';
import { InlineError, OfflineNote, ScreenHeader } from '../activities/ui';
import { useHostWeek, useNeedsYou, useProgram } from './data';
import { needsYouRow, statValue, weekHeadline, weekRow } from './logic';

const TOOLS = [
  { key: 'series', title: 'SERIES & TEMPLATES', meta: 'Repeat a session without rebuilding it', path: null },
  { key: 'people', title: 'PEOPLE', meta: 'Regulars, attendance, notes', path: 'people' },
  { key: 'payments', title: 'MEMBERSHIPS & PAYMENTS', meta: 'Passes, payouts, refunds', path: 'payments' },
  { key: 'announce', title: 'ANNOUNCEMENTS', meta: "One message to everyone who's in", path: 'announce' },
  { key: 'league', title: 'LEAGUE', meta: 'Fixtures, results, standings', path: null },
] as const;

export function HostHomeScreen({ programId }: { programId: string }) {
  const online = useOnline();
  const program = useProgram(programId);
  const home = program.data ?? null;
  const needs = useNeedsYou(programId, !!home);
  const week = useHostWeek(programId, !!home);
  const base = `/host/${programId}`;

  useEffect(() => {
    track('screen_viewed', { screen: 'host_home', program_id: programId });
  }, [programId]);

  const weekRows = (week.data ?? []).map((w) => weekRow(programId, w, home?.time_zone ?? 'America/Toronto'));
  const needRows = (needs.data ?? []).map((n, i) => needsYouRow(programId, n, i));
  // SERIES & TEMPLATES opens the first series this week; LEAGUE the first league round.
  const firstSeries = (week.data ?? []).find((w) => w.kind === 'session' && w.series_id)?.series_id ?? null;
  const firstLeague = (week.data ?? []).find((w) => w.kind === 'league' && w.object_id)?.object_id ?? null;
  const toolHref = (key: (typeof TOOLS)[number]['key'], path: string | null): Href | undefined => {
    if (path) return `${base}/${path}` as Href;
    if (key === 'series') return firstSeries ? (`${base}/series/${firstSeries}` as Href) : undefined;
    if (key === 'league') return firstLeague ? (`${base}/league/${firstLeague}` as Href) : undefined;
    return undefined;
  };
  const sessionsSoFar = home?.last30_sessions ?? 0;
  const showed = statValue(home && sessionsSoFar > 0 ? home.last30_showed_up_pct : null, '%');
  const stats = [
    { key: 'sessions', value: statValue(home ? home.last30_sessions : null), caption: 'Sessions' },
    { key: 'showed', value: showed, caption: 'Showed up' },
    { key: 'hours', value: statValue(home ? home.last30_ojoro_hours : null), caption: 'Ojoro hours' },
  ];

  return (
    <Screen situation="calm" scroll gutter={false}>
      <ScreenHeader overline={home ? `HOSTING · ${home.name.toUpperCase()}` : 'HOSTING'} fallback={'/you' as Href} />
      {!home ? null : (
        <View className="gap-space-10 px-space-5 pb-space-10 pt-space-4" testID="host-home">
          {!online ? <OfflineNote dataUpdatedAt={program.dataUpdatedAt} extra="Changes wait until you're back." /> : null}
          <View className="gap-space-3">
            <DisplayText size="lg" accessibilityRole="header">
              YOUR WEEK.
            </DisplayText>
            <Text variant="body" testID="host-week-headline">
              {weekHeadline(home)}
            </Text>
          </View>

          <View role="region" aria-label="Needs you">
            <Divider kind="strong" label={`NEEDS YOU · ${needs.data ? needRows.length : home.needs_you_count}`} />
            {needs.isPending ? (
              <View className="pt-space-3" {...loadingProps('Loading what needs you')}>
                <Skeleton kind="strip" />
              </View>
            ) : needs.isError ? (
              <View className="pt-space-3">
                <InlineError message={errorMessage(ojoroErrorOf(needs.error))} action="RETRY" onAction={() => void needs.refetch()} />
              </View>
            ) : needRows.length === 0 ? (
              <Text variant="body-sm" muted className="py-space-4" testID="needs-you-empty">
                Nothing needs you right now. Requests, refunds and results to confirm land here.
              </Text>
            ) : (
              needRows.map((row, i) => (
                <View
                  key={row.key}
                  className="flex-row items-center gap-space-3 border-b border-line py-[14px]"
                  testID={`needs-you-${i}`}
                >
                  <View className="flex-1 gap-[2px]">
                    <Text variant="title-sm">{row.title}</Text>
                    {row.meta ? (
                      <Text variant="body-sm" muted>
                        {row.meta}
                      </Text>
                    ) : null}
                  </View>
                  {row.href ? (
                    <Button
                      variant={i === 0 ? 'primary' : 'secondary'}
                      compact
                      href={row.href as Href}
                      accessibilityLabel={`${row.action}: ${row.title}`}
                      testID={`needs-you-${i}-action`}
                    >
                      {row.action}
                    </Button>
                  ) : null}
                </View>
              ))
            )}
          </View>

          <View className="gap-space-1" role="region" aria-label="This week's sessions">
            <Divider label="THIS WEEK" />
            {week.isPending ? (
              <View {...loadingProps('Loading this week')}>
                <Skeleton kind="strip" />
                <Skeleton kind="strip" />
              </View>
            ) : week.isError ? (
              <InlineError message={errorMessage(ojoroErrorOf(week.error))} action="RETRY" onAction={() => void week.refetch()} />
            ) : weekRows.length === 0 ? (
              <Text variant="body-sm" muted className="py-space-4" testID="week-empty">
                No sessions in the next 7 days. Sessions appear here once a series has dates coming up.
              </Text>
            ) : (
              <StripList>
                {weekRows.map((row) => (
                  <Strip
                    key={row.key}
                    leading={row.day}
                    title={row.title}
                    titleVariant="title-sm"
                    meta={row.meta}
                    trailing={<Badge tone={row.signal ? 'signal' : 'neutral'}>{row.badge}</Badge>}
                    {...(row.href ? { href: row.href as Href, accessibilityHint: 'Opens the session' } : null)}
                    testID={`week-${row.key}`}
                  />
                ))}
              </StripList>
            )}
          </View>

          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Last 30 days: ${stats.map((s) => `${s.value.spoken} ${s.caption.toLowerCase()}`).join(', ')}. See insights.`}
            onPress={() => router.push(`${base}/insights` as Href)}
            className="gap-space-4 bg-surface-raised p-space-5"
            testID="host-last30"
          >
            <Text variant="overline">LAST 30 DAYS</Text>
            <View className="flex-row gap-space-3">
              {stats.map((s) => (
                <View key={s.key} className="flex-1">
                  <DisplayText size="sm" style={{ fontVariant: ['tabular-nums'] }}>
                    {s.value.shown}
                  </DisplayText>
                  <Text variant="caption" muted>
                    {s.caption}
                  </Text>
                </View>
              ))}
            </View>
            <Text variant="label">SEE INSIGHTS</Text>
          </Pressable>

          <View role="region" aria-label="Tools">
            <Divider label="TOOLS" />
            <StripList>
              {TOOLS.map((tool) => {
                const href = toolHref(tool.key, tool.path);
                return (
                  <Strip
                    key={tool.key}
                    title={tool.title}
                    titleVariant="display-xs"
                    meta={href ? tool.meta : `${tool.meta}. Nothing set up yet.`}
                    trailing={href ? 'chevron' : null}
                    {...(href ? { href } : null)}
                    testID={`host-tool-${tool.key}`}
                  />
                );
              })}
            </StripList>
          </View>
        </View>
      )}
    </Screen>
  );
}
