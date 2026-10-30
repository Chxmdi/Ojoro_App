import { api, newKey } from '../api';
import { dateTime } from '../lib/format';
import type { WriteResult } from '../lib/types';
import type { ActionSpec } from './ActionDialog';

/** Pause confirmation, shared by the case and the person screens. One key per opened dialog. */
export function pauseSpec(a: {
  name: string;
  userId: string;
  caseId: string | null;
  defaultReasonCode: string;
  onDone: (message: string, result: WriteResult, reason: string) => void;
}): ActionSpec {
  const key = newKey();
  return {
    title: `Pause ${a.name}'s account?`,
    body: (
      <>
        They can't use Ojoro while it's paused, and they disappear for everyone else. Nothing is
        deleted; restoring brings everything back. They can appeal.
        {a.caseId ? " Pausing doesn't close this case." : ''}
      </>
    ),
    confirmLabel: 'Pause account',
    pause: { defaultReasonCode: a.defaultReasonCode },
    note: { label: 'Note to them (optional)', hint: 'They see this on the paused screen.' },
    run: async (v) => {
      const r = await api.pause(
        {
          userId: a.userId,
          reasonCode: v.reasonCode,
          reason: v.reason,
          noteToUser: v.note,
          endsAt: v.endsAt,
          caseId: a.caseId,
        },
        key,
      );
      a.onDone(
        v.endsAt ? `Paused until ${dateTime(v.endsAt)}.` : 'Paused until restored.',
        r,
        v.reason,
      );
    },
  };
}

export function restoreSpec(a: {
  name: string;
  userId: string;
  onDone: (message: string, result: WriteResult, reason: string) => void;
}): ActionSpec {
  const key = newKey();
  return {
    title: `Restore ${a.name}'s account?`,
    body: 'The pause ends now and everything they had comes back.',
    confirmLabel: 'Restore account',
    run: async (v) => {
      const r = await api.restoreAccount(a.userId, v.reason, key);
      a.onDone('Account restored.', r, v.reason);
    },
  };
}
