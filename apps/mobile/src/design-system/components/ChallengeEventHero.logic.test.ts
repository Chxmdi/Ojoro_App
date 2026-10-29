import { describe, expect, it } from 'vitest';

import {
  CHALLENGE_STAGES,
  heroHaptic,
  progressLabel,
  stageSpec,
  versusLabel,
  winnerHeadline,
} from './ChallengeEventHero.logic';

describe('stageSpec', () => {
  it('escalates forward through the situations (README table)', () => {
    expect(CHALLENGE_STAGES.map((s) => stageSpec(s).situation)).toEqual([
      'forming',
      'forming',
      'confirmed',
      'confirmed',
      'live',
      'after',
    ]);
  });

  it('heads TODAY. and ALMOST TIME. on the day', () => {
    expect(stageSpec('today')).toEqual({
      situation: 'confirmed',
      head: 'TODAY.',
      over: 'CHALLENGE DAY',
    });
    expect(stageSpec('soon').head).toBe('ALMOST TIME.');
    expect(stageSpec('days').head).toBeNull();
    expect(stageSpec('live').over).toBeNull();
    expect(stageSpec('complete').over).toBe('RESULT · VERIFIED');
  });

  it('falls back to accepted', () => {
    expect(stageSpec(undefined).over).toBe('CHALLENGE ACCEPTED');
    expect(stageSpec('later' as never).over).toBe('CHALLENGE ACCEPTED');
  });
});

describe('labels', () => {
  it('states the winner as a fact', () => {
    expect(winnerHeadline('Chimdi', 'Marcus')).toBe('CHIMDI WINS.');
    expect(winnerHeadline(undefined, 'Chimdi')).toBe('CHIMDI WINS.');
  });

  it('reads the names and progress', () => {
    expect(versusLabel('Chimdi', 'Marcus')).toBe('Chimdi versus Marcus');
    expect(progressLabel({ name: 'Chimdi', progress: '3.4 KM' }, { name: 'Marcus' })).toBe(
      'Chimdi 3.4 KM, Marcus',
    );
  });
});

describe('heroHaptic', () => {
  const at = (stage: (typeof CHALLENGE_STAGES)[number], bothCheckedIn = false) => ({
    stage,
    bothCheckedIn,
  });

  it('never on first render', () => {
    expect(heroHaptic(undefined, at('complete', true))).toBeNull();
  });

  it('medium once when both check in', () => {
    expect(heroHaptic(at('soon'), at('soon', true))).toBe('bothCheckedIn');
    expect(heroHaptic(at('soon', true), at('soon', true))).toBeNull();
    expect(heroHaptic(at('soon', true), at('live', true))).toBeNull();
  });

  it('success when the result is verified', () => {
    expect(heroHaptic(at('live', true), at('complete', true))).toBe('resultVerified');
    expect(heroHaptic(at('complete'), at('complete'))).toBeNull();
  });
});
