import { describe, expect, it } from 'vitest';

import {
  PARTICIPANT_ROLES,
  participantLabel,
  roleMark,
  roleSpoken,
  roleWord,
  sortParticipants,
} from './ParticipantRow.logic';

describe('roleWord / roleSpoken', () => {
  it("matches the web ROLE map and defaults to I'M DOWN", () => {
    expect(PARTICIPANT_ROLES.map(roleWord)).toEqual([
      'HOST',
      "I'M DOWN",
      'INVITED',
      'MAYBE',
      'CHECKED IN',
    ]);
    expect(roleWord(undefined)).toBe("I'M DOWN");
    expect(roleSpoken('in')).toBe("I'm down");
    expect(roleSpoken('checked')).toBe('checked in');
    expect(roleSpoken(undefined)).toBe("I'm down");
  });
});

describe('roleMark', () => {
  it('host is a signal badge, checked the verified mark, others neutral', () => {
    expect(roleMark('host')).toEqual({ kind: 'badge', tone: 'signal', text: 'HOST' });
    expect(roleMark('checked')).toEqual({ kind: 'verified' });
    expect(roleMark('maybe')).toEqual({ kind: 'badge', tone: 'neutral', text: 'MAYBE' });
    expect(roleMark(undefined)).toEqual({ kind: 'badge', tone: 'neutral', text: "I'M DOWN" });
  });
});

describe('sortParticipants', () => {
  it('sorts host, checked, in, maybe, invited and keeps order within a role', () => {
    const rows = [
      { n: 'a', role: 'invited' as const },
      { n: 'b', role: 'in' as const },
      { n: 'c' },
      { n: 'd', role: 'maybe' as const },
      { n: 'e', role: 'checked' as const },
      { n: 'f', role: 'host' as const },
    ];
    expect(sortParticipants(rows).map((r) => r.n)).toEqual(['f', 'e', 'b', 'c', 'd', 'a']);
    expect(rows[0]?.n).toBe('a');
  });
});

describe('participantLabel', () => {
  it('reads name, status, meta and trailing, skipping blanks', () => {
    expect(
      participantLabel({
        name: 'Ade B',
        status: 'host',
        meta: 'Started the plan · 40 games hosted',
      }),
    ).toBe('Ade B, host, Started the plan · 40 games hosted');
    expect(participantLabel({ name: 'Rina', meta: ' ', trailing: 'PAID' })).toBe('Rina, PAID');
  });
});
