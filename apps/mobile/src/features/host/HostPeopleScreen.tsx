/**
 * HostPeople (`/host/[programId]/people`, HostPeople.png, PRD §13 participant CRM): YOUR REGULARS.,
 * search by name or tag, filters (All / Regulars / Members / New / Drifting), a person that opens to
 * their last 12 sessions, stats, pass, tags and your private notes, then the Drifting invite-back
 * panel. Calm.
 *
 * Privacy: attendance at this program's sessions only (the server computes every number from them);
 * private notes are read back to their author only. Report and block are on every open person.
 */
import type { HostPeopleFilter, HostPersonRow } from '@ojoro/contracts';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import {
  Avatar,
  AvatarCluster,
  Badge,
  Button,
  Chip,
  DisplayText,
  Divider,
  Icon,
  Input,
  Screen,
  Text,
  TextButton,
  useMotion,
  useToast,
} from '@/design-system';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';
import { useReportBlock } from '@/features/safety';

import { useOnline } from '../activities/data';
import { InlineError, LoadingState, OfflineNote, PrivacyNote, ScreenHeader } from '../activities/ui';
import { useHostWeek, useProgram } from './data';
import {
  useInviteBack,
  usePeople,
  usePeopleCounts,
  usePerson,
  useProgramCrew,
  useSetNote,
  useSetTags,
} from './moneyData';
import {
  addTag,
  attendanceCells,
  attendanceSentence,
  driftingBody,
  driftingHeadline,
  emptyListLine,
  filterChips,
  inviteBackResult,
  listLabel,
  nextSession,
  noteError,
  passLine,
  peopleHeadline,
  PEOPLE_FILTERS,
  personBadge,
  personMeta,
  personStats,
  removeTag,
  tagWord,
} from './peopleLogic';

const SEARCH_DEBOUNCE_MS = 250;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function HostPeopleScreen({ programId }: { programId: string }) {
  const params = useLocalSearchParams<{ filter?: string }>();
  const initial = PEOPLE_FILTERS.includes(params.filter as HostPeopleFilter)
    ? (params.filter as HostPeopleFilter)
    : 'regulars';
  const online = useOnline();
  const program = useProgram(programId);
  const timeZone = program.data?.time_zone ?? 'America/Toronto';
  const counts = usePeopleCounts(programId);
  const [filter, setFilter] = useState<HostPeopleFilter>(initial);
  const [search, setSearch] = useState('');
  const query = useDebounced(search, SEARCH_DEBOUNCE_MS);
  const people = usePeople(programId, filter, query);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    track('screen_viewed', { screen: 'host_people', program_id: programId });
  }, [programId]);

  const c = counts.data ?? null;
  const rows = people.data ?? [];
  const chips = filterChips(c);

  return (
    <Screen situation="calm" scroll gutter={false}>
      <ScreenHeader overline={c ? `PEOPLE · ${c.played_count}` : 'PEOPLE'} fallback={`/host/${programId}` as Href} />
      <View className="gap-space-8 px-space-5 pb-space-10 pt-space-4" testID="host-people">
        {!online ? (
          <OfflineNote dataUpdatedAt={people.dataUpdatedAt} extra="Notes and tags save when you're back." />
        ) : null}

        <View className="gap-space-3" role="region" aria-label="Your people">
          <DisplayText size="lg" accessibilityRole="header">
            YOUR REGULARS.
          </DisplayText>
          {c ? (
            <Text variant="body" testID="host-people-headline">
              {peopleHeadline(c)}
            </Text>
          ) : counts.isError ? (
            <InlineError
              message={errorMessage(ojoroErrorOf(counts.error))}
              action="RETRY"
              onAction={() => void counts.refetch()}
            />
          ) : null}
          <Input
            label="Find someone"
            icon="search"
            placeholder="Name or tag"
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            testID="host-people-search"
          />
          <View className="flex-row flex-wrap gap-space-2" role="radiogroup" aria-label="Show">
            {chips.map((chip) => (
              <Chip
                key={chip.key}
                selected={filter === chip.key}
                onPress={() => {
                  setFilter(chip.key);
                  setOpen(null);
                  track('cta_tapped', { cta: 'host_people_filter', filter: chip.key });
                }}
                testID={`host-people-filter-${chip.key}`}
              >
                {chip.label}
              </Chip>
            ))}
          </View>
        </View>

        <View role="region" aria-label={listLabel(filter, !!query.trim())}>
          <Divider kind="strong" label={listLabel(filter, !!query.trim())} />
          {people.isPending ? (
            <LoadingState label="Loading people" kinds={['strip', 'strip', 'strip']} />
          ) : people.isError && rows.length === 0 ? (
            <View className="pt-space-4">
              <InlineError
                message={errorMessage(ojoroErrorOf(people.error))}
                action="RETRY"
                onAction={() => void people.refetch()}
                testID="host-people-error"
              />
            </View>
          ) : rows.length === 0 ? (
            <Text variant="body-sm" muted className="pt-space-4" testID="host-people-empty">
              {emptyListLine(filter, query)}
            </Text>
          ) : (
            <View testID="host-people-list">
              {rows.map((p) => (
                <PersonRow
                  key={p.user_id}
                  programId={programId}
                  person={p}
                  timeZone={timeZone}
                  open={open === p.user_id}
                  onToggle={() => setOpen((o) => (o === p.user_id ? null : p.user_id))}
                />
              ))}
            </View>
          )}
        </View>

        {c && c.drifting > 0 ? <DriftingPanel programId={programId} count={c.drifting} timeZone={timeZone} /> : null}

        <Text variant="caption" muted>
          You see attendance at your own sessions only. Nothing else from their Ojoro life unless they choose to show it.
        </Text>
      </View>
    </Screen>
  );
}

function PersonRow({
  programId,
  person,
  timeZone,
  open,
  onToggle,
}: {
  programId: string;
  person: HostPersonRow;
  timeZone: string;
  open: boolean;
  onToggle: () => void;
}) {
  const motion = useMotion();
  const badge = personBadge(person);
  const meta = personMeta(person, timeZone);
  return (
    <View>
      <Pressable
        role="button"
        aria-expanded={open}
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${person.display_name}. ${meta}.${badge ? ` ${badge}.` : ''} ${open ? 'Close' : 'Open'} their history.`}
        onPress={onToggle}
        className="min-h-touch flex-row items-center gap-space-3 border-b border-line py-space-3"
        testID={`host-person-${person.user_id}`}
      >
        <Avatar name={person.display_name} size="md" />
        <View className="flex-1 gap-space-1">
          <Text variant="title-sm" numberOfLines={1}>
            {person.display_name}
          </Text>
          <Text variant="caption" muted style={{ fontVariant: ['tabular-nums'] }}>
            {meta}
          </Text>
        </View>
        {badge ? <Badge>{badge}</Badge> : null}
        <View
          aria-hidden
          style={{
            transform: [{ rotate: open ? '90deg' : '0deg' }],
            ...(motion.reduced ? null : { transitionProperty: 'transform', transitionDuration: '200ms' }),
          }}
        >
          <Icon name="forward" size={18} />
        </View>
      </Pressable>
      {open ? <PersonDetail programId={programId} userId={person.user_id} name={person.display_name} timeZone={timeZone} /> : null}
    </View>
  );
}

function PersonDetail({
  programId,
  userId,
  name,
  timeZone,
}: {
  programId: string;
  userId: string;
  name: string;
  timeZone: string;
}) {
  const person = usePerson(programId, userId);
  const reportBlock = useReportBlock();
  const p = person.data ?? null;

  return (
    <View className="my-space-3 gap-space-5 bg-surface-raised p-space-5" testID="host-person-detail">
      {person.isPending ? (
        <LoadingState label={`Loading ${name}`} kinds={['text', 'text']} />
      ) : !p ? (
        <InlineError
          message={person.error ? errorMessage(ojoroErrorOf(person.error)) : `We can't find ${name} in this program anymore.`}
          action="RETRY"
          onAction={() => void person.refetch()}
        />
      ) : (
        <>
          <View className="gap-space-2">
            <Text variant="overline">LAST 12 SESSIONS</Text>
            <Attendance last12={p.last12} />
            <Text variant="caption" muted>
              {`${attendanceSentence(p.last12)} Filled means came, outline means didn't.`}
            </Text>
          </View>
          <View className="flex-row gap-space-3">
            {personStats(p, timeZone).map((s) => (
              <View key={s.label} className="flex-1" accessible accessibilityLabel={`${s.value} ${s.label}`}>
                <DisplayText size="sm" style={{ fontVariant: ['tabular-nums'] }}>
                  {s.value}
                </DisplayText>
                <Text variant="caption" muted>
                  {s.label}
                </Text>
              </View>
            ))}
          </View>
          <View className="gap-space-1">
            <Text variant="overline">PASS</Text>
            <Text variant="body-sm" testID="host-person-pass">
              {passLine(p, timeZone)}
            </Text>
          </View>
          <Tags programId={programId} userId={userId} tags={p.tags} />
          <Note programId={programId} userId={userId} initial={p.my_note ?? ''} />
          <PersonActions programId={programId} userId={userId} name={name} />
          <View className="self-start">
            <TextButton
              onPress={() => reportBlock.open({ subjectKind: 'profile', subjectId: userId, personName: name, personId: userId })}
              accessibilityLabel={`Report or block ${name}`}
              testID="host-person-report"
            >
              REPORT OR BLOCK
            </TextButton>
          </View>
        </>
      )}
      {reportBlock.sheet}
    </View>
  );
}

/** Twelve squares, oldest first: filled means came, outline means didn't (never colour only). */
function Attendance({ last12 }: { last12: boolean[] }) {
  return (
    <View
      className="flex-row gap-space-1"
      role="img"
      aria-label={attendanceSentence(last12)}
      accessibilityLabel={attendanceSentence(last12)}
      testID="host-person-last12"
    >
      {attendanceCells(last12).map((c) => (
        <View
          key={c.key}
          className={`h-[20px] flex-1 border-text ${c.came ? 'bg-text' : ''}`}
          style={{ borderWidth: 1.5 }}
        />
      ))}
    </View>
  );
}

function Tags({ programId, userId, tags }: { programId: string; userId: string; tags: string[] }) {
  const setTags = useSetTags(programId, userId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const next = addTag(tags, draft);
    if ('error' in next) {
      setError(next.error);
      return;
    }
    setError(null);
    setDraft('');
    setTags.mutate(next.tags);
  };

  return (
    <View className="gap-space-2" testID="host-person-tags">
      <View className="flex-row items-center justify-between">
        <Text variant="overline">TAGS</Text>
        <TextButton
          on={editing}
          onPress={() => setEditing((e) => !e)}
          accessibilityLabel={editing ? 'Done editing tags' : 'Edit tags'}
          testID="host-person-tags-edit"
        >
          {editing ? 'DONE' : 'EDIT'}
        </TextButton>
      </View>
      {tags.length === 0 && !editing ? (
        <Text variant="body-sm" muted>
          No tags yet. Tags help you find people: KEEPER, BRINGS BALLS.
        </Text>
      ) : (
        <View className="flex-row flex-wrap gap-space-2">
          {tags.map((t) =>
            editing ? (
              <Pressable
                key={t}
                role="button"
                accessibilityLabel={`Remove tag ${t}`}
                onPress={() => setTags.mutate(removeTag(tags, t))}
                className="min-h-touch flex-row items-center gap-space-1"
              >
                <Badge>{tagWord(t)}</Badge>
                <Icon name="close" size={16} />
              </Pressable>
            ) : (
              <Badge key={t}>{tagWord(t)}</Badge>
            ),
          )}
        </View>
      )}
      {editing ? (
        <Input
          label="Add a tag"
          placeholder="Centre-back"
          value={draft}
          onChangeText={(t) => {
            setDraft(t);
            setError(null);
          }}
          onSubmitEditing={add}
          returnKeyType="done"
          error={error ?? undefined}
          hint="Up to 8. Press return to add."
          testID="host-person-tag-input"
        />
      ) : null}
      {setTags.isError ? <InlineError message={errorMessage(ojoroErrorOf(setTags.error))} /> : null}
    </View>
  );
}

function Note({ programId, userId, initial }: { programId: string; userId: string; initial: string }) {
  const setNote = useSetNote(programId, userId);
  const [body, setBody] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const error = noteError(body);
  const save = () => {
    if (error || body === saved) return;
    setNote.mutate(body, { onSuccess: () => setSaved(body) });
  };
  const status = setNote.isPending
    ? 'Saving.'
    : setNote.isSuccess && body === saved
      ? 'Saved. Only you see this. Never shown to them or other hosts.'
      : 'Only you see this. Never shown to them or other hosts.';
  return (
    <View className="gap-space-2">
      <Input
        label="Your notes"
        multiline
        value={body}
        onChangeText={setBody}
        onBlur={save}
        hint={status}
        error={error ?? (setNote.isError ? errorMessage(ojoroErrorOf(setNote.error)) : undefined)}
        testID="host-person-note"
      />
      {body !== saved && !error ? (
        <View className="self-start">
          <TextButton onPress={save} testID="host-person-note-save">
            SAVE NOTE
          </TextButton>
        </View>
      ) : null}
    </View>
  );
}

function PersonActions({ programId, userId, name }: { programId: string; userId: string; name: string }) {
  const toast = useToast();
  const crew = useProgramCrew(programId);
  const week = useHostWeek(programId);
  const invite = useInviteBack(programId);
  const next = useMemo(() => nextSession(week.data ?? [], new Date()), [week.data]);
  const crewId = crew.data ?? null;
  const first = name.split(' ')[0] ?? name;

  return (
    <View className="gap-space-2">
      <View className="flex-row gap-space-2">
        <View className="flex-1">
          <Button
            variant="primary"
            block
            onPress={() => {
              track('cta_tapped', { cta: 'host_person_message', program_id: programId });
              router.push(
                (crewId ? `/crew/${crewId}/chat` : `/host/${programId}/announce${next?.session_id ? `?session=${next.session_id}` : ''}`) as Href,
              );
            }}
            accessibilityLabel={crewId ? `Message ${first} in the crew chat` : `Message ${first} with an announcement`}
            testID="host-person-message"
          >
            MESSAGE
          </Button>
        </View>
        <View className="flex-1">
          <Button
            variant="secondary"
            block
            loading={invite.isPending}
            disabled={!next?.session_id}
            accessibilityLabel={next ? `Invite ${first} to ${next.name ?? 'the next session'}` : 'No session to invite to'}
            onPress={() => {
              if (!next?.session_id) return;
              invite.mutate(
                { sessionId: next.session_id, userIds: [userId] },
                {
                  onSuccess: (r) =>
                    toast.show({
                      kind: r.sent > 0 ? 'success' : 'neutral',
                      message:
                        r.sent > 0
                          ? `Invited ${first} to ${next.name ?? 'the next session'}.`
                          : `${first} already had an invite this week.`,
                    }),
                },
              );
            }}
            testID="host-person-invite"
          >
            INVITE TO…
          </Button>
        </View>
      </View>
      {!crewId ? (
        <Text variant="caption" muted>
          Direct messages aren't here yet. MESSAGE opens an announcement to the next session.
        </Text>
      ) : null}
      {invite.isError ? <InlineError message={errorMessage(ojoroErrorOf(invite.error))} /> : null}
    </View>
  );
}

function DriftingPanel({ programId, count, timeZone }: { programId: string; count: number; timeZone: string }) {
  const toast = useToast();
  const drifting = usePeople(programId, 'drifting', '');
  const week = useHostWeek(programId);
  const invite = useInviteBack(programId);
  const now = new Date();
  const next = nextSession(week.data ?? [], now);
  const faces = (drifting.data ?? []).map((p) => ({ name: p.display_name }));
  const [result, setResult] = useState<string | null>(null);

  return (
    <View className="gap-space-3 bg-surface-sunk p-space-5" role="region" aria-label="Drifting" testID="host-drifting">
      <Text variant="overline">{`DRIFTING · ${count}`}</Text>
      <Text variant="title">{driftingHeadline(count)}</Text>
      <Text variant="body-sm" muted>
        {driftingBody(next?.starts_at ?? null, now, timeZone)}
      </Text>
      {faces.length > 0 ? <AvatarCluster people={faces} total={count} max={6} size="sm" /> : null}
      {result ? (
        <Text variant="body-sm" accessibilityLiveRegion="polite" testID="host-drifting-result">
          {result}
        </Text>
      ) : (
        <Button
          variant="secondary"
          block
          loading={invite.isPending}
          disabled={!next?.session_id}
          onPress={() => {
            if (!next?.session_id) return;
            invite.mutate(
              { sessionId: next.session_id },
              {
                onSuccess: (r) => {
                  setResult(inviteBackResult(r.sent, r.skipped));
                  if (r.sent > 0) toast.show({ kind: 'success', message: inviteBackResult(r.sent, r.skipped) });
                },
              },
            );
          }}
          testID="host-invite-back"
        >
          INVITE THEM BACK
        </Button>
      )}
      {!next?.session_id && week.isSuccess ? (
        <PrivacyNote>There's no session coming up to invite them to. Add one in your series first.</PrivacyNote>
      ) : null}
      {invite.isError ? <InlineError message={errorMessage(ojoroErrorOf(invite.error))} /> : null}
    </View>
  );
}
