import { describe, expect, it } from 'vitest';

import {
  bucketWhen,
  dayOverline,
  demandBand,
  firstHomeBody,
  furtherStrip,
  furtherTarget,
  inviteMessage,
  pickBucket,
  quickChips,
  sportVerb,
  type Bucket,
  type Density,
} from './firstHomeLogic';

const TZ = 'America/Toronto';
// Thu 29 Oct 2026, 9:00 AM in Montréal.
const NOW = new Date('2026-10-29T13:00:00Z');

const density: Density = {
  has_area: true,
  area: 'Saint-Henri, Montréal',
  radius_km: 3,
  day_number: 1,
  plans_near: 0,
  games_near: 0,
  further_out_count: 4,
};

const runners: Bucket = {
  sport_id: 'running',
  sport_name: 'Running',
  part: 'evening',
  suggested_start: '2026-10-30T22:00:00Z', // Fri 6 PM
  window_end: '2026-10-31T01:00:00Z',
  people_count: 3,
};

describe('FirstHome words', () => {
  it('names the day and the neighbourhood', () => {
    expect(dayOverline(density)).toBe('DAY 1 · SAINT-HENRI');
    expect(dayOverline({ ...density, has_area: false, day_number: 3 })).toBe('DAY 3');
    expect(dayOverline({ ...density, day_number: 0 })).toBe('DAY 1 · SAINT-HENRI');
  });

  it('turns sports into verbs', () => {
    expect(sportVerb('running', 'Running')).toBe('run');
    expect(sportVerb('football', 'Football')).toBe('play football');
  });

  it('says when a bucket is, relative to today', () => {
    expect(bucketWhen(runners, NOW, TZ)).toBe('tomorrow evening');
    expect(bucketWhen({ part: 'evening', suggested_start: '2026-10-29T23:00:00Z' }, NOW, TZ)).toBe('tonight');
    expect(bucketWhen({ part: 'morning', suggested_start: '2026-10-29T14:00:00Z' }, NOW, TZ)).toBe('this morning');
    expect(bucketWhen({ part: 'midday', suggested_start: '2026-10-31T17:00:00Z' }, NOW, TZ)).toBe('on Sat afternoon');
  });

  it('is honest about what is near: nothing, one, or the demand', () => {
    expect(firstHomeBody(density, runners, NOW, TZ)).toBe(
      "Nothing's scheduled near you yet. But 3 people within 3 km want to run tomorrow evening.",
    );
    expect(firstHomeBody({ ...density, plans_near: 1 }, runners, NOW, TZ)).toMatch(
      /^One plan is forming near you this week\. And 3 people/,
    );
    expect(firstHomeBody({ ...density, games_near: 1 }, null, NOW, TZ)).toBe(
      'One game is on near you this week. 4 things are on a bit further out.',
    );
    expect(firstHomeBody({ ...density, further_out_count: 1 }, null, NOW, TZ)).toContain('1 thing is on');
    expect(firstHomeBody({ ...density, further_out_count: 0 }, null, NOW, TZ)).toContain("Say what you're down for");
    expect(firstHomeBody({ ...density, plans_near: 2, games_near: 1 }, null, NOW, TZ)).toMatch(/^3 plans and games/);
    expect(firstHomeBody({ ...density, has_area: false }, runners, NOW, TZ)).toContain('Pick your area');
  });

  it('picks the demand in your sports first', () => {
    const volley = { ...runners, sport_id: 'volleyball' };
    expect(pickBucket([volley, runners], ['running'])).toBe(runners);
    expect(pickBucket([volley, runners], ['boxing'])).toBe(volley);
    expect(pickBucket([], ['running'])).toBeNull();
  });

  it('builds the band: a count toward count + 1, never people', () => {
    const band = demandBand(runners, NOW, TZ);
    expect(band.headline).toBe('RUNNING TOMORROW EVENING.');
    expect(band.threshold).toBe(4);
    expect(band.summary).toBe(
      '3 people nearby are down for running tomorrow evening, from 6 PM. Add yourself and it becomes a plan at 4.',
    );
    expect(demandBand({ ...runners, people_count: 1 }, NOW, TZ).summary).toMatch(/^1 person nearby is down/);
  });
});

describe('quick Down For chips', () => {
  const sports = [
    { id: 'football', name: 'Football' },
    { id: 'running', name: 'Running' },
    { id: 'boxing', name: 'Boxing' },
    { id: 'tennis', name: 'Tennis' },
  ];
  const all = [
    { id: 'tonight' as const, label: 'Tonight' },
    { id: 'tomorrow-morning' as const, label: 'Tomorrow morning' },
    { id: 'tomorrow-evening' as const, label: 'Tomorrow evening' },
    { id: 'weekend' as const, label: 'This weekend' },
  ];

  it('gives three sports three different times', () => {
    expect(quickChips(sports, all).map((c) => c.label)).toEqual([
      'Football tonight',
      'Running tomorrow evening',
      'Boxing this weekend',
    ]);
  });

  it('starts from tomorrow evening once tonight has passed', () => {
    const late = all.filter((w) => w.id !== 'tonight');
    expect(quickChips(sports, late).map((c) => c.windowId)).toEqual(['tomorrow-evening', 'tomorrow-morning', 'weekend']);
    expect(quickChips(sports.slice(0, 1), late)).toHaveLength(1);
  });
});

describe('further out', () => {
  const row = {
    kind: 'activity',
    plan_id: 'p1',
    activity_id: 'a1',
    sport_name: 'Running',
    title: 'Evening 5K',
    starts_at: '2026-10-29T22:30:00Z',
    status: 'game_on',
    member_count: 4,
    capacity: 4,
    place_name: 'Lachine Canal',
    place_area: 'Saint-Henri',
    place_time_zone: TZ,
    distance_km: 1.8,
  };

  it('draws a strip with the distance and GAME ON', () => {
    expect(furtherStrip(row)).toEqual({
      activity: 'Evening 5K',
      time: '6:30',
      place: 'Lachine Canal · 1.8 km',
      status: 'confirmed',
      count: 4,
      capacity: 4,
    });
    const plan = furtherStrip({ ...row, kind: 'plan', status: 'forming', title: null, place_name: null, distance_km: null, place_time_zone: '' });
    expect(plan).toMatchObject({ activity: 'Running', place: 'Saint-Henri', status: 'forming' });
    expect(furtherStrip({ ...row, status: 'live' }).status).toBe('live');
    expect(furtherStrip({ ...row, place_name: null, place_area: null }).place).toBe('Place to be agreed · 1.8 km');
  });

  it('opens the game or the plan', () => {
    expect(furtherTarget(row)).toEqual({ kind: 'activity', id: 'a1' });
    expect(furtherTarget({ ...row, kind: 'plan' })).toEqual({ kind: 'plan', id: 'p1' });
    expect(furtherTarget({ ...row, activity_id: '' })).toEqual({ kind: 'plan', id: 'p1' });
  });

  it('shares an invite with the link and nothing personal', () => {
    expect(inviteMessage('ojoro://')).toBe(
      "I'm on Ojoro. Say what you're down for and plans form around it. Come play: ojoro://",
    );
  });
});
