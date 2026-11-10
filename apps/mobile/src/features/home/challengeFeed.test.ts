import { describe, expect, it } from 'vitest';

import {
  cardSituation,
  challengeStripSituation,
  challengeCardModel,
  challengeSectionLabel,
  feedChallenge,
  feedSections,
  sectionLabel,
  type FeedCard,
} from './homeLogic';

const NOW = Date.parse('2026-10-07T16:00:00Z'); // Wed 7 Oct, noon in Montréal

function event(over: Record<string, unknown> = {}) {
  return {
    event_id: 'e1',
    stage: 'days',
    relation: 'following',
    format: 'person_vs_person',
    title: '5K',
    starts_at: '2026-10-10T13:00:00Z', // Sat 9:00
    time_zone: 'America/Toronto',
    a_name: 'Chimdi O',
    b_name: 'Marcus T',
    my_side: null,
    side_size: 1,
    follower_count: 142,
    scoring: 'time',
    target: 5,
    unit: 'km',
    live_period: null,
    winner_side: null,
    ...over,
  };
}

function card(over: Partial<FeedCard> = {}, ev: Record<string, unknown> = {}): FeedCard {
  return {
    position: 1,
    card: 'challenge_event',
    action: 'open',
    object_kind: 'challenge_event',
    object_id: 'e1',
    plan_id: null,
    activity_id: null,
    crew_id: null,
    sport_id: 'running',
    sport_name: 'Running',
    title: 'Chimdi O vs Marcus T · 5K',
    reason: 'Build-up · you follow',
    starts_at: '2026-10-10T13:00:00Z',
    place_name: null,
    member_count: null,
    capacity: null,
    people: 142,
    notification_id: null,
    href: '/event/e1',
    stage: 'days',
    situation: 'forming',
    event: event(ev),
    ...over,
  };
}

describe('challenge cards on Main', () => {
  it('reads the event facts, and refuses a card without them', () => {
    expect(feedChallenge(card())?.event_id).toBe('e1');
    expect(feedChallenge(card({ event: null }))).toBeNull();
    expect(feedChallenge(card({ event: 'x' }))).toBeNull();
    expect(feedChallenge(card({}, { a_name: '' }))).toBeNull();
    expect(feedChallenge(card({ card: 'recap' }))).toBeNull();
  });

  it('fills missing optional facts', () => {
    const f = feedChallenge(
      card({
        event: {
          event_id: 'e',
          stage: 'days',
          title: '5K',
          starts_at: 'x',
          a_name: 'A',
          b_name: 'B',
        },
      }),
    );
    expect(f).toMatchObject({
      relation: 'following',
      format: 'person_vs_person',
      scoring: 'time',
      my_side: null,
      time_zone: null,
    });
  });

  it('draws the followed build-up as the design does', () => {
    const m = challengeCardModel(card(), NOW)!;
    expect(m.leading).toBe('SAT');
    expect(m.title).toBe('Chimdi vs Marcus · 5K');
    expect(m.meta).toBe('You follow · Build-up · 142 following');
    expect(m.trailing).toEqual({ kind: 'badge', word: '3 DAYS', tone: 'signal' });
    expect(m.href).toBe('/event/e1');
  });

  it('says why it is here when it is not yours', () => {
    expect(challengeCardModel(card({}, { relation: 'rival' }), NOW)!.meta).toMatch(
      /^Your rival · /,
    );
    expect(challengeCardModel(card({}, { relation: 'crew' }), NOW)!.meta).toMatch(
      /^From your crew · /,
    );
    expect(challengeCardModel(card({}, { relation: 'clan' }), NOW)!.meta).toMatch(
      /^From your clan · /,
    );
    expect(challengeCardModel(card({}, { relation: 'competitor', my_side: 'b' }), NOW)!.title).toBe(
      'Marcus vs Chimdi · 5K',
    );
    expect(challengeCardModel(card({ event: null }), NOW)).toBeNull();
  });

  it('live shows the live indicator, final the word', () => {
    expect(
      challengeCardModel(card({}, { stage: 'live', relation: 'competitor' }), NOW)!.trailing,
    ).toEqual({ kind: 'live' });
    expect(
      challengeCardModel(card({}, { stage: 'complete', winner_side: 'a' }), NOW)!.trailing,
    ).toMatchObject({ word: 'FINAL' });
  });

  it('build-up strips on calm ground, the rest in their own situation', () => {
    expect(challengeStripSituation(card({ stage: 'accepted', situation: 'forming' }))).toBe('calm');
    expect(challengeStripSituation(card({ stage: 'days', situation: 'forming' }))).toBe('calm');
    expect(challengeStripSituation(card({ stage: 'today', situation: 'confirmed' }))).toBe(
      'confirmed',
    );
    expect(challengeStripSituation(card({ stage: 'live', situation: 'live' }))).toBe('live');
    expect(challengeStripSituation(card({ stage: 'complete', situation: 'after' }))).toBe('after');
    expect(challengeStripSituation(card({ stage: 'live', situation: null }))).toBe('calm');
  });

  it('only known situations', () => {
    expect(cardSituation(card())).toBe('forming');
    expect(cardSituation(card({ situation: 'live' }))).toBe('live');
    expect(cardSituation(card({ situation: 'neon' }))).toBeNull();
    expect(cardSituation(card({ situation: null }))).toBeNull();
    expect(cardSituation({})).toBeNull();
  });

  it('heads the run CHALLENGES, or CHALLENGES YOU FOLLOW when every one is followed', () => {
    expect(sectionLabel('challenge_event')).toBe('CHALLENGES');
    expect(challengeSectionLabel([card(), card({ object_id: 'e2' })])).toBe(
      'CHALLENGES YOU FOLLOW',
    );
    expect(challengeSectionLabel([card(), card({}, { relation: 'competitor' })])).toBe(
      'CHALLENGES',
    );
    expect(challengeSectionLabel([])).toBe('CHALLENGES');
  });

  it('groups consecutive challenge cards under one heading', () => {
    const { sections } = feedSections([
      card({ position: 1 }),
      card({ position: 2, object_id: 'e2' }),
    ]);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.cards).toHaveLength(2);
  });
});
