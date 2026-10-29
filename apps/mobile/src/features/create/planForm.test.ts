import { describe, expect, it } from 'vitest';

import {
  dayChoices,
  hasPlanErrors,
  initialPlanForm,
  parseCost,
  planArgs,
  planSummary,
  startsAt,
  timeChoices,
  timeChoicesFor,
  validatePlanForm,
  type PlanFormState,
} from './planForm';

const TZ = 'America/Toronto';
const NOW = new Date('2026-10-29T13:00:00Z'); // Thu 29 Oct, 9 AM

const valid: PlanFormState = {
  ...initialPlanForm(),
  sportId: 'football',
  dayOffset: 0,
  minuteOfDay: 19 * 60 + 30,
  placeId: 'place-1',
  capacity: 8,
};

describe('plan form choices', () => {
  it('offers a week of days', () => {
    const days = dayChoices(NOW, TZ);
    expect(days).toHaveLength(7);
    expect(days.slice(0, 3).map((d) => d.label)).toEqual(['Today', 'Tomorrow', 'Sat 31']);
  });

  it('offers half hours from 6 AM to 10 PM, and drops today’s too-soon ones', () => {
    const all = timeChoices();
    expect(all[0]?.label).toBe('6 AM');
    expect(all.at(-1)?.label).toBe('10 PM');
    expect(all).toHaveLength(33);
    const today = timeChoicesFor(0, NOW, TZ);
    expect(today[0]?.label).toBe('9:30 AM');
    expect(timeChoicesFor(1, NOW, TZ)).toHaveLength(33);
  });

  it('builds the start in the place’s zone', () => {
    expect(startsAt(0, 19 * 60 + 30, NOW, TZ).toISOString()).toBe('2026-10-29T23:30:00.000Z');
  });
});

describe('plan form validation', () => {
  it('needs a sport, a time and a place, in words', () => {
    const e = validatePlanForm(initialPlanForm(), 'quick', NOW, TZ);
    expect(e).toEqual({ sport: 'Pick a sport.', time: 'Pick a start time.', place: 'Pick where you will play.' });
    expect(hasPlanErrors(validatePlanForm(valid, 'quick', NOW, TZ))).toBe(false);
  });

  it('rejects a time too soon, a bad capacity and a long meeting point', () => {
    const e = validatePlanForm(
      { ...valid, minuteOfDay: 9 * 60, capacity: 13, meetingPoint: 'x'.repeat(121) },
      'quick',
      NOW,
      TZ,
    );
    expect(e.time).toMatch(/at least 20 minutes/);
    expect(e.capacity).toBe('Plans hold 2 to 12 people.');
    expect(e.meetingPoint).toMatch(/120/);
  });

  it('checks the host details only for an Activity', () => {
    const f = { ...valid, cost: 'ten', title: 'x'.repeat(61) };
    expect(hasPlanErrors(validatePlanForm(f, 'quick', NOW, TZ))).toBe(false);
    const e = validatePlanForm(f, 'activity', NOW, TZ);
    expect(e.cost).toMatch(/number/);
    expect(e.title).toMatch(/60/);
  });

  it('reads costs', () => {
    expect(parseCost('')).toBe(0);
    expect(parseCost('$7.50')).toBe(750);
    expect(parseCost('5,25')).toBe(525);
    expect(parseCost('12')).toBe(1200);
    expect(parseCost('abc')).toBeNull();
  });
});

describe('plan form arguments', () => {
  it('sends the quick plan with the meeting point, and nothing for invalid forms', () => {
    expect(planArgs(initialPlanForm(), 'quick', NOW, TZ)).toBeNull();
    expect(planArgs({ ...valid, meetingPoint: '  North pitch ', title: 'ignored' }, 'quick', NOW, TZ)).toEqual({
      p_sport_id: 'football',
      p_starts_at: '2026-10-29T23:30:00.000Z',
      p_capacity: 8,
      p_place_id: 'place-1',
      p_audience: 'public',
      p_meeting_point: 'North pitch',
    });
  });

  it('adds the host details for an Activity', () => {
    const args = planArgs(
      {
        ...valid,
        audience: 'friends',
        title: 'Thursday 7s',
        durationMinutes: 90,
        teamA: 'Lights',
        teamB: 'Darks',
        cost: '5',
        kit: 'Two shirts',
        level: 'Casual',
      },
      'activity',
      NOW,
      TZ,
    );
    expect(args).toMatchObject({
      p_audience: 'friends',
      p_title: 'Thursday 7s',
      p_duration_minutes: 90,
      p_team_a_label: 'Lights',
      p_team_b_label: 'Darks',
      p_cost_cents: 500,
      p_kit_note: 'Two shirts',
      p_level_label: 'Casual',
    });
    expect(planArgs({ ...valid, cost: '' }, 'activity', NOW, TZ)).not.toHaveProperty('p_cost_cents');
  });

  it('summarises what will happen', () => {
    expect(planSummary(valid, 'Today', NOW, TZ)).toBe("Today at 7:30 PM. You host and you're in. It locks at 8: that's GAME ON.");
    expect(planSummary({ ...valid, minuteOfDay: null }, 'Today', NOW, TZ)).toMatch(/^You host/);
  });
});
