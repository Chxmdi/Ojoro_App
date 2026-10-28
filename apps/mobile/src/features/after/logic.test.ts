import { describe, expect, it } from 'vitest';

import {
  afterOverline,
  altTextError,
  confirmedBy,
  contentType,
  currentProposal,
  goodGameLine,
  justVerified,
  momentPath,
  momentsNote,
  photoCredit,
  photoExtension,
  resultAction,
  scoreError,
  scoreOverline,
  thresholdLine,
} from './logic';

const TZ = 'America/Toronto';

describe('After', () => {
  it('picks the current proposal', () => {
    expect(currentProposal([{ status: 'superseded' }, { status: 'proposed' }])).toEqual({ status: 'proposed' });
    expect(currentProposal([{ status: 'proposed' }, { status: 'verified' }])).toEqual({ status: 'verified' });
    expect(currentProposal([{ status: 'superseded' }])).toBeNull();
  });

  it('says how long After is open', () => {
    const now = new Date('2026-10-28T02:00:00Z');
    expect(afterOverline('2026-10-29T01:00:00Z', now, TZ)).toBe('AFTER · OPEN UNTIL WED 9 PM');
    expect(afterOverline('2026-10-28T01:00:00Z', now, TZ)).toBe('AFTER · CLOSED');
  });

  it('writes the good-game line', () => {
    expect(goodGameLine(90, 8, true)).toBe(
      "90 minutes, 8 players. Lock in the result and the moments while they're fresh.",
    );
    expect(goodGameLine(60, 1, false)).toBe('60 minutes, 1 player. After has closed; the recap is final.');
  });

  it('says who logged the score', () => {
    expect(scoreOverline('Ade B', false)).toBe('FINAL SCORE · LOGGED BY ADE');
    expect(scoreOverline('Ade B', true)).toBe('FINAL SCORE · LOGGED BY YOU');
    expect(scoreOverline(null, false)).toBe('FINAL SCORE');
  });

  it('shows the threshold in counts', () => {
    expect(thresholdLine({ confirmations_count: 3, threshold: 4, status: 'proposed' }, 8)).toBe(
      '3 of 8 confirmed. At 4 it becomes Participant confirmed.',
    );
    expect(thresholdLine({ confirmations_count: 4, threshold: 4, status: 'verified' }, 8)).toBe(
      '4 of 8 confirmed. Participant confirmed.',
    );
    expect(confirmedBy(6, 8)).toBe('Confirmed by 6 of 8 players.');
    expect(confirmedBy(1, 1)).toBe('Confirmed by 1 of 1 player.');
  });

  it('validates scores', () => {
    expect(scoreError(5, 4)).toBeNull();
    expect(scoreError(-1, 4)).toMatch(/0 to 99/);
    expect(scoreError(5, 100)).toMatch(/0 to 99/);
    expect(scoreError(1.5, 1)).toMatch(/whole/);
  });

  it('notices verification', () => {
    expect(justVerified('proposed', 'verified')).toBe(true);
    expect(justVerified(null, 'verified')).toBe(false);
    expect(justVerified('verified', 'verified')).toBe(false);
  });

  it('decides what the result card offers', () => {
    const p = { status: 'proposed' as const };
    expect(resultAction({ proposal: { status: 'verified' }, iConfirmed: false, iPlayed: false, open: false })).toBe('verified');
    expect(resultAction({ proposal: p, iConfirmed: false, iPlayed: true, open: false })).toBe('closed');
    expect(resultAction({ proposal: p, iConfirmed: false, iPlayed: false, open: true })).toBe('watch');
    expect(resultAction({ proposal: null, iConfirmed: false, iPlayed: true, open: true })).toBe('log');
    expect(resultAction({ proposal: p, iConfirmed: true, iPlayed: true, open: true })).toBe('confirmed');
    expect(resultAction({ proposal: p, iConfirmed: false, iPlayed: true, open: true })).toBe('confirm');
  });
});

describe('moments', () => {
  it('writes the note and credits', () => {
    expect(momentsNote(8)).toBe('Only the 8 who played can add photos. Anyone can be untagged.');
    expect(photoCredit('Ade B', false)).toBe('Photo: Ade');
    expect(photoCredit(null, false)).toBe('Photo: a player');
    expect(photoCredit('Me', true)).toBe('Photo: you');
  });

  it('builds the storage path in your own folder', () => {
    expect(momentPath('act', 'me', 'id', 'JPEG')).toBe('act/me/id.jpg');
    expect(momentPath('act', 'me', 'id', 'png')).toBe('act/me/id.png');
    expect(momentPath('act', 'me', 'id', '..')).toBe('act/me/id.jpg');
  });

  it('reads the file type', () => {
    expect(photoExtension('image/png')).toBe('png');
    expect(photoExtension(null, 'IMG_1.HEIC')).toBe('heic');
    expect(photoExtension('application/octet-stream', 'x.gif')).toBe('jpg');
    expect(photoExtension(undefined)).toBe('jpg');
    expect(contentType('jpg')).toBe('image/jpeg');
    expect(contentType('webp')).toBe('image/webp');
  });

  it('requires alt text', () => {
    expect(altTextError('  ')).toMatch(/few words/);
    expect(altTextError('Team photo under the floodlights')).toBeNull();
    expect(altTextError('x'.repeat(201))).toMatch(/200/);
  });
});
