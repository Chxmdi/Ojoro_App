import { describe, expect, it } from 'vitest';

import {
  LIVE_ANNOUNCE_MS,
  formatValue,
  laneLabel,
  lanePct,
  raceSummary,
  shouldAnnounce,
  targetLine,
  watchingLine,
} from './LiveChallenge.logic';

const chimdi = { name: 'Chimdi', value: 3.4, checkedIn: true };
const marcus = { name: 'Marcus', value: 3.1 };

describe('LiveChallenge logic', () => {
  it('formats values without float noise', () => {
    expect(formatValue(3.4)).toBe('3.4');
    expect(formatValue(5)).toBe('5');
    expect(formatValue(0.1 + 0.2)).toBe('0.3');
    expect(formatValue(-1)).toBe('0');
  });

  it('fills lanes 0–100', () => {
    expect(lanePct(3.4, 5)).toBe(68);
    expect(lanePct(6, 5)).toBe(100);
    expect(lanePct(1, 0)).toBe(100);
    expect(lanePct(Number.NaN, 5)).toBe(0);
  });

  it('labels each lane as the spec says', () => {
    expect(laneLabel(chimdi, 'KM', 5)).toBe('Chimdi 3.4 KM of 5, checked in');
    expect(laneLabel(marcus, 'KM', 5)).toBe('Marcus 3.1 KM of 5');
  });

  it('writes the target and watchers', () => {
    expect(targetLine('5k', 5, 'km')).toBe('5K · TARGET 5 KM');
    expect(watchingLine(212)).toBe('212 watching');
    expect(watchingLine(0)).toBeNull();
    expect(watchingLine(undefined)).toBeNull();
  });

  it('tells the leader by numbers', () => {
    expect(raceSummary(chimdi, marcus, 'KM')).toBe(
      'Chimdi 3.4 KM, Marcus 3.1 KM. Chimdi leads by 0.3 KM.',
    );
    expect(raceSummary(marcus, chimdi, 'KM')).toBe(
      'Marcus 3.1 KM, Chimdi 3.4 KM. Chimdi leads by 0.3 KM.',
    );
    expect(raceSummary({ name: 'A', value: 2 }, { name: 'B', value: 2 }, 'KM')).toBe(
      'A 2 KM, B 2 KM. Level.',
    );
  });

  it('announces at most every 30s', () => {
    expect(shouldAnnounce(null, 0)).toBe(true);
    expect(shouldAnnounce(1000, 1000 + LIVE_ANNOUNCE_MS - 1)).toBe(false);
    expect(shouldAnnounce(1000, 1000 + LIVE_ANNOUNCE_MS)).toBe(true);
  });
});
