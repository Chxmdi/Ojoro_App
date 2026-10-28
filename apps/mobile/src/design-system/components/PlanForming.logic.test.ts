import { describe, expect, it } from 'vitest';

import { isBreakthrough, isGather, planAccessibilityLabel, planModel, planVariant } from './PlanForming.logic';

describe('planVariant', () => {
  it('matches the web thresholds', () => {
    expect(planVariant(1, 8)).toBe('early');
    expect(planVariant(3, 8)).toBe('early');
    expect(planVariant(4, 8)).toBe('viable');
    expect(planVariant(5, 8)).toBe('viable');
    expect(planVariant(6, 8)).toBe('almost');
    expect(planVariant(7, 8)).toBe('need-one-more');
    expect(planVariant(8, 8)).toBe('game-on');
    expect(planVariant(9, 8)).toBe('game-on');
  });

  it('one short is NEED ONE MORE even for small plans', () => {
    expect(planVariant(1, 2)).toBe('need-one-more');
    expect(planVariant(2, 4)).toBe('viable');
  });

  it('expired wins over everything', () => {
    expect(planVariant(8, 8, true)).toBe('expired');
    expect(planVariant(3, 8, true)).toBe('expired');
  });
});

describe('planModel', () => {
  const base = { activity: 'Football', capacity: 8, time: 'Tonight 7:30' };

  it('six of eight: forming, 2 MORE, two open spots, I’M DOWN', () => {
    const m = planModel({ ...base, count: 6 });
    expect(m).toMatchObject({
      variant: 'almost',
      situation: 'forming',
      overline: 'PLAN FORMING',
      meta: 'Football · Tonight 7:30',
      countText: '6 / 8',
      head: '2 MORE',
      headSize: 'display-sm',
      openSpots: 2,
      action: 'commit',
      progressLabel: '6 of 8 committed',
      dimmed: false,
    });
  });

  it('caps open spots at two', () => {
    expect(planModel({ ...base, count: 2 }).openSpots).toBe(2);
  });

  it('seven of eight: NEED ONE MORE at display-md, PULL SOMEONE IN', () => {
    const m = planModel({ ...base, count: 7 });
    expect(m.head).toBe('NEED ONE MORE');
    expect(m.headSize).toBe('display-md');
    expect(m.openSpots).toBe(1);
    expect(m.action).toBe('invite');
  });

  it('eight of eight: confirmed, GAME ON, OPEN GAME, no open spots', () => {
    const m = planModel({ ...base, count: 8 });
    expect(m).toMatchObject({
      variant: 'game-on',
      situation: 'confirmed',
      overline: 'CONFIRMED',
      head: 'GAME ON',
      headSize: 'display-md',
      openSpots: 0,
      action: 'open',
    });
  });

  it('expired: calm, PLAN, EXPIRED, dimmed, no button', () => {
    const m = planModel({ ...base, activity: 'Volleyball', count: 3, expired: true });
    expect(m).toMatchObject({
      variant: 'expired',
      situation: 'calm',
      overline: 'PLAN',
      head: 'EXPIRED',
      openSpots: 0,
      action: null,
      dimmed: true,
    });
  });

  it('a forced variant overrides the count', () => {
    expect(planModel({ ...base, count: 3, variant: 'need-one-more' }).head).toBe('NEED ONE MORE');
    expect(planModel({ ...base, count: 3, variant: 'early' }).head).toBe('5 MORE');
  });

  it('never shows a negative count left', () => {
    expect(planModel({ ...base, count: 10 }).left).toBe(0);
  });
});

describe('planAccessibilityLabel', () => {
  it('is the spec sentence', () => {
    expect(planAccessibilityLabel('Football', 7, 8, 'need-one-more')).toBe(
      'Football plan forming. Seven of eight participants committed. One more participant needed.',
    );
  });

  it('plural, game on and expired', () => {
    expect(planAccessibilityLabel('Football', 6, 8, 'almost')).toBe(
      'Football plan forming. Six of eight participants committed. Two more participants needed.',
    );
    expect(planAccessibilityLabel('Football', 8, 8, 'game-on')).toBe(
      'Football plan confirmed. Game on. Eight of eight participants committed.',
    );
    expect(planAccessibilityLabel('Volleyball', 3, 8, 'expired')).toBe(
      'Volleyball plan expired. Three of eight participants committed.',
    );
  });

  it('uses numerals past twelve', () => {
    expect(planAccessibilityLabel('Run', 13, 20, 'viable')).toBe(
      'Run plan forming. 13 of 20 participants committed. Seven more participants needed.',
    );
  });
});

describe('motion triggers', () => {
  it('breakthrough only on gathering → game-on', () => {
    expect(isBreakthrough('need-one-more', 'game-on')).toBe(true);
    expect(isBreakthrough('early', 'game-on')).toBe(true);
    expect(isBreakthrough(undefined, 'game-on')).toBe(false);
    expect(isBreakthrough('game-on', 'game-on')).toBe(false);
    expect(isBreakthrough('expired', 'game-on')).toBe(false);
    expect(isBreakthrough('almost', 'need-one-more')).toBe(false);
  });

  it('gather when the count goes up', () => {
    expect(isGather(6, 7)).toBe(true);
    expect(isGather(7, 7)).toBe(false);
    expect(isGather(7, 6)).toBe(false);
    expect(isGather(undefined, 7)).toBe(false);
  });
});
