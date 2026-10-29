/**
 * Verifying (design-handoff/screens/Verifying.png, after situation): FINISHED · 9:23 AM; VERIFYING.;
 * the submitted numbers marked NOT FINAL; a checklist of each confirmation; CONFIRM BOTH TIMES /
 * REQUEST A CORRECTION. Disputed is the same screen paused (ON HOLD.): the correction, who asked,
 * and how it is settled.
 *
 * Until device data (PRD M10) the checks are the two captains' confirmations only (HANDOFF: "Until
 * then, participant confirmation"), so the GPS row of the design is left out. Nobody is called the
 * winner here. The numbers are for competitors and organizers only; everyone else sees that the
 * result is being checked.
 */
import { isRetryable } from '@ojoro/contracts';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Button, DisplayText, Icon, Input, Modal, Screen, Sheet, Text } from '@/design-system';
import { useReportBlock } from '@/features/safety';
import { errorMessage } from '@/lib/errorMessages';
import { newIdempotencyKey } from '@/lib/idempotency';
import { ojoroErrorOf } from '@/lib/rpc';

import { useOnline } from '../activities/data';
import { clockWithPeriod, firstName } from '../activities/format';
import { InlineError, LoadingState, OfflineNote } from '../activities/ui';
import { useEvent, type EventView } from './data';
import { eventReportTarget, ResultSheet, StageFallback, StageHeader, stageFacts } from './EventLiveScreen';
import {
  useConfirmResult,
  useRequestCorrection,
  useVerification,
  useWithdrawCorrection,
  type Verification,
} from './liveData';
import {
  autoConfirmLine,
  checkRow,
  confirmLabel,
  CORRECTION_NOTE,
  CORRECTION_NOTE_MAX,
  readChecks,
  showValue,
  sideName,
  verifyingIntro,
  type StageFacts,
} from './liveLogic';

export function VerifyingScreen({ eventId }: { eventId: string }) {
  const event = useEvent(eventId);
  const data = event.data ?? null;
  if (!data) return <StageFallback query={event} situation="after" label="Loading the result" />;
  return <VerifyingBody eventId={eventId} row={data.row} dataUpdatedAt={event.dataUpdatedAt} />;
}

function VerifyingBody({ eventId, row, dataUpdatedAt }: { eventId: string; row: EventView; dataUpdatedAt: number }) {
  const f = stageFacts(row);
  const online = useOnline();
  const reportBlock = useReportBlock();
  const insider = !!row.is_competitor || !!row.is_organizer;
  const verification = useVerification(eventId, insider);
  const v = verification.data ?? null;
  const disputed = row.stage === 'disputed' || !!v?.correction_open;
  const tz = row.time_zone ?? undefined;
  const finished = row.ended_at ? `FINISHED · ${clockWithPeriod(row.ended_at, tz)}` : 'FINISHED';
  const intro = verifyingIntro({
    disputed,
    competitor: !!row.is_competitor,
    requestedBy: v?.correction_requested_by_name ?? null,
    isMe: false,
  });

  return (
    <Screen situation="after" scroll gutter={false}>
      <StageHeader overline={finished} onMore={() => reportBlock.open(eventReportTarget(row))} />
      <View className="gap-space-8 px-space-5 pb-space-10 pt-space-6" testID={disputed ? 'event-disputed' : 'event-verifying'}>
        <View className="gap-space-4">
          <DisplayText size="xl" accessibilityRole="header" testID="verifying-headline">
            {intro.headline}
          </DisplayText>
          <Text variant="body">{intro.body}</Text>
        </View>

        {!online ? <OfflineNote dataUpdatedAt={dataUpdatedAt} extra="Confirming waits until you're back." /> : null}

        {!insider ? (
          <View className="gap-space-2" testID="verifying-watcher">
            <Text variant="body" muted>
              {`The result shows here once ${sideName(f, 'a')} and ${sideName(f, 'b')} have both confirmed it.`}
            </Text>
            <Text variant="caption" muted>
              Submitted numbers stay with the competitors until they are final.
            </Text>
          </View>
        ) : verification.isPending ? (
          <LoadingState label="Loading the checks" kinds={['object', 'strip', 'strip']} />
        ) : verification.isError && !v ? (
          <InlineError
            message={errorMessage(ojoroErrorOf(verification.error))}
            action="RETRY"
            onAction={() => void verification.refetch()}
            testID="verifying-error"
          />
        ) : !v || !v.submission_id ? (
          <NoSubmission eventId={eventId} row={row} f={f} online={online} />
        ) : (
          <Checks eventId={eventId} row={row} f={f} v={v} online={online} disputed={disputed} />
        )}
      </View>
      {reportBlock.sheet}
    </Screen>
  );
}

/** Verifying with nothing pending (a correction cleared it): a captain sends the numbers again. */
function NoSubmission({ eventId, row, f, online }: { eventId: string; row: EventView; f: StageFacts; online: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <View className="gap-space-4" testID="verifying-empty">
      <Text variant="body">No numbers are waiting. A captain sends them, and the other side confirms.</Text>
      {row.is_captain ? (
        <Button block onPress={() => setOpen(true)} disabled={!online} testID="verifying-send">
          SEND THE RESULT
        </Button>
      ) : null}
      <ResultSheet visible={open} onClose={() => setOpen(false)} eventId={eventId} f={f} />
    </View>
  );
}

function Checks({
  eventId,
  row,
  f,
  v,
  online,
  disputed,
}: {
  eventId: string;
  row: EventView;
  f: StageFacts;
  v: Verification;
  online: boolean;
  disputed: boolean;
}) {
  const confirm = useConfirmResult(eventId);
  const correction = useRequestCorrection(eventId);
  const withdraw = useWithdrawCorrection(eventId);
  const [sheet, setSheet] = useState<'correction' | 'resend' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const key = useRef<string | null>(null);
  const checks = readChecks(v.checks);
  const captain = !!row.is_captain;
  const iRequested = disputed && checks.some((c) => c.is_me) && v.correction_requested_by_name !== null &&
    checks.find((c) => c.is_me)?.name === v.correction_requested_by_name;
  const tz = row.time_zone ?? undefined;
  const otherCheck = checks.find((c) => !c.is_me && !c.done) ?? checks.find((c) => !c.is_me);
  const autoLine = disputed
    ? null
    : autoConfirmLine(v.auto_confirms_at ?? null, tz, {
        iNeedToConfirm: !!v.i_need_to_confirm,
        other: otherCheck ? firstName(otherCheck.name) : null,
      });

  useEffect(() => {
    // A new submission is a new intention.
    key.current = null;
  }, [v.submission_id]);

  const doConfirm = () => {
    if (!v.submission_id) return;
    key.current ??= newIdempotencyKey();
    confirm.mutate(
      { submissionId: v.submission_id, key: key.current },
      {
        onSuccess: () => {
          key.current = null;
        },
        onError: (e) => {
          if (!isRetryable(ojoroErrorOf(e))) key.current = null;
        },
      },
    );
  };

  return (
    <View className="gap-space-8">
      <View className="gap-space-4 bg-surface-raised p-space-5" testID="verifying-submitted" role="region" aria-label="Submitted, not final">
        <Text variant="label">{disputed ? 'SUBMITTED · ON HOLD' : 'SUBMITTED · NOT FINAL'}</Text>
        <View className="flex-row items-end justify-between gap-space-4">
          <View accessible accessibilityLabel={`${sideName(f, 'a')}, ${showValue(v.a_value, f.scoring)}, not final`}>
            <Text variant="label">{sideName(f, 'a').toUpperCase()}</Text>
            <DisplayText size="md" style={{ fontVariant: ['tabular-nums'] }} testID="verifying-a">
              {showValue(v.a_value, f.scoring)}
            </DisplayText>
          </View>
          <View
            className="items-end"
            accessible
            accessibilityLabel={`${sideName(f, 'b')}, ${showValue(v.b_value, f.scoring)}, not final`}
          >
            <Text variant="label">{sideName(f, 'b').toUpperCase()}</Text>
            <DisplayText size="md" style={{ fontVariant: ['tabular-nums'] }} testID="verifying-b">
              {showValue(v.b_value, f.scoring)}
            </DisplayText>
          </View>
        </View>
        {v.submitted_by_name ? (
          <Text variant="caption" muted>
            {`Sent by ${firstName(v.submitted_by_name)}${v.submitted_at ? ` at ${clockWithPeriod(v.submitted_at, tz)}` : ''}.`}
          </Text>
        ) : null}
      </View>

      {autoLine ? (
        <View className="flex-row items-start gap-space-2" testID="verifying-auto-confirm">
          <Icon name="clock" size={20} />
          <Text variant="body-sm" className="flex-1" style={{ fontVariant: ['tabular-nums'] }}>
            {autoLine}
          </Text>
        </View>
      ) : null}

      <View testID="verifying-checks" role="list">
        {checks.map((c) => {
          const r = checkRow(c, f.scoring);
          return (
            <View
              key={c.user_id}
              role="listitem"
              className="min-h-touch flex-row items-center gap-space-3 border-b border-line py-space-4"
              accessible
              accessibilityLabel={`${r.text}, ${r.status.toLowerCase()}`}
              testID={`check-${c.is_me ? 'me' : 'them'}`}
            >
              <Icon name={c.done ? 'check' : 'clock'} size={24} />
              <Text variant="body" className="flex-1">
                {r.text}
              </Text>
              <Text variant="label">{r.status}</Text>
            </View>
          );
        })}
      </View>

      {disputed ? (
        <View className="gap-space-3 border-l-4 border-text py-space-1 pl-space-3" testID="verifying-correction" accessibilityLiveRegion="polite">
          <View className="flex-row items-start gap-space-2">
            <Icon name="alert" size={20} label="On hold" />
            <Text variant="body" className="flex-1">
              {v.correction_note ? `The correction: “${v.correction_note}”` : 'No note came with the correction.'}
            </Text>
          </View>
          <Text variant="body-sm" muted>
            {v.review_due_at
              ? `Either of you can send corrected numbers. Otherwise an organizer reviews it by ${clockWithPeriod(v.review_due_at, tz)} tomorrow.`
              : 'Either of you can send corrected numbers. Otherwise an organizer reviews it within 24 hours.'}
          </Text>
        </View>
      ) : null}

      {captain ? (
        <View className="gap-space-3" testID="verifying-actions">
          {!disputed && v.i_need_to_confirm ? (
            <Button block onPress={() => setConfirming(true)} loading={confirm.isPending} disabled={!online} testID="verifying-confirm">
              {confirmLabel(f.scoring)}
            </Button>
          ) : null}
          {disputed ? (
            <>
              <Button block onPress={() => setSheet('resend')} disabled={!online} testID="verifying-resend">
                SEND CORRECTED NUMBERS
              </Button>
              {iRequested ? (
                <Button
                  block
                  variant="secondary"
                  onPress={() => withdraw.mutate()}
                  loading={withdraw.isPending}
                  disabled={!online}
                  testID="verifying-withdraw"
                >
                  WITHDRAW THE CORRECTION
                </Button>
              ) : null}
            </>
          ) : (
            <Button
              block
              variant="secondary"
              onPress={() => setSheet('correction')}
              disabled={!online}
              testID="verifying-correct"
            >
              REQUEST A CORRECTION
            </Button>
          )}
          {!disputed ? (
            <Text variant="caption" muted className="text-center">
              {CORRECTION_NOTE}
            </Text>
          ) : null}
          {!disputed && !v.i_need_to_confirm ? (
            <Text variant="body-sm" muted testID="verifying-waiting">
              You've confirmed. Waiting for the other side.
            </Text>
          ) : null}
          {[confirm, withdraw].map((m, i) =>
            m.isError ? <InlineError key={i} message={errorMessage(ojoroErrorOf(m.error))} testID="verifying-action-error" /> : null,
          )}
        </View>
      ) : (
        <Text variant="body-sm" muted>
          The captains confirm the result. You'll see it here once it is final.
        </Text>
      )}

      <Modal
        visible={confirming}
        title={`${confirmLabel(f.scoring)}?`}
        body={`${sideName(f, 'a')} ${showValue(v.a_value, f.scoring)}, ${sideName(f, 'b')} ${showValue(v.b_value, f.scoring)}. Once both of you confirm, the result is final and can't be changed.`}
        confirm="CONFIRM"
        cancel="NOT YET"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          doConfirm();
        }}
      />
      <CorrectionSheet
        visible={sheet === 'correction'}
        onClose={() => setSheet(null)}
        loading={correction.isPending}
        error={correction.isError ? errorMessage(ojoroErrorOf(correction.error)) : undefined}
        onSend={(note) => correction.mutate(note, { onSuccess: () => setSheet(null) })}
        onOpen={() => correction.reset()}
      />
      <ResultSheet visible={sheet === 'resend'} onClose={() => setSheet(null)} eventId={eventId} f={f} />
    </View>
  );
}

/** REQUEST A CORRECTION: what's wrong, in a line (optional). Pauses the result. */
function CorrectionSheet({
  visible,
  onClose,
  onSend,
  onOpen,
  loading,
  error,
}: {
  visible: boolean;
  onClose: () => void;
  onSend: (note: string | null) => void;
  onOpen: () => void;
  loading: boolean;
  error: string | undefined;
}) {
  const [note, setNote] = useState('');
  const [invalid, setInvalid] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (visible) {
      setInvalid(undefined);
      onOpen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clear on open only.
  }, [visible]);
  const send = () => {
    const t = note.trim();
    if (t.length > CORRECTION_NOTE_MAX) {
      setInvalid(`Keep it to ${CORRECTION_NOTE_MAX} characters.`);
      return;
    }
    onSend(t || null);
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Request a correction"
      actions={
        <Button block loading={loading} onPress={send} testID="correction-send">
          REQUEST A CORRECTION
        </Button>
      }
    >
      <View className="gap-space-4 pb-space-3">
        <Input
          label="What's wrong (optional)"
          value={note}
          onChangeText={(t) => {
            setNote(t);
            if (invalid) setInvalid(undefined);
          }}
          multiline
          maxLength={CORRECTION_NOTE_MAX + 20}
          placeholder="My time was 23:12, not 23:31."
          hint={`${note.trim().length} of ${CORRECTION_NOTE_MAX}. Both of you see it.`}
          error={invalid}
          testID="correction-note"
        />
        <Text variant="caption" muted>
          {CORRECTION_NOTE}
        </Text>
        {error ? <InlineError message={error} testID="correction-error" /> : null}
      </View>
    </Sheet>
  );
}
