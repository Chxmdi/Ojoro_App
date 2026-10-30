/**
 * `/place/[id]`: Place (design-handoff/screens/Place.png, calm; PRD §9.16; docs/PLACES_CONTRACT.md,
 * Place). Header PLACE with share and ··· (report); the hero with the area, distance and name; the
 * facts line; CREATE ACTIVITY HERE (the create form, prefilled) and DIRECTIONS (the OS maps app);
 * TONIGHT HERE; RITUALS HERE; HOSTS HERE; WHEN IT'S BUSY.
 */
import type { PlaceView } from '@ojoro/contracts';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { Linking, Platform, Pressable, Share, View } from 'react-native';

import {
  ActivityStrip,
  Avatar,
  Badge,
  BusyTimes,
  Button,
  Divider,
  Icon,
  IconButton,
  Image,
  loadingProps,
  Screen,
  Skeleton,
  Strip,
  Text,
  useToast,
  VerificationBadge,
} from '@/design-system';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';
import { useReportBlock } from '@/features/safety';

import { useOnline } from '../activities/data';
import { goBack, InlineError, LoadingState, PrivacyNote } from '../activities/ui';
import { directionsUrl } from '../plans/planLogic';
import { usePlaceGroups, usePlaceHosts, usePlaceRealtime, usePlaceTonight, usePlaceView } from './data';
import {
  busyBlock,
  directionsTarget,
  groupRow,
  heroAlt,
  hostRow,
  placeOverline,
  placeTitle,
  shareText,
  tonightStrip,
  verificationWords,
} from './logic';
import { placeRoutes } from './routes';
import { OfflineNote } from './ui';

export function PlaceScreen({ id }: { id: string }) {
  const online = useOnline();
  usePlaceRealtime(id);
  const view = usePlaceView(id);
  const place = view.data ?? null;
  const reportBlock = useReportBlock();
  const toast = useToast();

  useFocusEffect(
    useCallback(() => {
      track('screen_viewed', { screen: 'place', place_id: id });
    }, [id]),
  );

  const share = async () => {
    if (!place) return;
    track('place_shared', { place_id: id });
    try {
      await Share.share({ message: shareText(place) });
    } catch {
      toast.show({ kind: 'neutral', message: "Sharing isn't available here." });
    }
  };

  return (
    <Screen situation="calm" scroll gutter={false}>
      <PlaceHeader
        right={
          place ? (
            <>
              <IconButton icon="share" label="Share place" onPress={() => void share()} testID="place-share" />
              <IconButton
                icon="more"
                label="Report this place"
                onPress={() => reportBlock.open({ subjectKind: 'place', subjectId: id, personName: place.name })}
                testID="header-more"
              />
            </>
          ) : null
        }
      />
      {view.isPending && !place ? (
        <LoadingState label="Loading the place" kinds={['object', 'text', 'strip', 'strip', 'strip']} />
      ) : !place ? (
        <PlaceUnavailable error={view.error} onRetry={() => void view.refetch()} />
      ) : (
        <PlaceBody id={id} place={place} online={online} dataUpdatedAt={view.dataUpdatedAt} />
      )}
      {reportBlock.sheet}
    </Screen>
  );
}

/** Back, PLACE centred, share and ··· (two slots each side keep the overline centred). */
function PlaceHeader({ right }: { right: ReactNode }) {
  return (
    <View className="flex-row items-center px-space-2 pt-space-2">
      <View className="w-[88px] flex-row">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => goBack(placeRoutes.pulse())}
          className="size-[44px] items-center justify-center"
          testID="header-back"
        >
          <Icon name="back" />
        </Pressable>
      </View>
      <Text variant="overline" className="flex-1 text-center" accessibilityRole="header">
        PLACE
      </Text>
      <View className="w-[88px] flex-row justify-end">{right}</View>
    </View>
  );
}

function PlaceUnavailable({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const e = ojoroErrorOf(error);
  const gone = !error || e.code === 'place_unknown';
  return (
    <View className="gap-space-4 px-space-5 pt-space-8" testID="place-unavailable">
      {gone ? (
        <>
          <Text variant="title">We can't find that place.</Text>
          <Text variant="body-sm" muted>
            It may have closed or moved. Pulse shows what's on near you.
          </Text>
          <View className="self-start">
            <Button variant="secondary" onPress={() => router.replace(placeRoutes.pulse())}>
              BACK TO PULSE
            </Button>
          </View>
        </>
      ) : (
        <InlineError message={errorMessage(e)} action="RETRY" onAction={onRetry} testID="screen-error" />
      )}
    </View>
  );
}

function PlaceBody({
  id,
  place,
  online,
  dataUpdatedAt,
}: {
  id: string;
  place: PlaceView;
  online: boolean;
  dataUpdatedAt: number;
}) {
  return (
    <View testID="place-screen">
      <Image alt={heroAlt(place)} ratio="16:9">
        <Text variant="overline" muted testID="place-overline">
          {placeOverline(place)}
        </Text>
        <Text variant="display-md" role="heading" aria-level={1} testID="place-name">
          {placeTitle(place.name)}
        </Text>
      </Image>
      <View className="gap-space-10 px-space-5 pb-space-10 pt-space-5">
        {!online ? <OfflineNote dataUpdatedAt={dataUpdatedAt} what="this place" /> : null}
        <About id={id} place={place} online={online} />
        <TonightHere id={id} sensitive={place.sensitive} />
        <RitualsHere id={id} />
        <HostsHere id={id} />
        <WhenBusy place={place} />
      </View>
    </View>
  );
}

function About({ id, place, online }: { id: string; place: PlaceView; online: boolean }) {
  const toast = useToast();
  const verified = verificationWords(place.verification);

  const directions = async () => {
    track('place_directions_tapped', { place_id: id });
    const url = directionsUrl(Platform.OS, directionsTarget(place));
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      toast.show({ kind: 'neutral', message: "Maps isn't available here." });
    }
  };

  const createHere = () => {
    track('create_here_tapped', { place_id: id, source: 'place', online });
    router.push(placeRoutes.createHere(id, place.prefill_sport_id, place.prefill_starts_at));
  };

  return (
    <View role="region" aria-label="About this place" className="gap-space-3">
      <View className="flex-row items-start gap-space-2">
        <View className="pt-[2px]">
          <Icon name="lights" size={16} />
        </View>
        <Text variant="body-sm" className="flex-1" testID="place-facts">
          {place.facts}
        </Text>
      </View>
      {place.description ? (
        <Text variant="body-sm" muted>
          {place.description}
        </Text>
      ) : null}
      {verified ? (
        <View className="flex-row items-center gap-space-2" testID="place-verification">
          <Icon name="check" size={16} />
          <Text variant="caption" muted>
            {verified}
          </Text>
        </View>
      ) : null}
      {place.sensitive ? (
        <PrivacyNote>
          This place is kept off the map. Here you see only what you're in.
        </PrivacyNote>
      ) : null}
      <View className="flex-row flex-wrap gap-space-2 pt-space-1">
        <Button onPress={createHere} testID="create-activity-here">
          CREATE ACTIVITY HERE
        </Button>
        <Button variant="secondary" onPress={() => void directions()} testID="place-directions">
          DIRECTIONS
        </Button>
      </View>
    </View>
  );
}

function Section({ label, title, children, testID }: { label: string; title: string; children: ReactNode; testID: string }) {
  return (
    <View role="region" aria-label={title} className="gap-space-1" testID={testID}>
      <Divider label={label} />
      {children}
    </View>
  );
}

function SectionLoading({ label }: { label: string }) {
  return (
    <View {...loadingProps(label)} className="gap-space-2">
      <Skeleton kind="strip" />
      <Skeleton kind="strip" />
    </View>
  );
}

function TonightHere({ id, sensitive }: { id: string; sensitive: boolean }) {
  const q = usePlaceTonight(id, true);
  const rows = (q.data ?? []).map(tonightStrip);
  return (
    <Section label="TONIGHT HERE" title="Tonight here" testID="place-tonight">
      {q.isPending ? (
        <SectionLoading label="Loading tonight here" />
      ) : q.isError && rows.length === 0 ? (
        <InlineError message={errorMessage(ojoroErrorOf(q.error))} action="RETRY" onAction={() => void q.refetch()} />
      ) : rows.length === 0 ? (
        <Text variant="body-sm" muted className="py-space-3" testID="place-tonight-empty">
          {sensitive ? "Nothing you're in here tonight." : 'Nothing on here tonight yet. Start something and it shows here.'}
        </Text>
      ) : (
        rows.map((r) => (
          <View key={r.key} testID={`tonight-${r.key}`}>
            <ActivityStrip
              activity={r.activity}
              time={r.time}
              place={r.place}
              status={r.status}
              count={r.count}
              capacity={r.capacity}
              href={r.href ?? undefined}
            />
          </View>
        ))
      )}
    </Section>
  );
}

function RitualsHere({ id }: { id: string }) {
  const q = usePlaceGroups(id, true);
  const rows = (q.data ?? []).map(groupRow);
  return (
    <Section label="RITUALS HERE" title="Rituals here" testID="place-rituals">
      {q.isPending ? (
        <SectionLoading label="Loading rituals here" />
      ) : q.isError && rows.length === 0 ? (
        <InlineError message={errorMessage(ojoroErrorOf(q.error))} action="RETRY" onAction={() => void q.refetch()} />
      ) : rows.length === 0 ? (
        <Text variant="body-sm" muted className="py-space-3">
          No regular groups meet here yet.
        </Text>
      ) : (
        rows.map((r) => (
          <Strip
            key={r.key}
            leading={r.day || undefined}
            leadingLabel={r.dayName || undefined}
            title={r.title}
            titleVariant="title-sm"
            meta={r.meta}
            trailing={<Badge>{r.tag}</Badge>}
            href={r.href ?? undefined}
            accessibilityHint={r.href ? 'Opens the group' : undefined}
            testID={`ritual-${r.key}`}
          />
        ))
      )}
    </Section>
  );
}

function HostsHere({ id }: { id: string }) {
  const q = usePlaceHosts(id, true);
  const rows = (q.data ?? []).map(hostRow);
  return (
    <Section label="HOSTS HERE" title="Hosts here" testID="place-hosts">
      {q.isPending ? (
        <SectionLoading label="Loading hosts here" />
      ) : q.isError && rows.length === 0 ? (
        <InlineError message={errorMessage(ojoroErrorOf(q.error))} action="RETRY" onAction={() => void q.refetch()} />
      ) : rows.length === 0 ? (
        <Text variant="body-sm" muted className="py-space-3">
          No regular hosts here yet.
        </Text>
      ) : (
        rows.map((h) => (
          <Pressable
            key={h.key}
            accessibilityRole="link"
            accessibilityLabel={`${h.name}. ${h.line}.${h.trusted ? ' Trusted host.' : ''}`}
            onPress={() => router.push(h.href as Href)}
            className="min-h-[64px] flex-row items-center gap-space-3 border-b border-line py-space-2"
            testID={`host-${h.key}`}
          >
            <Avatar name={h.name} size="md" />
            <View className="flex-1">
              <Text variant="title-sm">{h.name}</Text>
              <Text variant="caption" muted>
                {h.line}
              </Text>
            </View>
            {h.trusted ? <VerificationBadge level="host" /> : null}
          </Pressable>
        ))
      )}
    </Section>
  );
}

function WhenBusy({ place }: { place: PlaceView }) {
  const busy = busyBlock(place);
  return (
    <View role="region" aria-label="When it's busy" className="gap-space-3" testID="place-busy">
      <Divider label={busy?.label ?? "WHEN IT'S BUSY"} />
      {busy ? (
        <BusyTimes
          title={busy.title}
          data={busy.data}
          currentIndex={busy.currentIndex}
          period={busy.period}
          summary={busy.summary}
        />
      ) : (
        <Text variant="body-sm" muted>
          Not enough games here yet to tell.
        </Text>
      )}
    </View>
  );
}
