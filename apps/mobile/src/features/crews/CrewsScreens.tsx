/**
 * Crews outside CrewHome, none of them designed (docs/DESIGN_DECISIONS.md, Step 4 screens):
 * `/crew` (your crews, START A CREW, JOIN WITH A CODE), `/crew/new` (a name, a usual sport, people
 * you've played with) and `/crew/join` (an invite code). Plus `YourCrews`, the small block that
 * links here from You, now with clans and host programs.
 */
import { isRetryable } from '@ojoro/contracts';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import {
  Badge,
  Button,
  Chip,
  DisplayText,
  Divider,
  Input,
  loadingProps,
  Screen,
  Skeleton,
  Strip,
  StripList,
  Text,
  TextButton,
} from '@/design-system';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { useMyClans } from '../clans/data';
import { useMyHostPrograms } from '../host/data';
import { useOnline } from '../activities/data';
import { InlineError, OfflineNote, ScreenHeader } from '../activities/ui';
import {
  newIdempotencyKey,
  useCreateCrew,
  useJoinCrew,
  useMyCrews,
  usePlayedWith,
  useSportsCatalog,
} from './data';
import { communityRows } from './homeLogic';
import { CREW_NAME_MAX, crewRowMeta, normalizeCode, validateCrewName } from './logic';

/** `/crew`: your crews, most recently active first. */
export function CrewsScreen() {
  const online = useOnline();
  const crews = useMyCrews();
  useEffect(() => {
    track('screen_viewed', { screen: 'crews' });
  }, []);
  return (
    <Screen situation="calm" scroll gutter={false}>
      <ScreenHeader overline="CREWS" fallback="/" />
      <View className="gap-space-6 px-space-5 pb-space-10 pt-space-4" testID="crews-screen">
        <DisplayText size="md" accessibilityRole="header">
          YOUR CREWS
        </DisplayText>
        {!online ? <OfflineNote dataUpdatedAt={crews.dataUpdatedAt} extra="Starting or joining a crew needs a connection." /> : null}
        {crews.isPending ? (
          <View {...loadingProps('Loading your crews')} className="gap-space-4">
            <Skeleton kind="strip" />
            <Skeleton kind="strip" />
          </View>
        ) : crews.isError && !crews.data ? (
          <InlineError message={errorMessage(ojoroErrorOf(crews.error))} action="RETRY" onAction={() => void crews.refetch()} />
        ) : (crews.data ?? []).length === 0 ? (
          <Text variant="body" testID="crews-empty">
            No crews yet. A crew is the people you play with most: a private chat where plans form.
          </Text>
        ) : (
          <StripList>
            {(crews.data ?? []).map((c) => (
              <Strip
                key={c.crew_id}
                title={c.name}
                meta={crewRowMeta(c)}
                trailing="chevron"
                href={`/crew/${c.crew_id}` as Href}
                testID={`crew-row-${c.crew_id}`}
              />
            ))}
          </StripList>
        )}
        <View className="gap-space-3">
          <Button block href={'/crew/new' as Href} disabled={!online} testID="crews-start">
            START A CREW
          </Button>
          <Button variant="secondary" block href={'/crew/join' as Href} disabled={!online} testID="crews-join">
            JOIN WITH A CODE
          </Button>
        </View>
      </View>
    </Screen>
  );
}

/** `/crew/new`: name it, pick a usual sport, add people you've played with. */
export function CreateCrewScreen() {
  const online = useOnline();
  const sports = useSportsCatalog();
  const people = usePlayedWith();
  const create = useCreateCrew();
  const [name, setName] = useState('');
  const [sportId, setSportId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const key = useRef<string | null>(null);

  const submit = () => {
    const valid = validateCrewName(name);
    if (!valid.ok) {
      setNameError(valid.error);
      return;
    }
    setNameError(undefined);
    key.current ??= newIdempotencyKey();
    create.mutate(
      { key: key.current, name: valid.name, sportId, memberIds: picked },
      {
        onSuccess: (crew) => {
          key.current = null;
          router.replace(`/crew/${crew.id}` as Href);
        },
        onError: (e) => {
          const err = ojoroErrorOf(e);
          if (!isRetryable(err)) key.current = null;
          // Someone can't be added (no shared game, or a block we never name): drop them.
          if (err.code === 'crew_member_not_allowed' && err.detail) {
            setPicked((p) => p.filter((x) => x !== err.detail));
          }
        },
      },
    );
  };

  return (
    <Screen situation="calm" scroll gutter={false}>
      <ScreenHeader overline="START A CREW" fallback={'/crew' as Href} />
      <View className="gap-space-6 px-space-5 pb-space-10 pt-space-4" testID="crew-new">
        <Text variant="body-sm" muted>
          A private chat for the people you play with. Ojoro notices when a plan forms in it.
        </Text>
        <Input
          label="Crew name"
          value={name}
          onChangeText={(t) => {
            setName(t);
            if (nameError) setNameError(undefined);
          }}
          maxLength={CREW_NAME_MAX + 10}
          placeholder="Thursday football"
          error={nameError}
          testID="crew-name-input"
        />
        <View className="gap-space-2">
          <Divider label="USUAL SPORT" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-space-2">
              {(sports.data ?? []).map((s) => (
                <Chip
                  key={s.id}
                  selected={sportId === s.id}
                  onPress={() => setSportId(sportId === s.id ? null : s.id)}
                >
                  {s.name}
                </Chip>
              ))}
            </View>
          </ScrollView>
        </View>
        <View className="gap-space-2">
          <Divider label={picked.length > 0 ? `PEOPLE · ${picked.length}` : 'PEOPLE'} />
          <Text variant="caption" muted>
            You can add people you've played with. Anyone else joins with the invite code.
          </Text>
          {people.isPending ? (
            <Skeleton kind="strip" />
          ) : (people.data ?? []).length === 0 ? (
            <Text variant="body-sm" muted testID="crew-new-nobody">
              Nobody yet. Start the crew and share the invite code.
            </Text>
          ) : (
            <View className="flex-row flex-wrap gap-space-2">
              {(people.data ?? []).map((p) => (
                <Chip
                  key={p.user_id}
                  selected={picked.includes(p.user_id)}
                  onPress={() =>
                    setPicked((cur) => (cur.includes(p.user_id) ? cur.filter((x) => x !== p.user_id) : [...cur, p.user_id]))
                  }
                >
                  {p.display_name}
                </Chip>
              ))}
            </View>
          )}
        </View>
        {create.isError ? (
          <InlineError message={errorMessage(ojoroErrorOf(create.error))} testID="crew-new-error" />
        ) : null}
        <Button block loading={create.isPending} disabled={!online} onPress={submit} testID="crew-new-submit">
          START THE CREW
        </Button>
        {!online ? (
          <Text variant="caption" muted>
            Offline. Starting a crew needs a connection.
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

/** `/crew/join` (`?code=` prefills): join with an invite code. */
export function JoinCrewScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const online = useOnline();
  const join = useJoinCrew();
  const [code, setCode] = useState(params.code ?? '');
  const [error, setError] = useState<string | undefined>(undefined);

  const submit = () => {
    const valid = normalizeCode(code);
    if (!valid.ok) {
      setError(valid.error);
      return;
    }
    setError(undefined);
    join.mutate(valid.code, {
      onSuccess: (crewId) => router.replace(`/crew/${crewId}/chat` as Href),
      onError: (e) => setError(errorMessage(ojoroErrorOf(e))),
    });
  };

  return (
    <Screen situation="calm" scroll gutter={false}>
      <ScreenHeader overline="JOIN A CREW" fallback={'/crew' as Href} />
      <View className="gap-space-6 px-space-5 pb-space-10 pt-space-4" testID="crew-join">
        <Text variant="body-sm" muted>
          Ask someone in the crew for its 8-character code.
        </Text>
        <Input
          label="Invite code"
          value={code}
          onChangeText={(t) => {
            setCode(t.toUpperCase());
            if (error) setError(undefined);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={12}
          placeholder="ABCD2345"
          error={error}
          testID="crew-code-input"
          onSubmitEditing={submit}
        />
        <Button block loading={join.isPending} disabled={!online} onPress={submit} testID="crew-join-submit">
          JOIN THE CREW
        </Button>
        {!online ? (
          <Text variant="caption" muted>
            Offline. Joining needs a connection.
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

/**
 * You → "CREWS, CLANS & HOSTING" (You.png): your crews (each opens Crew Home), your clans and the
 * host programs you run or co-host (HostHome), with the count in the display face and a badge for
 * what it is. The availability line under it is the profile's (overlap only).
 */
export function YourCrews() {
  const crews = useMyCrews();
  const clans = useMyClans();
  const programs = useMyHostPrograms();
  const crewRows = crews.data ?? [];
  const rows = communityRows({
    crews: crewRows.slice(0, 3),
    clans: clans.data ?? [],
    programs: programs.data ?? [],
  });
  const pending = crews.isPending || clans.isPending || programs.isPending;
  const failed = [crews, clans, programs].find((q) => q.isError && !q.data);
  return (
    <View className="gap-space-2" role="region" aria-label="Crews, clans and hosting" testID="your-crews">
      <Divider label="CREWS, CLANS & HOSTING" />
      {pending && rows.length === 0 ? (
        <View {...loadingProps('Loading your crews, clans and hosting')}>
          <Skeleton kind="strip" />
        </View>
      ) : rows.length === 0 && !failed ? (
        <Text variant="body-sm" muted>
          No crews or clans yet. A crew is the people you play with most.
        </Text>
      ) : (
        <StripList>
          {rows.map((r) => (
            <Strip
              key={r.key}
              leading={String(r.count)}
              leadingLabel={r.countLabel}
              title={r.title}
              titleVariant="title-sm"
              meta={r.meta}
              trailing={<Badge>{r.badge}</Badge>}
              href={r.href as Href}
              testID={`your-${r.key}`}
            />
          ))}
        </StripList>
      )}
      {failed ? (
        <InlineError message={errorMessage(ojoroErrorOf(failed.error))} action="RETRY" onAction={() => void failed.refetch()} />
      ) : null}
      <View className="flex-row flex-wrap gap-space-4">
        <TextButton onPress={() => router.push('/crew' as Href)} testID="your-crews-all">
          {crewRows.length > 0 ? 'ALL CREWS' : 'START OR JOIN A CREW'}
        </TextButton>
      </View>
    </View>
  );
}
