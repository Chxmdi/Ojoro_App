import { longAge, shortAge } from '../lib/format';
import { isWaitingLong, severityRank, severityWord, statusWord } from '../lib/moderation';
import { Icon } from './Icon';
import { Meter, Tag } from './kit';

export function SeverityTag({ severity }: { severity: string }) {
  const rank = severityRank(severity);
  return (
    <span className="row" style={{ gap: 'var(--space-2)', flexWrap: 'nowrap' }}>
      <Meter value={rank} />
      <span className={rank === 3 ? 'label' : 'label muted'}>{severityWord(severity)}</span>
    </span>
  );
}

export function StatusTag({ status }: { status: string }) {
  const tone = status === 'open' ? 'strong' : status === 'reviewing' ? 'plain' : 'quiet';
  const icon = status === 'actioned' || status === 'upheld' ? 'check' : status === 'dismissed' || status === 'denied' ? 'close' : status === 'reviewing' ? 'person' : 'clock';
  return (
    <Tag tone={tone} icon={icon}>
      {statusWord(status)}
    </Tag>
  );
}

/** Age of an open case; over 24 hours it gets a heavier rule and the word "waiting". */
export function AgeCell({ openedAt, status }: { openedAt: string; status: string }) {
  const long = isWaitingLong(openedAt, status);
  return (
    <span className="num" title={longAge(openedAt)}>
      {long ? (
        <Tag tone="strong" icon="clock">
          Waiting {shortAge(openedAt)}
        </Tag>
      ) : (
        <>
          <span aria-hidden="true">{shortAge(openedAt)}</span>
          <span className="sr-only">{longAge(openedAt)}</span>
        </>
      )}
    </span>
  );
}

export function HiddenTag() {
  return (
    <Tag tone="quiet">
      <Icon name="close" size={12} /> Hidden
    </Tag>
  );
}
