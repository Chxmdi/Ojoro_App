import type { PlaceGroup, PlaceHost, PlaceTonightItem, PlaceView } from '@ojoro/contracts';
import { describe, expect, it } from 'vitest';

import {
  busyBlock,
  directionsTarget,
  formatKm,
  formTimeFrom,
  groupRoute,
  groupRow,
  groupTitle,
  heroAlt,
  hostRow,
  placeOverline,
  placeTitle,
  shareText,
  tonightRoute,
  tonightStrip,
  verificationWords,
} from './logic';
import { placeRoutes } from './routes';

const TZ = 'America/Toronto';
// Tuesday 27 Oct 2026, 2 PM in Montréal.
const NOW = new Date('2026-10-27T18:00:00Z');

const item = (over: Partial<PlaceTonightItem> = {}): PlaceTonightItem =>
  ({
    kind: 'plan',
    plan_id: 'p1',
    activity_id: null,
    clan_run_id: null,
    clan_id: null,
    sport_id: 'football',
    sport_name: 'Football',
    title: 'Pickup football',
    starts_at: '2026-10-27T23:30:00Z',
    ends_at: '2026-10-28T01:00:00Z',
    time_zone: TZ,
    status: 'forming',
    member_count: 6,
    capacity: 8,
    spots_left: 2,
    level_label: 'Mixed level',
    meeting_point: null,
    i_am_in: false,
    ...over,
  }) as PlaceTonightItem;

const group = (over: Partial<PlaceGroup> = {}): PlaceGroup =>
  ({
    kind: 'crew_ritual',
    id: 'r1',
    group_id: 'c1',
    group_name: 'Thursday FC',
    title: 'Thursday FC',
    sport_id: 'football',
    sport_name: 'Football',
    days: [4],
    local_time: '19:30',
    time_zone: TZ,
    distance_km: null,
    weeks_running: 6,
    access: 'crew',
    i_am_in: true,
    cadence: 'Every week, 7:30',
    ...over,
  }) as PlaceGroup;

describe('header', () => {
  it('reads the area and distance as the overline', () => {
    expect(placeOverline({ area: 'Plateau', distance_km: 1.2 })).toBe('PLATEAU · 1.2 KM');
    expect(placeOverline({ area: 'Plateau', distance_km: null })).toBe('PLATEAU');
  });

  it('sets the name in caps with the full stop', () => {
    expect(placeTitle('Jeanne-Mance Park')).toBe('JEANNE-MANCE PARK.');
    expect(placeTitle('Go.')).toBe('GO.');
  });

  it('rounds kilometres', () => {
    expect(formatKm(3)).toBe('3');
    expect(formatKm(12.345)).toBe('12.3');
  });

  it('names how the place is known in words', () => {
    expect(verificationWords('listed')).toBeNull();
    expect(verificationWords('venue_verified')).toBe('Verified by the venue');
    expect(verificationWords('community_confirmed')).toMatch(/games played here/);
    expect(verificationWords('other')).toBeNull();
  });

  it('describes the hero and the share', () => {
    expect(heroAlt({ name: 'Jeanne-Mance Park', area: 'Plateau' })).toBe('Jeanne-Mance Park, Plateau');
    const facts = 'Football · turf · free';
    expect(shareText({ name: 'J', area: 'Plateau', facts, tonight_count: 12 })).toBe(
      'J, Plateau. Football · turf · free. 12 things on tonight. On Ojoro.',
    );
    expect(shareText({ name: 'J', area: 'Plateau', facts, tonight_count: 1 })).toContain('1 thing on');
    expect(shareText({ name: 'J', area: 'Plateau', facts, tonight_count: 0 })).toContain('Nothing on tonight yet.');
  });

  it('sends the OS maps app the public centroid and the name, not an address', () => {
    expect(directionsTarget({ lat: 45.5, lng: -73.6, name: 'Jeanne-Mance Park', area: 'Plateau' })).toEqual({
      lat: 45.5,
      lng: -73.6,
      label: 'Jeanne-Mance Park, Plateau',
    });
  });
});

describe('tonight here', () => {
  it('shows a forming plan with its count and the level only for people outside it', () => {
    const s = tonightStrip(item());
    expect(s).toMatchObject({ time: '7:30', activity: 'Pickup football', place: 'Mixed level', status: 'forming', count: 6, capacity: 8, tag: '6 / 8' });
  });

  it('shows the exact spot only when the server sends it (members)', () => {
    expect(tonightStrip(item({ meeting_point: 'North pitch', i_am_in: true })).place).toBe('North pitch · mixed level');
    expect(tonightStrip(item({ meeting_point: 'Track by the pond', level_label: null })).place).toBe('Track by the pond');
    expect(tonightStrip(item({ level_label: null, title: null })).activity).toBe('Football');
    expect(tonightStrip(item({ level_label: null })).place).toBe('Football');
  });

  it('maps GAME ON, live and full', () => {
    const on = tonightStrip(item({ kind: 'activity', activity_id: 'a1', status: 'game_on' }));
    expect(on).toMatchObject({ status: 'confirmed', count: undefined, tag: 'GAME ON' });
    expect(tonightStrip(item({ kind: 'activity', activity_id: 'a1', status: 'live' })).status).toBe('live');
    expect(tonightStrip(item({ member_count: 8 })).status).toBe('full');
  });

  it('opens the plan, the game or the clan', () => {
    expect(tonightRoute(item())).toEqual({ pathname: '/plan/[id]', params: { id: 'p1' } });
    expect(tonightRoute(item({ kind: 'activity', activity_id: 'a1' }))).toBe('/activity/a1');
    expect(tonightRoute(item({ kind: 'club_run', plan_id: null, clan_id: 'k1' }))).toBe('/clan/k1');
    expect(tonightRoute(item({ kind: 'club_run', plan_id: null, clan_id: null }))).toBeNull();
    expect(tonightRoute(item({ kind: 'activity', activity_id: null }))).toEqual({ pathname: '/plan/[id]', params: { id: 'p1' } });
  });
});

describe('rituals here', () => {
  it('reads like the design', () => {
    const r = groupRow(group());
    expect(r).toMatchObject({
      day: 'THU',
      dayName: 'Thursday',
      title: 'Thursday FC · football',
      meta: 'Every week, 7:30 · 6 weeks running',
      tag: 'CREW',
      href: '/crew/c1',
    });
  });

  it('uses the distance for a run and links the clan', () => {
    const g = group({ kind: 'clan_ritual', title: 'Sunrise run', distance_km: 6, days: [7, 3], access: 'open', group_id: 'k1' });
    expect(groupTitle(g)).toBe('Sunrise run · 6 km');
    expect(groupRow(g)).toMatchObject({ day: 'WED', tag: 'OPEN', href: '/clan/k1' });
  });

  it('shows a host series without a link (no participant screen yet)', () => {
    expect(groupRoute({ kind: 'host_series', group_id: 'h1' })).toBeNull();
    const r = groupRow(group({ kind: 'host_series', days: [], title: '' }));
    expect(r.day).toBe('');
    expect(r.title).toBe('Thursday FC · football');
  });
});

describe('hosts here', () => {
  const host = (over: Partial<PlaceHost> = {}): PlaceHost =>
    ({
      user_id: 'u1',
      display_name: 'Ade B',
      handle: 'adeb',
      avatar_path: null,
      hosted_here: 40,
      trusted_host: true,
      program_id: null,
      program_name: null,
      is_top: true,
      ...over,
    }) as PlaceHost;

  it('says how many games and links the profile', () => {
    expect(hostRow(host())).toEqual({ key: 'u1', name: 'Ade B', line: '40 games hosted here', trusted: true, href: '/profile/u1' });
  });

  it('falls back to the handle and names the program', () => {
    const r = hostRow(host({ display_name: null, program_name: 'Plateau Pickup', hosted_here: 1 }));
    expect(r.name).toBe('@adeb');
    expect(r.line).toBe('1 game hosted here · Runs Plateau Pickup');
    expect(hostRow(host({ display_name: null, handle: null })).name).toBe('Host');
  });
});

describe('when it is busy', () => {
  const view = {
    has_busy_history: true,
    busy_part: 'evening',
    busy_levels: [30, 85, 70, 100, 45, 60, 40],
    today_day: 2,
    busiest_day: 4,
    busy_summary: 'Busiest Thursday evenings. Tonight (Tuesday) is the second busiest.',
  } as Pick<PlaceView, 'has_busy_history' | 'busy_part' | 'busy_levels' | 'today_day' | 'busiest_day' | 'busy_summary'>;

  it('builds the bars with tonight current', () => {
    const b = busyBlock(view)!;
    expect(b.label).toBe("WHEN IT'S BUSY · EVENINGS");
    expect(b.title).toBe("When it's busy, evenings");
    expect(b.currentIndex).toBe(1);
    expect(b.data[3]).toEqual({ key: 'THU', label: 'THU', name: 'Thursday', value: 100 });
    expect(b.period).toBe('evenings');
    expect(b.summary).toMatch(/^Busiest Thursday/);
  });

  it('hides without history', () => {
    expect(busyBlock({ ...view, has_busy_history: false })).toBeNull();
    expect(busyBlock({ ...view, busy_levels: [1, 2] })).toBeNull();
  });

  it('works without a part or today', () => {
    const b = busyBlock({ ...view, busy_part: null, today_day: 9 })!;
    expect(b.label).toBe("WHEN IT'S BUSY");
    expect(b.title).toBe("When it's busy");
    expect(b.currentIndex).toBeNull();
    expect(b.period).toBe('days');
  });
});

describe('create here', () => {
  it('turns the suggested start into the form day and time', () => {
    expect(formTimeFrom('2026-10-27T23:00:00Z', NOW, TZ)).toEqual({ dayOffset: 0, minuteOfDay: 19 * 60 });
    expect(formTimeFrom('2026-10-28T23:30:00Z', NOW, TZ)).toEqual({ dayOffset: 1, minuteOfDay: 19 * 60 + 30 });
  });

  it('leaves times the form cannot show to the user', () => {
    expect(formTimeFrom(null, NOW, TZ)).toBeNull();
    expect(formTimeFrom('nonsense', NOW, TZ)).toBeNull();
    expect(formTimeFrom('2026-10-27T17:00:00Z', NOW, TZ)).toBeNull(); // past
    expect(formTimeFrom('2026-10-27T23:10:00Z', NOW, TZ)).toBeNull(); // not on the half hour
    expect(formTimeFrom('2026-10-28T03:00:00Z', NOW, TZ)).toBeNull(); // 11 PM
    expect(formTimeFrom('2026-11-10T23:00:00Z', NOW, TZ)).toBeNull(); // too far
  });

  it('routes to the create form with the prefill', () => {
    expect(placeRoutes.createHere('p1', 'football', '2026-10-27T23:00:00Z')).toEqual({
      pathname: '/create/plan',
      params: { place: 'p1', sport: 'football', at: '2026-10-27T23:00:00Z' },
    });
    expect(placeRoutes.createHere('p1')).toEqual({ pathname: '/create/plan', params: { place: 'p1' } });
    expect(placeRoutes.place('p1')).toEqual({ pathname: '/place/[id]', params: { id: 'p1' } });
    expect(placeRoutes.pulse()).toBe('/pulse');
    expect(placeRoutes.pulse('p1')).toEqual({ pathname: '/pulse', params: { place: 'p1' } });
  });
});
