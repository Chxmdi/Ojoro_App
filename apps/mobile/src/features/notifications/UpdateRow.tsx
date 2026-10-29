/**
 * One Updates row (and Home's needs-you cards): a `NotificationRow` that links to its object and
 * carries at most one inline action. Actions that run here (I'M DOWN, CONFIRM) call the existing
 * RPC with an idempotency key, then `act_on_notification`; the others open the screen that does it.
 */
import type { NotificationRow as Row } from '@ojoro/contracts';
import { useRouter, type Href } from 'expo-router';

import { NotificationRow, useToast } from '@/design-system';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { useOnline } from '../plans/data';
import { useActOnNotification, useRowAction } from './data';
import { inlineAction, leadingFor, notificationTime, toneFor, type InlineAction } from './logic';

export type RowActions = ReturnType<typeof useRowActions>;

/** The action runner shared by the rows of one screen. A second tap on a row while its action runs is ignored. */
export function useRowActions(source: 'updates' | 'home') {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const rowAction = useRowAction();
  const act = useActOnNotification();

  const open = (row: Pick<Row, 'id' | 'type' | 'section' | 'href'>) => {
    track('notification_opened', { type: row.type, section: row.section, source });
    router.push(row.href as Href);
  };

  const run = (row: Row, a: InlineAction) => {
    track('notification_action_tapped', { type: row.type, action: a.action, source });
    if (a.kind === 'go') {
      router.push(a.href as Href);
      if (a.actsOnOpen) act.mutate(row.id);
      return;
    }
    const started = rowAction.tap(
      { id: row.id, action: a.action, planId: row.plan_id, activityId: row.activity_id },
      {
        onSuccess: () =>
          toast.show({
            kind: 'success',
            message: a.action === 'im_down' ? "You're in." : 'Score confirmed.',
          }),
        onError: (e) => toast.show({ kind: 'error', message: errorMessage(ojoroErrorOf(e)) }),
      },
    );
    if (!started) return;
    if (!online) {
      toast.show({
        kind: 'offline',
        message:
          a.action === 'im_down'
            ? "Offline. Your I'M DOWN goes through when you're back."
            : "Offline. Your confirmation goes through when you're back.",
      });
    }
  };

  return { run, open };
}

export function UpdateRow({
  row,
  now,
  timeZone,
  unread,
  actions,
}: {
  row: Row;
  now: Date;
  timeZone: string;
  unread: boolean;
  actions: RowActions;
}) {
  const lead = leadingFor(row);
  // The button stays while the action runs (a second tap is ignored): removing it would let the
  // second tap of a double tap land on the row and open the plan.
  const action = inlineAction(row);
  return (
    <NotificationRow
      testID={`update-${row.id}`}
      title={row.title ?? ''}
      body={row.body ?? undefined}
      time={notificationTime(row.updated_at, now, timeZone)}
      {...(lead.kind === 'icon' ? { icon: lead.icon } : lead.kind === 'graphic' ? { graphic: lead.graphic } : { person: { name: lead.name } })}
      tone={toneFor(row)}
      unread={unread}
      onPress={() => actions.open(row)}
      {...(action
        ? {
            action: action.label,
            actionVariant: action.kind === 'rpc' && action.primary ? ('primary' as const) : ('secondary' as const),
            onAction: () => actions.run(row, action),
          }
        : null)}
    />
  );
}
