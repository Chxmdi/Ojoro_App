import { describe, expect, it } from 'vitest';

import {
  cardToNearby,
  crewSuggestionLine,
  feedDownFor,
  feedSections,
  isLiveCard,
  sectionLabel,
  type FeedCard,
  type NearbyDown,
} from './homeLogic';

function card(over: Partial<FeedCard>): FeedCard {
  return {
    position: 1,
    card: 'plan_forming',
    action: 'im_down',
    object_kind: 'plan',
    object_id: 'p1',
    plan_id: 'p1',
    activity_id: null,
    crew_id: null,
    sport_id: 'tennis',
    sport_name: 'Tennis',
    title: 'Tennis doubles',
    reason: 'starts in 12 min',
    starts_at: '2026-10-29T18:00:00Z',
    place_name: 'Jeanne-Mance Park',
    member_count: 2,
    capacity: 4,
    people: null,
    notification_id: null,
    href: '/plan/p1',
    ...over,
  };
}

describe('feedSections', () => {
  it('keeps rank order, groups runs of a kind and pulls out caught_up', () => {
    const { sections, end } = feedSections([
      card({ position: 9, card: 'caught_up', title: "YOU'RE CAUGHT UP." }),
      card({ position: 2, card: 'needs_you' }),
      card({ position: 1, card: 'needs_you' }),
      card({ position: 3, card: 'your_plan' }),
      card({ position: 4, card: 'plan_forming' }),
      card({ position: 5, card: 'your_plan' }),
    ]);
    expect(sections.map((s) => [s.kind, s.cards.map((c) => c.position)])).toEqual([
      ['needs_you', [1, 2]],
      ['your_plan', [3]],
      ['plan_forming', [4]],
      ['your_plan', [5]],
    ]);
    expect(end?.title).toBe("YOU'RE CAUGHT UP.");
  });

  it('puts crew suggestions and crew plans under one heading', () => {
    const { sections } = feedSections([
      card({ position: 1, card: 'crew_suggestion' }),
      card({ position: 2, card: 'crew_plan' }),
      card({ position: 3, card: 'recap' }),
    ]);
    expect(sections.map((s) => [s.kind, s.cards.length])).toEqual([
      ['crew_suggestion', 2],
      ['recap', 1],
    ]);
  });

  it('has no end card when the server sent none', () => {
    expect(feedSections([]).end).toBeNull();
  });
});

describe('sectionLabel', () => {
  it('names the feed sections', () => {
    expect(sectionLabel('needs_you')).toBe('NEEDS YOU');
    expect(sectionLabel('your_plan')).toBe('YOUR PLANS');
    expect(sectionLabel('crew_suggestion')).toBe('YOUR CREWS');
    expect(sectionLabel('crew_plan')).toBe('YOUR CREWS');
    expect(sectionLabel('plan_forming')).toBe('FORMING NEAR YOU');
    expect(sectionLabel('recap')).toBeNull();
    expect(sectionLabel('down_for')).toBeNull();
  });
});

describe('cards', () => {
  it('turns a plan card into the forming object', () => {
    expect(cardToNearby(card({}))).toMatchObject({ plan_id: 'p1', member_count: 2, capacity: 4, i_am_in: false, sport_name: 'Tennis' });
    expect(cardToNearby(card({ sport_name: null }))?.sport_name).toBe('Tennis doubles');
    expect(cardToNearby(card({ plan_id: null }))).toBeNull();
    expect(cardToNearby(card({ capacity: null }))).toBeNull();
  });

  it('knows a live plan by its link', () => {
    expect(isLiveCard({ href: '/activity/a1/live' })).toBe(true);
    expect(isLiveCard({ href: '/plan/p1' })).toBe(false);
    expect(isLiveCard({ href: null })).toBe(false);
  });

  it('writes the crew suggestion line', () => {
    expect(crewSuggestionLine({ reason: '3 of you want in', people: 3 })).toBe('3 of you want in.');
    expect(crewSuggestionLine({ reason: 'already said.', people: 3 })).toBe('Already said.');
    expect(crewSuggestionLine({ reason: null, people: 4 })).toBe('4 of you want in.');
    expect(crewSuggestionLine({ reason: null, people: null })).toBe('Your crew is talking about a game.');
  });
});

describe('feedDownFor', () => {
  const down = (user: string, sport: string): NearbyDown => ({
    signal_id: `${user}-${sport}`,
    sport_id: sport,
    user_id: user,
    display_name: user,
    avatar_path: null,
    window_start: '2026-10-29T22:00:00Z',
    window_end: '2026-10-30T02:00:00Z',
    expires_at: '2026-10-30T02:00:00Z',
  });
  const downs = [down('a', 'volleyball'), down('b', 'volleyball'), down('c', 'football'), down('d', 'football'), down('e', 'football')];

  it("shows the sport the feed ranked, even when another has more people", () => {
    expect(feedDownFor({ sport_id: 'volleyball' }, null, downs, [])?.sportId).toBe('volleyball');
    expect(feedDownFor({ sport_id: 'volleyball' }, null, downs, [])?.people).toHaveLength(2);
  });

  it("keeps your own sport when the feed leaves it out because you're down", () => {
    expect(feedDownFor(null, 'football', downs, [])?.sportId).toBe('football');
  });

  it('shows nothing without a card, a sport of yours, or people', () => {
    expect(feedDownFor(null, null, downs, [])).toBeNull();
    expect(feedDownFor({ sport_id: 'boxing' }, null, downs, [])).toBeNull();
    expect(feedDownFor({ sport_id: null }, null, downs, [])).toBeNull();
  });
});
