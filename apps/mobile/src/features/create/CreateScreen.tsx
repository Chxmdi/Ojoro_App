/**
 * Create (Create.png): TELL OJORO (the Movement Concierge: one best match with a plain WHY and one
 * confirm action, up to two more ideas; or, when nothing fits, the way to start something), then the ways to start: Down For (the sheet), Quick
 * Plan and Activity (`/create/plan`), and Call Out (`/challenge/new`, Step 5). Crew (M7) and Route
 * aren't built, so they aren't offered. Ojoro suggests; nothing is sent or joined until the person confirms.
 */
import type { ConciergeAnswer, ConciergeStart } from '@ojoro/contracts';
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
  answerIdeas,
  answerKey,
  answerWhy,
  CONCIERGE_HINT,
  confirmLabel,
  conciergeErrorLine,
  ideaCount,
  ideaTitle,
  moreIdeasLabel,
  nothingFitsPanel,
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
            onStart={open}
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
  onStart,
}: {
  concierge: ReturnType<typeof useConcierge>;
  online: boolean;
  onDownFor: (sportId: string | null) => void;
  onStart: (start: 'quick_plan' | 'activity' | 'call_out') => void;
}) {
  const [picked, setPicked] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const answer = concierge.data;
  const key = answerKey(answer);
  const [seen, setSeen] = useState(key);
  if (seen !== key) {
    // New answer: start from its best match again.
    setSeen(key);
    setPicked(0);
    setMoreOpen(false);
  }

  if (concierge.query === null) return null;
  if (!online && !answer) {
    return <Toast kind="offline" message="Offline. Ojoro suggests when you're back." />;
  }
  if (concierge.isPending) {
    return (
      <View className="gap-space-3 bg-surface-raised p-space-5" {...loadingProps('Ojoro is looking')}>
        <Skeleton kind="text" lines={3} />
      </View>
    );
  }
  if (concierge.isError && !answer) {
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
  if (!answer) return null;

  const ideas = answerIdeas(answer);
  // With no best match, index 0 is the "nothing fits" panel and the ideas start at 1.
  const offset = answer.best ? 0 : 1;
  const current = picked - offset;
  const idea = current >= 0 ? ideas[Math.min(current, ideas.length - 1)] : undefined;
  const others = ideas.map((r, i) => ({ r, i: i + offset })).filter(({ i }) => i !== picked);
  const more = moreIdeasLabel(others.length, moreOpen);
  const toggleMore = () => {
    if (!moreOpen) track('concierge_more_ideas_tapped', { count: others.length, source: answer.source });
    setMoreOpen((o) => !o);
  };

  return (
    <View className="gap-space-3">
      {!online ? <Toast kind="offline" message="Offline. These ideas may be out of date." /> : null}
      {idea ? (
        <IdeaPanel
          key={idea.plan_id ?? `${idea.sport_id}-${idea.starts_at}`}
          idea={idea}
          why={answerWhy(answer, idea)}
          source={answer.source}
          overline={picked === 0 && answer.best ? 'BEST MATCH' : 'ANOTHER IDEA'}
          more={more}
          onMore={toggleMore}
        />
      ) : (
        <NothingFits
          answer={answer}
          more={more}
          onMore={toggleMore}
          onStart={(start) => {
            track('concierge_start_tapped', { start, outcome: answer.outcome, source: answer.source });
            if (start === 'down_for') onDownFor(answer.sport_id);
            else onStart(start);
          }}
        />
      )}
      {moreOpen ? (
        <View role="list" aria-label="More ideas" testID="more-ideas">
          {others.map(({ r, i }) => (
            <Strip
              key={r.plan_id ?? `${r.sport_id}-${r.starts_at}`}
              title={ideaTitle(r, new Date(), TZ)}
              titleVariant="title-sm"
              meta={answerWhy(answer, r) ?? undefined}
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

/** Nothing fits (or the text wasn't about moving): the way to start something, in fixed words. */
function NothingFits({
  answer,
  more,
  onMore,
  onStart,
}: {
  answer: ConciergeAnswer;
  more: string | null;
  onMore: () => void;
  onStart: (start: ConciergeStart) => void;
}) {
  const panel = nothingFitsPanel(answer);
  return (
    <Panel
      overline={panel.overline}
      body={panel.body}
      accessibilityLabel={answer.outcome === 'not_movement' ? 'Tell Ojoro what you want to do' : 'Nothing fits yet'}
      testID="concierge-empty"
      actionsAlign="end"
      actions={
        <>
          {more ? (
            <Button variant="ghost" onPress={onMore} testID="more-ideas-toggle">
              {more}
            </Button>
          ) : null}
          <Button variant="secondary" onPress={() => onStart(panel.start)} testID="concierge-start">
            {panel.action}
          </Button>
        </>
      }
    />
  );
}

/** One suggestion and its confirm. Keyed by the idea, so the hooks belong to it. */
function IdeaPanel({
  idea,
  why,
  source,
  overline,
  more,
  onMore,
}: {
  idea: Idea;
  why: string | null;
  source: 'ai' | 'rules';
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

  const confirm = () => {
    track('concierge_confirmed', { kind: idea.kind, sport: idea.sport_id, source });
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
