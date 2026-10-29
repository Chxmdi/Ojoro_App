/**
 * Create (Create.png): TELL OJORO (the rules-based Concierge: one best match with a plain WHY and
 * one confirm action, up to two more ideas), then the ways to start: Down For (the sheet), Quick
 * Plan and Activity (`/create/plan`), and Call Out (`/challenge/new`, Step 5). Crew (M7) and Route
 * aren't built, so they aren't offered. Ojoro suggests; nothing is sent or joined until the person confirms.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import {
  Button,
  DisplayText,
  Divider,
  Input,
  loadingProps,
  Panel,
  Progress,
  Screen,
  Skeleton,
  Strip,
  Text,
  Toast,
  useToast,
} from '@/design-system';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { DownForSheet } from '../downfor/DownForSheet';
import { useCreateFromDemand } from '../home/data';
import { useImDown, useMyArea, useNow, useOnline } from '../plans/data';
import { routes } from '../plans/parts';
import { DEFAULT_TIME_ZONE } from '../plans/time';
import { InlineError } from '../profile/states';
import {
  CONCIERGE_HINT,
  confirmLabel,
  conciergeErrorLine,
  ideaCount,
  ideaTitle,
  ideaWhy,
  moreIdeasLabel,
  NOTHING_FITS,
  type Idea,
} from './conciergeLogic';
import { useConcierge } from './data';

const TZ = DEFAULT_TIME_ZONE;

export function CreateScreen() {
  const auth = useAuth();
  const userId = auth.status === 'signed-in' ? auth.session.user.id : null;
  const router = useRouter();
  const online = useOnline();
  const area = useMyArea(userId);
  const [text, setText] = useState('');
  const [sheet, setSheet] = useState<{ sportId: string | null } | null>(null);
  const concierge = useConcierge(text);

  const open = (option: 'down_for' | 'quick_plan' | 'activity' | 'call_out') => {
    track('create_option_opened', { option });
    if (option === 'down_for') setSheet({ sportId: null });
    else if (option === 'call_out') router.push('/challenge/new');
    else router.push(option === 'activity' ? '/create/plan?kind=activity' : '/create/plan');
  };

  return (
    <Screen situation="calm" scroll gutter={false}>
      <View className="gap-space-10 px-space-5 pb-space-10 pt-space-6" testID="create-screen">
        <View className="gap-space-4" role="region" aria-label="Movement Concierge">
          <Text variant="overline">CREATE</Text>
          <DisplayText size="lg" accessibilityRole="header">
            WHAT ARE WE DOING?
          </DisplayText>
          <Input
            label="Tell Ojoro"
            multiline
            value={text}
            onChangeText={setText}
            placeholder="I have 90 minutes and want to meet people."
            hint={CONCIERGE_HINT}
            maxLength={200}
            testID="tell-ojoro"
          />
          <Suggestions
            concierge={concierge}
            online={online}
            onDownFor={(sportId) => setSheet({ sportId })}
          />
        </View>

        <View className="gap-space-2" role="region" aria-label="Start something">
          <Divider label="OR START SOMETHING" />
          <View>
            <Strip
              title="DOWN FOR"
              titleVariant="display-sm"
              meta="Say what you're up for and when. It expires on its own."
              trailing="chevron"
              onPress={() => open('down_for')}
              accessibilityHint="Opens the Down For sheet"
              testID="create-down-for"
            />
            <Strip
              title="QUICK PLAN"
              titleVariant="display-sm"
              meta="Pick the sport, a time and a place. Ojoro handles the rest."
              trailing="chevron"
              onPress={() => open('quick_plan')}
              testID="create-quick-plan"
            />
            <Strip
              title="ACTIVITY"
              titleVariant="display-sm"
              meta="Full details: capacity, teams, cost, kit."
              trailing="chevron"
              onPress={() => open('activity')}
              testID="create-activity"
            />
            <Strip
              title="CALL OUT"
              titleVariant="display-sm"
              meta="Challenge someone. If they accept, it becomes an event."
              trailing="chevron"
              onPress={() => open('call_out')}
              testID="create-call-out"
            />
          </View>
        </View>
      </View>

      <DownForSheet
        visible={sheet !== null}
        onClose={() => setSheet(null)}
        initialSportId={sheet?.sportId}
        defaultRadiusKm={area.data?.discovery_radius_km}
        source="create"
      />
    </Screen>
  );
}

function Suggestions({
  concierge,
  online,
  onDownFor,
}: {
  concierge: ReturnType<typeof useConcierge>;
  online: boolean;
  onDownFor: (sportId: string | null) => void;
}) {
  const [picked, setPicked] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const rows = (concierge.data ?? []) as Idea[];
  const key = rows.map((r) => r.plan_id ?? `${r.sport_id}-${r.starts_at}`).join('|');
  const [seen, setSeen] = useState(key);
  if (seen !== key) {
    // New answer: start from its best match again.
    setSeen(key);
    setPicked(0);
    setMoreOpen(false);
  }

  if (concierge.query === null) return null;
  if (!online && rows.length === 0) {
    return <Toast kind="offline" message="Offline. Ojoro suggests when you're back." />;
  }
  if (concierge.isPending) {
    return (
      <View className="gap-space-3 bg-surface-raised p-space-5" {...loadingProps('Ojoro is looking')}>
        <Skeleton kind="text" lines={3} />
      </View>
    );
  }
  if (concierge.isError && rows.length === 0) {
    const err = ojoroErrorOf(concierge.error);
    return (
      <InlineError
        message={conciergeErrorLine(err.code, err.detail) ?? errorMessage(err)}
        action="TRY AGAIN"
        onAction={() => void concierge.refetch()}
        testID="concierge-error"
      />
    );
  }
  if (rows.length === 0) {
    return (
      <Panel
        overline="NOTHING FITS YET"
        body={NOTHING_FITS}
        accessibilityLabel="Nothing fits yet"
        testID="concierge-empty"
        actions={
          <Button variant="secondary" onPress={() => onDownFor(null)}>
            SAY YOU&apos;RE DOWN
          </Button>
        }
      />
    );
  }

  const idea = rows[Math.min(picked, rows.length - 1)] as Idea;
  const others = rows.map((r, i) => ({ r, i })).filter(({ i }) => i !== picked);
  const more = moreIdeasLabel(others.length, moreOpen);

  return (
    <View className="gap-space-3">
      {!online ? <Toast kind="offline" message="Offline. These ideas may be out of date." /> : null}
      <IdeaPanel
        key={idea.plan_id ?? `${idea.sport_id}-${idea.starts_at}`}
        idea={idea}
        overline={picked === 0 ? 'BEST MATCH' : 'ANOTHER IDEA'}
        more={more}
        onMore={() => {
          if (!moreOpen) track('concierge_more_ideas_tapped', { count: others.length });
          setMoreOpen((o) => !o);
        }}
      />
      {moreOpen ? (
        <View role="list" aria-label="More ideas" testID="more-ideas">
          {others.map(({ r, i }) => (
            <Strip
              key={r.plan_id ?? `${r.sport_id}-${r.starts_at}`}
              title={ideaTitle(r, new Date(), TZ)}
              titleVariant="title-sm"
              meta={ideaWhy(r) ?? undefined}
              trailing="chevron"
              accessibilityHint="Shows this idea above. Nothing is joined."
              onPress={() => {
                setPicked(i);
                setMoreOpen(false);
              }}
              testID={`idea-${i}`}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** One suggestion and its confirm. Keyed by the idea, so the hooks belong to it. */
function IdeaPanel({
  idea,
  overline,
  more,
  onMore,
}: {
  idea: Idea;
  overline: string;
  more: string | null;
  onMore: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const now = useNow([]);
  const imDown = useImDown(idea.plan_id ?? 'none');
  const fromDemand = useCreateFromDemand();
  const count = ideaCount(idea);
  const why = ideaWhy(idea);

  const confirm = () => {
    track('concierge_confirmed', { kind: idea.kind, sport: idea.sport_id });
    const onError = (e: unknown) => {
      const err = ojoroErrorOf(e);
      if (err.code === 'plan_full' && idea.plan_id) router.push(routes.plan(idea.plan_id));
      else toast.show({ kind: 'error', message: errorMessage(err) });
      if (err.code === 'area_required') router.push('/settings/area');
    };
    if (idea.kind === 'plan' && idea.plan_id) {
      track('im_down_tapped', { plan_id: idea.plan_id, source: 'concierge' });
      const id = idea.plan_id;
      imDown.tap({ onSuccess: () => router.push(routes.plan(id)), onError });
    } else if (idea.kind === 'demand' && idea.window_end) {
      track('make_it_happen_tapped', { source: 'concierge', sport: idea.sport_id });
      fromDemand.tap(
        { sport_id: idea.sport_id, suggested_start: idea.starts_at, window_end: idea.window_end },
        { onSuccess: (state) => state.plan_id && router.push(routes.plan(state.plan_id)), onError },
      );
    }
  };

  return (
    <Panel
      overline={overline}
      title={ideaTitle(idea, now, TZ)}
      body={why ?? undefined}
      bodyMuted
      accessibilityLabel={overline === 'BEST MATCH' ? 'Best match' : 'Another idea'}
      testID="best-match"
      actionsAlign="end"
      actions={
        <>
          {more ? (
            <Button variant="ghost" onPress={onMore} testID="more-ideas-toggle">
              {more}
            </Button>
          ) : null}
          <Button
            loading={imDown.isPending || fromDemand.isPending}
            onPress={confirm}
            testID="concierge-confirm"
          >
            {confirmLabel(idea)}
          </Button>
        </>
      }
    >
      {count ? (
        <View className="gap-space-3">
          <Progress value={count.value} max={count.max} label={count.spoken} />
          <Text variant="label" style={{ fontVariant: ['tabular-nums'] }}>
            {count.label}
          </Text>
        </View>
      ) : null}
    </Panel>
  );
}
