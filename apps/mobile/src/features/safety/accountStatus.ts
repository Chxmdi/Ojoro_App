import {
  PAUSED_HEADLINE,
  appealMessageError,
  appealStatusLabel,
  pausedReason,
  pausedUntil,
  type AccountStatus,
  type MissedGame,
} from '@ojoro/contracts';

/**
 * Words for the paused screen and the show-up appeal (docs/TRUST_CONTRACT.md, "App surfaces").
 * Pure: the screens only lay these out.
 */
export type PausedView = {
  headline: string;
  until: string;
  reason: string;
  /** Words from Ojoro staff, shown as they wrote them. */
  note: string | null;
  /** What happened to the appeal, or null when there isn't one. */
  appealLine: string | null;
  canAppeal: boolean;
};

export function pausedView(status: AccountStatus): PausedView | null {
  if (!status.paused || !status.pause) return null;
  return {
    headline: PAUSED_HEADLINE.toUpperCase(),
    until: pausedUntil(status.pause.ends_at),
    reason: pausedReason(status.pause.reason),
    note: status.pause.note_to_user,
    appealLine: status.appeal ? appealStatusLabel(status.appeal.status) : null,
    canAppeal: status.can_appeal,
  };
}

/** True for the error any call returns while the account is paused. */
export function isPausedCode(code: string | null | undefined): boolean {
  return code === 'account_paused';
}

const DAY = new Intl.DateTimeFormat('en-CA', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'America/Toronto',
});

/** "Football · Sat 24 Oct · Parc Jarry" for a game counted as missed. */
export function missedGameLabel(game: MissedGame, sportName?: string): string {
  const sport =
    sportName ?? game.sport_id.charAt(0).toUpperCase() + game.sport_id.slice(1).replace(/_/g, ' ');
  const parts = DAY.formatToParts(new Date(game.starts_at));
  const part = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? '';
  const when = `${part('weekday')} ${part('day')} ${part('month')}`.replace(/\./g, '');
  return [sport, when, game.place_name].filter(Boolean).join(' · ');
}

/** Games you can still appeal (no appeal yet, or one that was decided and can be asked again). */
export function appealableGames(games: readonly MissedGame[]): MissedGame[] {
  return games.filter((g) => g.appeal_status !== 'open');
}

/** Words for an appeal message problem, or null. */
export function appealMessageProblem(message: string): string | null {
  const problem = appealMessageError(message);
  if (problem === 'empty') return 'Say what happened.';
  if (problem === 'too_long') return 'Keep it under 1000 characters.';
  return null;
}
