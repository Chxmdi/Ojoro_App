/**
 * Run It Back (design-handoff/screens/RunItBack.png, after): pick a time, see what happens next,
 * RUN IT BACK. It opens a NEW plan (never copies attendance): the same people get an invite and
 * nobody is in, the caller included, until they tap I'M DOWN. Rituals aren't in Slice 01, so the
 * third "what happens next" line is left out. CHANGE TIME opens a minimal day-and-time sheet (not
 * designed; HANDOFF.md "pick a time").
 */
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Button, Chip, Divider, RunItBack, Screen, Sheet, Text } from '@/design-system';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { timeZoneOf, useActivityCard, useIntentKey, useNow, useOnline, usePlace } from '../activities/data';
import { clock, dateLabel, shortDate, zonedParts, zonedTime } from '../activities/format';
import { myAttendance, statusOf, type ActivityCard } from '../activities/model';
import {
  ErrorState,
  InlineError,
  LoadingState,
  NotFoundState,
  OfflineNote,
  QueuedNote,
  ScreenHeader,
} from '../activities/ui';
import { useRecap, useRecapPeople, useRunItBack } from './data';
import {
  crewLine,
  pickerDays,
  pickerTimes,
  runItBackOptions,
  startError,
  suggestedLine,
  timeLabel,
} from './logic';

export function RunItBackScreen({ id }: { id: string }) {
  const cardQ = useActivityCard(id);
  const card = cardQ.data ?? null;
  const placeQ = usePlace(id, card?.place_id);
  const tz = timeZoneOf(placeQ.data);
  return (
    <Screen situation="after" scroll gutter={false}>
      <ScreenHeader overline="RUN IT BACK" fallback={`/activity/${id}/recap` as Href} />
      {cardQ.isPending ? (
        <LoadingState label="Loading Run It Back" kinds={['object', 'text']} />
      ) : !card ? (
        cardQ.isError ? (
          <ErrorState error={cardQ.error} onRetry={() => void cardQ.refetch()} />
        ) : (
          <NotFoundState />
        )
      ) : (
        <RunItBackBody card={card} tz={tz} dataUpdatedAt={cardQ.dataUpdatedAt} />
      )}
    </Screen>
  );
}

function RunItBackBody({ card, tz, dataUpdatedAt }: { card: ActivityCard; tz: string; dataUpdatedAt: number }) {
  const now = useNow(60_000);
  const online = useOnline();
  const played = myAttendance(card) === 'checked-in';
  const status = statusOf(card, now);
  const finished = status === 'after' || status === 'complete';
  const peopleQ = useRecapPeople(card.id, played);
  const recapQ = useRecap(card.id);
  const run = useRunItBack(card.id);
  const intent = useIntentKey();
  const [options] = useState(() => runItBackOptions(card.starts_at, new Date(), tz));
  const [startsAt, setStartsAt] = useState(options[0]?.startsAt ?? card.starts_at);
  const [custom, setCustom] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);

  const people = (peopleQ.data ?? []).map((p) => ({ name: p.display_name ?? 'Someone' }));
  const count = recapQ.data?.played_count ?? card.checked_in_count;
  const suggested = suggestedLine(startsAt, card.place_name, tz);

  if (!played || !finished) {
    return (
      <View className="gap-space-4 px-space-5 pt-space-6" testID="run-it-back-unavailable">
        <Text variant="title">
          {!played ? 'Only people who played can run it back.' : 'You can run it back once the game ends.'}
        </Text>
        <Button variant="secondary" block onPress={() => router.push(`/activity/${card.id}` as Href)}>
          BACK TO THE GAME
        </Button>
      </View>
    );
  }

  const go = () => {
    const err = startError(startsAt, new Date());
    setValidation(err);
    if (err) return;
    track('run_it_back_tapped', { activity_id: card.id, from: 'run_it_back' });
    run.mutate(
      { key: intent.key(), startsAt },
      {
        onSettled: (_d, e) => intent.settle(e),
        onSuccess: (s) => {
          if (s.plan_id) router.replace(`/plan/${s.plan_id}` as Href);
        },
      },
    );
  };
  const choose = (iso: string) => {
    intent.settle(null); // a different time is a different intention
    setValidation(null);
    setStartsAt(iso);
  };

  return (
    <View testID="run-it-back-screen">
      {!online ? (
        <View className="px-space-5 pt-space-3">
          <OfflineNote dataUpdatedAt={dataUpdatedAt} extra="RUN IT BACK waits until you're back." />
        </View>
      ) : null}
      <RunItBack
        activity={card.sport_name}
        crew={crewLine(people.map((p) => p.name))}
        lastDate={dateLabel(card.starts_at, tz)}
        count={count}
        suggested={suggested}
        people={people}
        onRun={go}
        onChange={() => setPicking(true)}
      />
      <View className="gap-space-8 px-space-5 pb-space-8 pt-space-2">
        {run.isPaused ? <QueuedNote what="Run It Back" /> : null}
        {validation ? <InlineError message={validation} testID="run-it-back-validation" /> : null}
        {run.isError ? (
          <InlineError message={errorMessage(ojoroErrorOf(run.error))} action="TRY AGAIN" onAction={go} />
        ) : null}

        <View accessibilityLabel="Pick a time" className="gap-space-3">
          <Text variant="label">SAME TIME, OR MOVE IT</Text>
          <View role="group" aria-label="Time" className="flex-row flex-wrap gap-space-2">
            {options.map((o) => (
              <Chip key={o.startsAt} selected={startsAt === o.startsAt} onPress={() => choose(o.startsAt)}>
                {o.label}
              </Chip>
            ))}
            {custom ? (
              <Chip selected={startsAt === custom} onPress={() => choose(custom)}>
                {`${shortDate(custom, tz).split(' ')[0]} ${clock(custom, tz)}`}
              </Chip>
            ) : null}
          </View>
        </View>

        <View accessibilityLabel="What happens next" className="gap-space-3">
          <Divider label="WHAT HAPPENS NEXT" />
          <View className="gap-space-2" testID="what-next">
            <Step n={1}>{`A new plan opens for ${shortDate(startsAt, tz)}, ${clock(startsAt, tz)}, at the same pitch.`}</Step>
            <Step n={2}>{`The same ${count} get an invite. Nobody is in until they tap I'M DOWN, you included.`}</Step>
          </View>
        </View>

        <Button variant="secondary" block onPress={() => router.push('/')}>
          BACK TO HOME
        </Button>
      </View>

      <PickTimeSheet
        visible={picking}
        tz={tz}
        around={startsAt}
        onClose={() => setPicking(false)}
        onPick={(iso) => {
          setCustom(iso);
          choose(iso);
          setPicking(false);
        }}
      />
    </View>
  );
}

function Step({ n, children }: { n: number; children: string }) {
  return (
    <View className="flex-row gap-space-2">
      <Text variant="body-sm" className="w-[16px]">{`${n}.`}</Text>
      <Text variant="body-sm" className="flex-1">
        {children}
      </Text>
    </View>
  );
}

/** Not designed (HANDOFF.md): a day row and a time row of chips, then USE THIS TIME. */
function PickTimeSheet({
  visible,
  tz,
  around,
  onClose,
  onPick,
}: {
  visible: boolean;
  tz: string;
  around: string;
  onClose: () => void;
  onPick: (iso: string) => void;
}) {
  const [days] = useState(() => pickerDays(new Date(), tz));
  const times = pickerTimes();
  const start = zonedParts(around, tz);
  const [day, setDay] = useState(() => days.find((d) => d.day === start.day && d.month === start.month)?.key ?? days[1]?.key ?? '');
  const [time, setTime] = useState<[number, number]>([start.hour, start.minute - (start.minute % 30)]);
  const [error, setError] = useState<string | null>(null);
  const picked = days.find((d) => d.key === day);

  const use = () => {
    if (!picked) return;
    const iso = zonedTime({ year: picked.year, month: picked.month, day: picked.day, hour: time[0], minute: time[1] }, tz).toISOString();
    const err = startError(iso, new Date());
    setError(err);
    if (!err) onPick(iso);
  };

  return (
    <Sheet
      title="Pick a time"
      visible={visible}
      onClose={onClose}
      actions={
        <Button block onPress={use}>
          USE THIS TIME
        </Button>
      }
    >
      <View className="gap-space-4">
        <Text variant="label">DAY</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-space-2">
          {days.map((d) => (
            <Chip key={d.key} selected={d.key === day} onPress={() => setDay(d.key)}>
              {d.label}
            </Chip>
          ))}
        </ScrollView>
        <Text variant="label">TIME</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-space-2">
          {times.map((t) => (
            <Chip key={t.join(':')} selected={t[0] === time[0] && t[1] === time[1]} onPress={() => setTime(t)}>
              {timeLabel(t)}
            </Chip>
          ))}
        </ScrollView>
        {error ? <InlineError message={error} /> : null}
      </View>
    </Sheet>
  );
}
