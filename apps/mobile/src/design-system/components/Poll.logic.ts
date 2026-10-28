/**
 * Pure rules for `Poll` (`function Poll` and `.oj-poll*` in the web reference;
 * components/Poll.md). No React Native imports, so it runs in Node.
 */

export type PollOption = { label: string; votes: number };

export type PollRow = {
  label: string;
  /** Rounded share of all votes, 0–100 (web: `Math.round(votes / total * 100)`). */
  pct: number;
  /** Your vote: a check and a strong outline. Never shown once the poll is closed. */
  mine: boolean;
  /** "7:30, 67 percent, your vote". */
  accessibilityLabel: string;
};

export type PollModel = {
  /** `open` shows option buttons (a radio group); `results` shows fills and percentages (a list). */
  mode: 'open' | 'results';
  closed: boolean;
  total: number;
  rows: PollRow[];
  /** "6 votes", "1 vote", "0 votes". */
  votesLine: string;
  /** "Closes at 6:00" while open, "Closed" once closed, or null. */
  closesLine: string | null;
};

function count(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function pollModel({
  options,
  voted,
  closes,
  closed = false,
}: {
  options: readonly PollOption[];
  voted?: number | undefined;
  closes?: string | undefined;
  closed?: boolean | undefined;
}): PollModel {
  const total = options.reduce((sum, o) => sum + count(o.votes), 0);
  const hasVote = voted != null && voted >= 0 && voted < options.length;
  const mode = hasVote || closed ? 'results' : 'open';
  const rows = options.map((o, i) => {
    const pct = total ? Math.round((count(o.votes) / total) * 100) : 0;
    const mine = hasVote && !closed && voted === i;
    return {
      label: o.label,
      pct,
      mine,
      accessibilityLabel:
        mode === 'open' ? o.label : `${o.label}, ${pct} percent${mine ? ', your vote' : ''}`,
    };
  });
  return {
    mode,
    closed,
    total,
    rows,
    votesLine: `${total} ${total === 1 ? 'vote' : 'votes'}`,
    closesLine: closed ? 'Closed' : closes ? `Closes ${closes}` : null,
  };
}
