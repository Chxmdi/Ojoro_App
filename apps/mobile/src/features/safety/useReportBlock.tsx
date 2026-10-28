import { useCallback, useState, type ReactElement } from 'react';

import { ReportBlockSheet, type ReportBlockTarget } from './ReportBlockSheet';

export type UseReportBlock = {
  /** Opens the sheet for this subject and person. */
  open: (target: ReportBlockTarget) => void;
  close: () => void;
  /** Render this once in the screen (it is null until something has been opened). */
  sheet: ReactElement | null;
};

/**
 * The report/block sheet for a screen.
 *
 * ```tsx
 * const reportBlock = useReportBlock();
 * <IconButton icon="more" label="Report or block" onPress={() =>
 *   reportBlock.open({ subjectKind: 'plan', subjectId: plan.id, personName: host.name, personId: host.id })} />
 * {reportBlock.sheet}
 * ```
 */
export function useReportBlock(options?: { onBlocked?: (personId: string) => void }): UseReportBlock {
  const [target, setTarget] = useState<ReportBlockTarget | null>(null);
  const [visible, setVisible] = useState(false);
  const onBlocked = options?.onBlocked;

  const open = useCallback((next: ReportBlockTarget) => {
    setTarget(next);
    setVisible(true);
  }, []);
  const close = useCallback(() => setVisible(false), []);

  const sheet = target ? (
    <ReportBlockSheet {...target} visible={visible} onClose={close} onBlocked={onBlocked} />
  ) : null;

  return { open, close, sheet };
}
