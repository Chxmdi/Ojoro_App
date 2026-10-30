/**
 * `/clash/[id]`: Ojoro Clash (design-handoff/screens/Clash.png, live in the design; the ground follows
 * the Clash's stage through `clash_view.situation`; PRD §9.15; docs/COMMUNITIES_CONTRACT.md, Ojoro
 * Clash). Header OJORO CLASH · FALL 2026 with share; the poster (your clan first, VS between
 * poster rules, the score, AFTER 3 OF 6 and who leads); YOUR PART with YOU'RE DOWN / I'M DOWN for a
 * squad; THE SIX EVENTS with their results; THE CROWD. Backing never changes a score.
 */
import { borderWidth, type SituationId } from '@ojoro/design-tokens';
import type { ClashEvent, ClashMyPart, ClashView } from '@ojoro/contracts';
import { type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Share, View } from 'react-native';

import {
  Badge,
  Button,
  CrowdSupport,
  DisplayText,
  Divider,
  IconButton,
  loadingProps,
  Modal,
  Screen,
  Skeleton,
  Strip,
  Text,
  TextButton,
  useToast,
} from '@/design-system';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';
import { useReportBlock } from '@/features/safety';

import { useOnline } from '../activities/data';
import { InlineError, LoadingState, OfflineNote, ScreenHeader } from '../activities/ui';
import { useNow } from '../plans/data';
import { useBackClash, useClashEvents, useClashMyPart, useClashRealtime, useClashView, useSquad } from './data';
import { canBack, clashOverline, clashShareText, eventRow, myPartCopy, posterSides, scoreBlock } from './logic';

const SITUATIONS: readonly SituationId[] = ['calm', 'forming', 'confirmed', 'live', 'after'];
const COUNT_WORDS = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE'];

function situationOf(value: string | null | undefined): SituationId {
  return SITUATIONS.includes(value as SituationId) ? (value as SituationId) : 'live';
}

export function ClashScreen({ id }: { id: string }) {
  const online = useOnline();
  const toast = useToast();
  useClashRealtime(id);
  const view = useClashView(id);
  const clash = view.data ?? null;
  const now = useNow([]);
  const reportBlock = useReportBlock();

  useEffect(() => {
    track('screen_viewed', { screen: 'clash', clash_id: id });
    track('clash_viewed', { clash_id: id });
  }, [id]);

  const share = async () => {
    if (!clash) return;
    track('clash_shared', { clash_id: id });
    try {
      await Share.share({ message: clashShareText(clash, now) });
    } catch {
      toast.show({ kind: 'neutral', message: "Sharing isn't available here." });
    }
  };

  return (
    <Screen situation={situationOf(clash?.situation)} scroll gutter={false}>
      <ScreenHeader
        overline={clash ? clashOverline(clash) : 'OJORO CLASH'}
        fallback={'/you' as Href}
        right={clash ? <IconButton icon="share" label="Share the Clash" onPress={() => void share()} testID="clash-share" /> : undefined}
      />
      {view.isPending && !clash ? (
        <LoadingState label="Loading the Clash" kinds={['object', 'text', 'strip', 'strip']} />
      ) : !clash ? (
        <ClashUnavailable error={view.error} onRetry={() => void view.refetch()} />
      ) : (
        <View testID="clash-screen">
          {!online ? (
            <View className="px-space-5 pt-space-3">
              <OfflineNote dataUpdatedAt={view.dataUpdatedAt} extra="Squads and backing wait until you're back." />
            </View>
          ) : null}
          <Poster clash={clash} now={now} />
          <View className="gap-space-10 px-space-5 pb-space-10 pt-space-2">
            <YourPart id={id} clash={clash} now={now} online={online} />
            <Events id={id} clash={clash} now={now} />
            <Crowd id={id} clash={clash} online={online} />
            <TextButton
              onPress={() => reportBlock.open({ subjectKind: 'clash', subjectId: id, personName: clash.title })}
              className="self-start"
              testID="clash-report"
            >
              REPORT THE CLASH
            </TextButton>
          </View>
        </View>
      )}
      {reportBlock.sheet}
    </Screen>
  );
}

function ClashUnavailable({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const e = ojoroErrorOf(error);
  const gone = !error || e.code === 'clash_not_found';
  return (
    <View className="gap-space-4 px-space-5 pt-space-8" testID="clash-unavailable">
      {gone ? (
        <>
          <Text variant="title">This Clash isn't available.</Text>
          <Text variant="body-sm" muted>
            A Clash is open to both clans, and to anyone who can see both once it's on.
          </Text>
        </>
      ) : (
        <InlineError message={errorMessage(e)} action="RETRY" onAction={onRetry} testID="screen-error" />
      )}
    </View>
  );
}

const hidden =
  Platform.OS === 'web'
    ? { 'aria-hidden': true as const }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

/** `.oj-callout-rule`: a poster-weight bar, skewed like the Mark. */
function Rule() {
  return (
    <View {...hidden} className="flex-1 bg-text" style={{ height: borderWidth['border-poster'], transform: [{ skewX: '-24deg' }] }} />
  );
}

function Poster({ clash, now }: { clash: ClashView; now: Date }) {
  const [first, second] = posterSides(clash);
  const s = scoreBlock(clash, now);
  return (
    <View className="gap-space-5 px-space-5 pb-space-6 pt-space-4" role="region" accessible accessibilityLabel={s.spoken} testID="clash-poster">
      <View className="gap-space-1">
        <DisplayText size="lg" accessibilityRole="header">
          {first.poster}
        </DisplayText>
        <View className="flex-row items-center gap-space-3">
          <Rule />
          <DisplayText size="sm">VS</DisplayText>
          <Rule />
        </View>
        <DisplayText size="lg" style={{ textAlign: 'right' }}>
          {second.poster}
        </DisplayText>
      </View>
      <View className="flex-row items-end justify-between gap-space-3 border-t border-line pt-space-4">
        <DisplayText size="hero" style={{ fontVariant: ['tabular-nums'] }} testID="clash-score">
          {s.score}
        </DisplayText>
        <View className="shrink items-end gap-space-1">
          <Text variant="label" testID="clash-after">
            {s.label}
          </Text>
          <Text variant="body-sm" muted className="text-right">
            {s.line}
          </Text>
        </View>
      </View>
    </View>
  );
}

function YourPart({ id, clash, now, online }: { id: string; clash: ClashView; now: Date; online: boolean }) {
  const part = useClashMyPart(id, clash.my_side !== null);
  const squad = useSquad(id);
  const [confirmLeave, setConfirmLeave] = useState<ClashMyPart | null>(null);
  if (clash.my_side === null) return null;
  if (part.isPending) {
    return (
      <View {...loadingProps('Loading your part')}>
        <Skeleton kind="object" />
      </View>
    );
  }
  const p = part.data ?? null;
  if (!p) {
    if (part.isError) return <InlineError message={errorMessage(ojoroErrorOf(part.error))} action="RETRY" onAction={() => void part.refetch()} />;
    return null;
  }
  const copy = myPartCopy(p, now, clash.time_zone);
  return (
    <View className="gap-space-3 bg-surface-raised p-space-5" role="region" aria-label="Your part" testID="clash-my-part">
      <Text variant="overline">{copy.overline}</Text>
      <Text variant="title">{copy.title}</Text>
      <Text variant="body-sm" muted style={{ fontVariant: ['tabular-nums'] }}>
        {copy.meta}
      </Text>
      <Button
        variant="commit"
        committed={p.i_am_in}
        block
        disabled={!online || squad.isPending}
        accessibilityHint={p.i_am_in ? 'Tap to leave the squad' : undefined}
        onPress={() => {
          if (p.i_am_in) setConfirmLeave(p);
          else squad.mutate({ eventId: p.clash_event_id, join: true });
        }}
        testID="clash-my-part-down"
      >
        I'M DOWN
      </Button>
      {squad.isError ? <InlineError message={errorMessage(ojoroErrorOf(squad.error))} /> : null}
      <Modal
        visible={!!confirmLeave}
        title="LEAVE THE SQUAD?"
        body={`${Math.max(0, p.squad_taken - 1)} stay in the squad. Your spot opens for someone else in the clan.`}
        confirm="LEAVE"
        cancel="STAY IN"
        onCancel={() => setConfirmLeave(null)}
        onConfirm={() => {
          const leaving = confirmLeave;
          setConfirmLeave(null);
          if (leaving) squad.mutate({ eventId: leaving.clash_event_id, join: false });
        }}
      />
    </View>
  );
}

function Events({ id, clash, now }: { id: string; clash: ClashView; now: Date }) {
  const events = useClashEvents(id, true);
  const rows = events.data ?? [];
  const n = clash.event_count;
  const label = `THE ${COUNT_WORDS[n] ?? n} EVENT${n === 1 ? '' : 'S'}`;
  return (
    <View className="gap-space-1" role="region" aria-label="Events" testID="clash-events">
      <Divider kind="mark" label={label} />
      {events.isPending ? (
        <View {...loadingProps('Loading the events')}>
          <Skeleton kind="strip" />
          <Skeleton kind="strip" />
        </View>
      ) : events.isError && rows.length === 0 ? (
        <InlineError message={errorMessage(ojoroErrorOf(events.error))} action="RETRY" onAction={() => void events.refetch()} />
      ) : (
        rows.map((e: ClashEvent) => {
          const row = eventRow(e, clash, now, clash.time_zone);
          return (
            <Strip
              key={e.clash_event_id}
              leading={String(e.position)}
              leadingLabel={`Event ${e.position}`}
              title={e.title}
              titleVariant="title-sm"
              meta={row.meta}
              trailing={<Badge tone={row.signal ? 'signal' : 'neutral'}>{row.badge}</Badge>}
              testID={`clash-event-${e.position}`}
            />
          );
        })
      )}
    </View>
  );
}

function Crowd({ id, clash, online }: { id: string; clash: ClashView; online: boolean }) {
  const toast = useToast();
  const back = useBackClash(id);
  const [first, second] = posterSides(clash);
  const count = (k: 'a' | 'b') => (k === 'a' ? clash.backing_a : clash.backing_b);
  const open = canBack(clash, 'a') || canBack(clash, 'b');
  // CrowdSupport's a/b are the poster's left and right: your clan first.
  const toPoster = (side: 'a' | 'b' | null) => (side === null ? undefined : side === first.key ? 'a' : 'b');
  return (
    <View className="gap-space-4">
      <CrowdSupport
        a={{ name: first.spoken, count: count(first.key) }}
        b={{ name: second.spoken, count: count(second.key) }}
        backing={toPoster(clash.my_backing)}
        disabled={!online || !open || back.isPending}
        onBack={(posterKey) => {
          const side = posterKey === 'a' ? first.key : second.key;
          if (!canBack(clash, side)) {
            toast.show({ kind: 'neutral', message: 'You can back your own clan.' });
            return;
          }
          back.mutate(clash.my_backing === side ? null : side);
        }}
        testID="clash-crowd"
      />
      {back.isError ? <InlineError message={errorMessage(ojoroErrorOf(back.error))} /> : null}
      <Text variant="caption" muted>
        {clash.my_side ? 'You can back your own clan. ' : ''}Backing is for fun and never changes a score. No stakes, no prizes.
      </Text>
    </View>
  );
}
