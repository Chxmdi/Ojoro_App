import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Chip, Divider, Input, Modal, Sheet, Text, useToast } from '@/design-system';
import { overlayGate } from '@/design-system/components/Overlay.logic';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf, rpc } from '@/lib/rpc';

import { InlineError, useIsOnline } from '../profile/states';
import {
  blockCopy,
  firstName,
  REPORT_NOTE_MAX,
  REPORT_REASONS,
  subjectWord,
  validateReport,
  type ReportReason,
  type ReportSubjectKind,
} from './reasons';

/**
 * What a report or block is about. Keep this shape stable: plans, activities and profiles all
 * open the same sheet with it.
 */
export type ReportBlockTarget = {
  /** What is being reported (`report` RPC `p_subject_kind`). */
  subjectKind: ReportSubjectKind;
  /** Its id: the user id for a profile, the plan id, the activity id… */
  subjectId: string;
  /** The person it's about, as shown on screen ("Ade B"). Used in the sheet and the block button. */
  personName: string;
  /**
   * The person to block. Defaults to `subjectId` for a profile. Leave out on a plan or game
   * without one person (the sheet then offers report only).
   */
  personId?: string | undefined;
};

export type ReportBlockSheetProps = ReportBlockTarget & {
  visible: boolean;
  onClose: () => void;
  /** After a block succeeded (e.g. leave the profile; everything is refetched already). */
  onBlocked?: ((personId: string) => void) | undefined;
};

type Step = 'report' | 'sent' | 'confirm-block';

/** Waits until no Sheet or Modal holds the screen, so the block confirmation never stacks. */
function useNoOverlay(): boolean {
  const [free, setFree] = useState(() => overlayGate.active() === null);
  useEffect(() => {
    const update = () => setFree(overlayGate.active() === null);
    update();
    return overlayGate.subscribe(update);
  }, []);
  return free;
}

/**
 * Report and block, from every profile, plan, game and chat (CLAUDE.md). Report: pick a reason,
 * add a note, send (`report`). Block: a Modal confirm, because it is socially costly
 * (`block_user`). Not designed (HANDOFF.md, "What isn't designed yet"): built from Sheet, Chip,
 * Input, Modal and the OnboardPrivacy wording.
 */
export function ReportBlockSheet({
  visible,
  onClose,
  onBlocked,
  subjectKind,
  subjectId,
  personName,
  personId: personIdProp,
}: ReportBlockSheetProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const online = useIsOnline();
  const noOverlay = useNoOverlay();
  const personId = personIdProp ?? (subjectKind === 'profile' ? subjectId : undefined);
  const first = firstName(personName);
  const what = subjectWord(subjectKind);

  const [step, setStep] = useState<Step>('report');
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Each opening starts clean.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setStep('report');
      setReason(null);
      setNote('');
      setError(null);
      track('report_sheet_opened', { subject_kind: subjectKind });
    }
  }

  const report = useMutation({
    mutationFn: (args: { reason: ReportReason; note: string | null }) =>
      rpc('report', {
        p_subject_kind: subjectKind,
        p_subject_id: subjectId,
        p_reason: args.reason,
        ...(args.note ? { p_note: args.note } : {}),
      }),
    onSuccess: (_id, args) => {
      track('report_sent', { subject_kind: subjectKind, reason: args.reason });
    },
  });

  const block = useMutation({
    mutationFn: (id: string) => rpc('block_user', { p_user_id: id }),
    onSuccess: (_changed, id) => {
      track('user_blocked', { subject_kind: subjectKind });
      // A block hides both people from each other everywhere: every cached read may change.
      void queryClient.invalidateQueries();
      toast.show({ kind: 'success', message: `Blocked ${first}. You won't see each other on Ojoro.` });
      onBlocked?.(id);
    },
    onError: (thrown) => {
      toast.show({ kind: 'error', message: errorMessage(ojoroErrorOf(thrown)) });
    },
  });

  const send = () => {
    const checked = validateReport({ reason, note });
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setError(null);
    if (!online) {
      // Paused by TanStack Query while offline; it sends itself when the connection is back.
      report.mutate({ reason: checked.reason, note: checked.note });
      toast.show({ kind: 'offline', message: "You're offline. The report sends when you're back." });
      onClose();
      return;
    }
    report.mutate(
      { reason: checked.reason, note: checked.note },
      {
        onSuccess: () => setStep('sent'),
        onError: (thrown) => setError(errorMessage(ojoroErrorOf(thrown))),
      },
    );
  };

  const confirmBlock = () => {
    if (!personId) return;
    setStep('sent');
    onClose();
    block.mutate(personId);
    if (!online) {
      toast.show({ kind: 'offline', message: `You're offline. ${first} is blocked when you're back.` });
    }
  };

  const blockButton = personId ? (
    <Button
      variant="secondary"
      block
      onPress={() => setStep('confirm-block')}
      testID="report-block-block"
      accessibilityHint={`Asks before blocking ${first}`}
    >
      {`BLOCK ${first.toUpperCase()}`}
    </Button>
  ) : null;

  const sheetVisible = visible && step !== 'confirm-block';
  // Open the confirmation only once the sheet has left the screen; then keep it until answered.
  const [modalOpen, setModalOpen] = useState(false);
  const wantModal = visible && step === 'confirm-block';
  if (!wantModal && modalOpen) setModalOpen(false);
  if (wantModal && !modalOpen && noOverlay) setModalOpen(true);
  const copy = blockCopy(personName);

  return (
    <>
      <Sheet
        visible={sheetVisible}
        onClose={onClose}
        title={step === 'sent' ? 'Report sent' : `Report this ${what}`}
        actions={
          step === 'sent' ? (
            <View className="gap-space-2">
              {blockButton}
              <Button variant="ghost" block onPress={onClose} testID="report-block-done">
                DONE
              </Button>
            </View>
          ) : (
            <View className="gap-space-2">
              <Button
                block
                onPress={send}
                loading={report.isPending && online}
                testID="report-block-send"
              >
                SEND REPORT
              </Button>
              {blockButton}
            </View>
          )
        }
      >
        {step === 'sent' ? (
          <View className="gap-space-3" testID="report-block-sent">
            <Text variant="body">
              {`Thanks. Your report is kept with this ${what}. ${first} isn't told who sent it.`}
            </Text>
            {personId ? (
              <Text variant="body-sm" muted>
                {`If you don't want to see ${first} again, you can block them too.`}
              </Text>
            ) : null}
          </View>
        ) : (
          <View className="gap-space-4">
            <Text variant="body-sm" muted>
              {`Reports are private. ${first} isn't told who sent it.`}
            </Text>
            <View className="gap-space-2">
              <Divider label="WHAT HAPPENED?" />
              <View
                role="radiogroup"
                aria-label="What happened"
                className="flex-row flex-wrap gap-space-2"
              >
                {REPORT_REASONS.map((r) => (
                  <Chip
                    key={r.value}
                    selected={reason === r.value}
                    onPress={() => {
                      setReason(r.value);
                      setError(null);
                    }}
                    testID={`report-reason-${r.value}`}
                  >
                    {r.label}
                  </Chip>
                ))}
              </View>
            </View>
            <Input
              label={reason === 'other' ? 'What happened' : 'Anything else (optional)'}
              multiline
              value={note}
              onChangeText={setNote}
              maxLength={REPORT_NOTE_MAX + 50}
              hint="Only Ojoro sees this."
              testID="report-note"
            />
            {error ? <InlineError message={error} testID="report-error" /> : null}
            {personId ? (
              <Text variant="caption" muted>
                Blocking hides you from each other everywhere, at once.
              </Text>
            ) : null}
          </View>
        )}
      </Sheet>
      <Modal
        visible={modalOpen}
        title={copy.title}
        body={copy.body}
        confirm={copy.confirm}
        cancel="NOT NOW"
        onConfirm={confirmBlock}
        onCancel={() => setStep(report.isSuccess ? 'sent' : 'report')}
      />
    </>
  );
}
