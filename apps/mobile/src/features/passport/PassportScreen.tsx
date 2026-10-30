import type { PassportStamp as StampRow, PassportView } from '@ojoro/contracts';
import { reputationLabel, showUpSentence } from '@ojoro/contracts';
import { router, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import {
  Badge,
  Button,
  Chip,
  ChipRow,
  DisplayText,
  Divider,
  IconButton,
  loadingProps,
  PassportStamp,
  Screen,
  Skeleton,
  STAMP_SIZE,
  Strip,
  StripList,
  Text,
  TextButton,
} from '@/design-system';
import { InlineError, OfflineNote, PrivacyNote, useIsOnline } from '@/features/profile/states';
import { useReportBlock } from '@/features/safety';
import { firstName } from '@/features/safety/reasons';
import { formatHours } from '@/features/profile/logic';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import {
  usePassportAchievements,
  usePassportRealtime,
  usePassportReputation,
  usePassportStamps,
  usePassportView,
} from './data';
import { GoalSection } from './GoalSection';
import {
  achievementRows,
  emptyStampsLine,
  FILTER_BYS,
  filterValues,
  findStamp,
  hasTarget,
  headlineLines,
  passportOverline,
  passportVisibilityLine,
  personalBestMeta,
  personalBestTitle,
  sinceLine,
  stampHref,
  stampLine,
  stampProps,
  toFilter,
  type FilterBy,
  type StampTarget,
} from './logic';

const tabular = { fontVariant: ['tabular-nums' as const] };

/**
 * Passport detail (`/passport`, `/profile/[id]/passport`). Not designed (HANDOFF.md): built from
 * You.png's Passport block, PassportStamp and the after situation. Totals, the goal, firsts and
 * milestones, personal bests, achievements, reputation and every stamp by sport, place or month
 * (PRD §9.17). Someone else's follows their history and goals settings, all decided server-side.
 */
export function PassportScreen({ userId, self, target = {} }: { userId: string; self: boolean; target?: StampTarget }) {
  const online = useIsOnline();
  const view = usePassportView(userId);
  const data = view.data ?? null;
  usePassportRealtime(userId);
  const reportBlock = useReportBlock({ onBlocked: () => void view.refetch() });
  const viewed = useRef(false);

  useEffect(() => {
    if (!data || viewed.current) return;
    viewed.current = true;
    track('passport_viewed', {
      relation: data.is_me ? 'self' : 'other',
      visible: data.visible,
      from_stamp: hasTarget(target),
    });
  }, [data, target]);

  // Opening your own id from a link shows your Passport.
  useEffect(() => {
    if (!self && data?.is_me) router.replace('/passport');
  }, [self, data?.is_me]);

  let body: ReactNode;
  if (view.isPending) {
    body = (
      <View className="gap-space-6" {...loadingProps('Loading Passport')}>
        <Skeleton kind="text" lines={4} />
        <Skeleton kind="strip" />
        <Skeleton kind="strip" />
      </View>
    );
  } else if (!data && view.isError) {
    body = (
      <InlineError
        message={errorMessage(ojoroErrorOf(view.error))}
        action="TRY AGAIN"
        onAction={() => void view.refetch()}
      />
    );
  } else if (!data) {
    body = (
      <View className="gap-space-3" testID="passport-unavailable">
        <DisplayText size="sm" accessibilityRole="header">
          {"THIS PASSPORT ISN'T AVAILABLE."}
        </DisplayText>
        <Text variant="body" muted>
          It may have been removed, or it isn't shown to you.
        </Text>
      </View>
    );
  } else {
    body = (
      <PassportBody
        view={data}
        self={self}
        target={target}
        onReportBlock={() =>
          reportBlock.open({ subjectKind: 'profile', subjectId: userId, personName: data.display_name ?? 'them' })
        }
      />
    );
  }

  return (
    <Screen situation="after" scroll gutter={false}>
      <View className="flex-row items-center justify-between px-space-2 pt-space-2">
        <IconButton
          icon="back"
          label="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace(self ? '/you' : '/'))}
        />
        {!self && data ? (
          <IconButton
            icon="more"
            label={`Report or block ${data.display_name ?? ''}`.trim()}
            testID="passport-report-block"
            onPress={() =>
              reportBlock.open({ subjectKind: 'profile', subjectId: userId, personName: data.display_name ?? 'them' })
            }
          />
        ) : null}
      </View>
      <View className="gap-space-10 px-space-5 pb-space-10 pt-space-3" testID="passport-screen">
        {!online && data ? (
          <OfflineNote
            dataUpdatedAt={view.dataUpdatedAt}
            what={self ? 'your Passport' : 'this Passport'}
            extra={self ? 'Goal changes wait until you are back.' : undefined}
          />
        ) : null}
        {body}
      </View>
      {reportBlock.sheet}
    </Screen>
  );
}

function PassportBody({
  view,
  self,
  target,
  onReportBlock,
}: {
  view: PassportView;
  self: boolean;
  target: StampTarget;
  onReportBlock: () => void;
}) {
  const tz = view.time_zone;
  const totals = view.totals;
  const first = firstName(view.display_name ?? '');
  const lines = headlineLines(totals ?? { stamps: 0, places: 0, people_moved_with: 0 });
  const since = sinceLine(totals?.first_at ?? null, tz);

  return (
    <>
      <View className="gap-space-4" testID="passport-header">
        <Text variant="overline">{passportOverline(view)}</Text>
        {view.visible && totals ? (
          <>
            <DisplayText
              size="md"
              style={tabular}
              accessibilityRole="header"
              accessibilityLabel={lines.join(' ')}
              testID="passport-headline"
            >
              {lines.join('\n')}
            </DisplayText>
            {since ? (
              <Text variant="body-sm" muted>
                {since}
              </Text>
            ) : null}
            <View className="flex-row gap-space-3 border-t border-line pt-space-4">
              <Stat value={formatHours(totals.ojoro_hours)} label="Ojoro hours" />
              <Stat value={String(totals.games)} label={totals.games === 1 ? 'Game' : 'Games'} />
              <Stat value={String(totals.challenges)} label={totals.challenges === 1 ? 'Challenge' : 'Challenges'} />
            </View>
          </>
        ) : (
          <DisplayText size="md" accessibilityRole="header">
            {(view.display_name ?? '').toUpperCase()}
          </DisplayText>
        )}
        {self && view.history_visibility && view.goals_visibility ? (
          <View className="gap-space-1">
            <Text variant="caption" muted testID="passport-visibility">
              {passportVisibilityLine(view.history_visibility, view.goals_visibility)}
            </Text>
            <TextButton onPress={() => router.push('/settings/privacy')}>EDIT VISIBILITY</TextButton>
          </View>
        ) : null}
      </View>

      {!view.visible ? (
        <PrivacyNote>{`${first || 'This person'} keeps their games and Passport to a smaller circle.`}</PrivacyNote>
      ) : null}

      {view.visible && hasTarget(target) ? <TargetStamp userId={view.user_id} target={target} tz={tz} /> : null}

      <GoalSection
        userId={view.user_id}
        self={self}
        visible={view.goals_visible}
        from="passport"
      />

      {view.visible ? (
        <>
          <Milestones view={view} />
          <PersonalBests view={view} />
          <Achievements userId={view.user_id} self={self} tz={tz} />
          <Reputation userId={view.user_id} self={self} />
          <Stamps view={view} self={self} />
        </>
      ) : null}

      {!self ? (
        <View className="items-start border-t border-line pt-space-4">
          <TextButton onPress={onReportBlock} testID="passport-report-block-link">
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

/** The stamp a Recap or Result link opened: on top, with what it was and the way back to it. */
function TargetStamp({ userId, target, tz }: { userId: string; target: StampTarget; tz: string }) {
  const stamps = usePassportStamps(userId, { by: 'all' });
  const rows = useMemo(() => stamps.data?.pages.flat() ?? [], [stamps.data]);
  const found = findStamp(rows, target);
  if (!found) return null;
  const props = stampProps(found, tz);
  const href = stampHref(found);
  return (
    <View className="gap-space-4" testID="passport-target">
      <Divider label="THIS STAMP" />
      <View className="items-center">
        <PassportStamp {...props} />
      </View>
      <Text variant="body-sm">{stampLine(found)}</Text>
      {href ? (
        <View className="flex-row">
          <TextButton onPress={() => router.push(href as Href)}>
            {found.kind === 'challenge' ? 'OPEN THE RESULT' : 'OPEN THE RECAP'}
          </TextButton>
        </View>
      ) : null}
    </View>
  );
}

function Milestones({ view }: { view: PassportView }) {
  if (view.milestones.length === 0) return null;
  return (
    <View className="gap-space-3" aria-label="Firsts and milestones" testID="passport-milestones">
      <Divider label="FIRSTS AND MILESTONES" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-space-5">
        <View className="flex-row gap-space-2 px-space-5 py-space-3">
          {view.milestones.map((m, i) => (
            <PassportStamp key={m.entry_id} {...stampProps(m, view.time_zone)} tilt={i % 2 === 0} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function PersonalBests({ view }: { view: PassportView }) {
  if (view.personal_bests.length === 0) return null;
  return (
    <View className="gap-space-2" aria-label="Personal bests" testID="passport-pbs">
      <Divider label="PERSONAL BESTS" />
      <StripList>
        {view.personal_bests.map((pb) => (
          <Strip
            key={pb.personal_best_id}
            title={personalBestTitle(pb)}
            titleVariant="title"
            meta={personalBestMeta(pb, view.time_zone)}
            trailing={pb.event_id ? 'chevron' : undefined}
            href={pb.event_id ? (`/event/${pb.event_id}` as Href) : undefined}
            accessibilityHint={pb.event_id ? 'Opens the result' : undefined}
            testID={`passport-pb-${pb.discipline}`}
          />
        ))}
      </StripList>
    </View>
  );
}

function Achievements({ userId, self, tz }: { userId: string; self: boolean; tz: string }) {
  const q = usePassportAchievements(userId);
  if (q.isPending) {
    return (
      <View {...loadingProps('Loading achievements')}>
        <Skeleton kind="strip" />
      </View>
    );
  }
  if (q.isError && !q.data) {
    return (
      <InlineError message={errorMessage(ojoroErrorOf(q.error))} action="TRY AGAIN" onAction={() => void q.refetch()} />
    );
  }
  const { reached, next } = achievementRows(q.data ?? [], tz);
  if (reached.length === 0 && next.length === 0) return null;
  return (
    <View className="gap-space-2" aria-label="Achievements" testID="passport-achievements">
      <Divider label="ACHIEVEMENTS" />
      {reached.length > 0 ? (
        <StripList>
          {reached.map((a) => (
            <Strip key={a.key} title={a.title} titleVariant="title-sm" meta={a.meta || undefined} trailing={<Badge>REACHED</Badge>} />
          ))}
        </StripList>
      ) : (
        <Text variant="body-sm" muted>
          {self ? 'Nothing reached yet. Your first game is the first one.' : 'Nothing reached yet.'}
        </Text>
      )}
      {self && next.length > 0 ? (
        <>
          <Text variant="label" muted className="pt-space-4">
            NEXT
          </Text>
          <StripList>
            {next.slice(0, 3).map((a) => (
              <Strip key={a.key} title={a.title} titleVariant="title-sm" meta={a.meta} />
            ))}
          </StripList>
        </>
      ) : null}
    </View>
  );
}

function Reputation({ userId, self }: { userId: string; self: boolean }) {
  const q = usePassportReputation(userId);
  const r = q.data;
  if (!r) return null;
  const hasAnything = r.signals.length > 0 || r.show_up || r.hosted > 0 || r.building.length > 0;
  if (!hasAnything) return null;
  return (
    <View className="gap-space-3" aria-label="Reputation" testID="passport-reputation">
      <Divider label="REPUTATION" />
      {r.show_up ? (
        <Text variant="body" style={tabular}>
          {showUpSentence(r.show_up)}
        </Text>
      ) : null}
      {r.hosted > 0 ? (
        <Text variant="body-sm" muted style={tabular}>
          {r.hosted === 1 ? 'Hosted 1 game.' : `Hosted ${r.hosted} games.`}
        </Text>
      ) : null}
      {r.signals.length > 0 ? (
        <View className="flex-row flex-wrap gap-space-2">
          {r.signals.map((s) => (
            <Badge key={s.kind} tone="verified">
              {reputationLabel(s.kind, s.confirmations)}
            </Badge>
          ))}
        </View>
      ) : null}
      {self && r.building.length > 0 ? (
        <Text variant="caption" muted>
          {`On the way: ${r.building.map((k) => reputationLabel(k).toLowerCase()).join(', ')}.`}
        </Text>
      ) : null}
      {self ? (
        <Text variant="caption" muted>
          {`From people you've played with. A signal only appears after ${r.threshold} confirmations.`}
        </Text>
      ) : null}
    </View>
  );
}

function Stamps({ view, self }: { view: PassportView; self: boolean }) {
  const [by, setBy] = useState<FilterBy>('all');
  const [value, setValue] = useState<string | null>(null);
  const values = filterValues(view, by);
  const filter = toFilter(by, value);
  const q = usePassportStamps(view.user_id, filter);
  const rows: StampRow[] = useMemo(() => q.data?.pages.flat() ?? [], [q.data]);

  const pickBy = (next: FilterBy) => {
    setBy(next);
    const first = filterValues(view, next)[0]?.id ?? null;
    setValue(first);
    track('passport_filter_changed', { by: next });
  };

  return (
    <View className="gap-space-3" aria-label="Stamps" testID="passport-stamps">
      <Divider label="STAMPS" />
      <ChipRow label="Group stamps by" testID="passport-filter-by">
        {FILTER_BYS.map((f) => (
          <Chip key={f.by} selected={by === f.by} onPress={() => pickBy(f.by)} testID={`passport-by-${f.by}`}>
            {f.label}
          </Chip>
        ))}
      </ChipRow>
      {values.length > 0 ? (
        <ChipRow label="Pick one" testID="passport-filter-value">
          {values.map((v) => (
            <Chip key={v.id} selected={value === v.id} onPress={() => setValue(v.id)}>
              {`${v.label} · ${v.count}`}
            </Chip>
          ))}
        </ChipRow>
      ) : null}

      {q.isPending ? (
        <View {...loadingProps('Loading stamps')}>
          <Skeleton kind="strip" />
          <Skeleton kind="strip" />
        </View>
      ) : q.isError && rows.length === 0 ? (
        <InlineError message={errorMessage(ojoroErrorOf(q.error))} action="TRY AGAIN" onAction={() => void q.refetch()} />
      ) : rows.length === 0 ? (
        <Text variant="body-sm" muted testID="passport-stamps-empty">
          {emptyStampsLine(filter, self)}
        </Text>
      ) : (
        <View className="flex-row flex-wrap justify-center gap-space-2">
          {rows.map((s, i) => (
            <StampTile key={s.entry_id} stamp={s} tz={view.time_zone} tilt={i % 2 === 0} />
          ))}
        </View>
      )}
      {q.hasNextPage ? (
        <Button
          variant="secondary"
          onPress={() => void q.fetchNextPage()}
          loading={q.isFetchingNextPage}
          className="self-center"
          testID="passport-more"
        >
          MORE STAMPS
        </Button>
      ) : null}
    </View>
  );
}

/** A stamp in the list: opens its Recap or Result when you can see that game. */
function StampTile({ stamp, tz, tilt }: { stamp: StampRow; tz: string; tilt: boolean }) {
  const props = stampProps(stamp, tz);
  const href = stampHref(stamp);
  const label = `${props.title}, ${props.place}, ${props.date}. ${stampLine(stamp)}.`;
  const content = <PassportStamp {...props} tilt={tilt} />;
  if (!href) {
    return (
      <View accessible accessibilityLabel={label} style={{ width: STAMP_SIZE }} testID={`stamp-${stamp.entry_id}`}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={() => router.push(href as Href)}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint={stamp.kind === 'challenge' ? 'Opens the result' : 'Opens the recap'}
      style={({ pressed }) => ({ width: STAMP_SIZE, opacity: pressed ? 0.7 : 1 })}
      testID={`stamp-${stamp.entry_id}`}
    >
      {content}
    </Pressable>
  );
}
