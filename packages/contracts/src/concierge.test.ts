import { describe, expect, it } from 'vitest';

import * as edge from '../../../supabase/functions/concierge/logic';
import {
  answerFromSuggestions,
  conciergeFallbackReasons,
  conciergeFunction,
  conciergeOutcomes,
  conciergeRpcs,
  conciergeServiceRpcs,
  conciergeStartOptions,
  parseConciergeAnswer,
} from './concierge';
import type { Suggestion } from './liquidity';

const row: Suggestion = {
  kind: 'plan',
  plan_id: 'p1',
  sport_id: 'football',
  sport_name: 'Football',
  title: 'Pickup football',
  starts_at: '2026-10-30T19:30:00Z',
  duration_minutes: 90,
  place_id: 'pl1',
  place_name: 'Jeanne-Mance Park',
  place_area: 'Plateau',
  distance_km: 1.2,
  member_count: 6,
  capacity: 8,
  played_with_count: 3,
  demand_count: 0,
  window_start: '',
  window_end: '',
  reasons: ["it's 1.2 km away"],
  reason: "it's 1.2 km away.",
};
const idea = { ...row, matched: true };

describe('concierge contract', () => {
  it('names the function and its RPCs', () => {
    expect(conciergeFunction).toBe('concierge');
    expect(conciergeRpcs).toContain('concierge_candidates');
    expect(conciergeServiceRpcs).toEqual(['concierge_ai_gate', 'concierge_ai_record']);
  });

  it('agrees with the Edge Function on the enums', () => {
    expect([...conciergeStartOptions]).toEqual([...edge.START_OPTIONS]);
    // Every reason the function can give is one the app knows (the app adds `unreachable`).
    const edgeReasons: edge.FallbackReason[] = ['no_key', 'injection_suspected', 'rate_limited', 'timeout', 'refusal', 'invalid_output', 'error'];
    for (const r of edgeReasons) expect(conciergeFallbackReasons).toContain(r);
    expect(conciergeOutcomes).toEqual(['match', 'nothing_fits', 'not_movement']);
  });

  it('parses what the Edge Function returns', () => {
    const set: edge.CandidateSet = {
      parse: { minutes: 90, sport_id: null, social: false },
      rows: [idea as unknown as edge.Candidate],
    };
    const answer = edge.rulesAnswer(set, 'no_key');
    expect(parseConciergeAnswer(JSON.parse(JSON.stringify(answer)))).toEqual(answer);
  });

  it('rejects anything else', () => {
    const ok = { source: 'ai', fallback_reason: null, outcome: 'match', best: idea, why: 'x', more: [], start: null, sport_id: null };
    expect(parseConciergeAnswer(ok)).not.toBeNull();
    for (const bad of [
      null,
      [],
      'text',
      { ...ok, source: 'model' },
      { ...ok, fallback_reason: 'bored' },
      { ...ok, outcome: 'joined' },
      { ...ok, best: null },
      { ...ok, best: { ...idea, kind: 'person' } },
      { ...ok, best: { ...idea, plan_id: null } },
      { ...ok, why: 3 },
      { ...ok, start: 'send' },
      { ...ok, more: 'x' },
      { ...ok, more: [{ kind: 'plan' }] },
    ]) {
      expect(parseConciergeAnswer(bad)).toBeNull();
    }
  });

  it('caps other ideas at two', () => {
    const many = { source: 'rules', fallback_reason: 'no_key', outcome: 'match', best: idea, why: null, more: [idea, idea, idea], start: null, sport_id: null };
    expect(parseConciergeAnswer(many)?.more).toHaveLength(2);
  });

  it('shapes concierge_suggest rows like the rules answer', () => {
    const a = answerFromSuggestions([row, { ...row, plan_id: 'p2' }, { ...row, plan_id: 'p3' }, { ...row, plan_id: 'p4' }]);
    expect(a).toMatchObject({ source: 'rules', fallback_reason: 'unreachable', outcome: 'match', why: "it's 1.2 km away", start: null });
    expect(a.best?.plan_id).toBe('p1');
    expect(a.more.map((m) => m.plan_id)).toEqual(['p2', 'p3']);
    expect(answerFromSuggestions([], 'error')).toMatchObject({ outcome: 'nothing_fits', best: null, why: null, start: 'down_for' });
  });
});
