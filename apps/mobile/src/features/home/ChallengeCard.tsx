/**
 * A Challenge Event on Home (Polish GAPS-FEED): Compete's YOUR EVENTS strip (day, "Chimdi vs Marcus ·
 * 5K", "142 following · Build-up", 3 DAYS / TODAY / LIVE / FINAL). Accepted and build-up strips sit
 * on calm ground as in Main.png; event day, live and final set their situation on the strip's root. The stage is in words (the
 * badge and the meta line), never colour only. Opens /event/[id].
 */
import type { Href } from 'expo-router';
import { View } from 'react-native';

import { Badge, Divider, LiveIndicator, Situation, Strip } from '@/design-system';
import { track } from '@/lib/analytics';

import {
  challengeStripSituation,
  challengeCardModel,
  challengeSectionLabel,
  type FeedCard,
} from './homeLogic';

export function ChallengeCard({
  card,
  now,
  source = 'home',
}: {
  card: FeedCard;
  now: Date;
  source?: string;
}) {
  const model = challengeCardModel(card, now.getTime());
  if (!model) return null;
  const situation = challengeStripSituation(card);
  return (
    <Situation
      id={situation}
      className="-mx-space-5 px-space-5"
      testID={`feed-card-${card.position}`}
    >
      <Strip
        leading={model.leading}
        leadingLabel={model.leadingLabel}
        title={model.title}
        meta={model.meta}
        trailing={
          model.trailing.kind === 'live' ? (
            <LiveIndicator />
          ) : (
            <Badge tone={model.trailing.tone}>{model.trailing.word}</Badge>
          )
        }
        href={model.href as Href}
        onPress={() =>
          track('home_card_opened', { card: card.card, position: card.position, source })
        }
        testID={`feed-challenge-${model.id}`}
      />
    </Situation>
  );
}

/** The challenge cards as their own block (FirstHome, where the feed isn't drawn). */
export function ChallengeBlock({ cards, now }: { cards: readonly FeedCard[]; now: Date }) {
  const rows = cards.filter((c) => c.card === 'challenge_event');
  if (rows.length === 0) return null;
  const label = challengeSectionLabel(rows);
  return (
    <View className="gap-space-4" role="region" aria-label={label} testID="feed-challenge_event">
      <Divider label={label} />
      {rows.map((c) => (
        <ChallengeCard key={c.object_id ?? c.position} card={c} now={now} source="first_home" />
      ))}
    </View>
  );
}
