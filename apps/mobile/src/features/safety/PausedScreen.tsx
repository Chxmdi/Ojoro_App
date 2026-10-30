import type { AccountStatus } from '@ojoro/contracts';
import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { Button, DisplayText, Divider, Situation, Text, TextButton } from '@/design-system';
import { track } from '@/lib/analytics';
import { signOutWithPush } from '@/lib/push';

import { pausedView } from './accountStatus';
import { AppealSheet } from './AppealSheet';
import { useAccountStatus } from './useAccountStatus';

/**
 * "This account is paused" (docs/TRUST_CONTRACT.md "Paused accounts"). Not designed (HANDOFF.md, "What
 * isn't designed yet"): the calm ground, one display line, the reason and the end in words, the
 * note from Ojoro, then APPEAL (or where the appeal is) and SIGN OUT. Status is words, never colour.
 */
export function PausedScreen({ status }: { status: AccountStatus }) {
  const view = pausedView(status);
  const [appealing, setAppealing] = useState(false);

  useEffect(() => {
    track('paused_screen_viewed', { has_end: status.pause?.ends_at != null });
  }, [status.pause?.ends_at]);

  if (!view || !status.pause) return null;
  return (
    <Situation id="calm" className="flex-1" testID="paused-screen">
      <ScrollView contentContainerClassName="flex-grow justify-center gap-space-5 px-space-5 py-space-7">
        <DisplayText size="md">{view.headline}</DisplayText>
        <View className="gap-space-2">
          <Text variant="body">{view.reason}</Text>
          <Text variant="body">{view.until}</Text>
          <Text variant="body-sm" muted>
            {
              "While it's paused, people can't see you and you can't post, join or message. Nothing is deleted."
            }
          </Text>
        </View>
        {view.note ? (
          <View className="gap-space-2">
            <Divider label="FROM OJORO" />
            <Text variant="body">{view.note}</Text>
          </View>
        ) : null}
        {view.appealLine ? (
          <View className="gap-space-2">
            <Divider label="YOUR APPEAL" />
            <Text variant="body" testID="paused-appeal-status">
              {view.appealLine}
            </Text>
            {status.appeal?.decision_note ? (
              <Text variant="body-sm" muted>
                {status.appeal.decision_note}
              </Text>
            ) : null}
          </View>
        ) : null}
        <View className="gap-space-2">
          {view.canAppeal ? (
            <Button
              block
              onPress={() => {
                track('appeal_opened', { kind: 'account_pause' });
                setAppealing(true);
              }}
              testID="paused-appeal"
            >
              APPEAL
            </Button>
          ) : null}
          <TextButton onPress={() => void signOutWithPush()}>SIGN OUT</TextButton>
        </View>
      </ScrollView>
      <AppealSheet
        visible={appealing}
        onClose={() => setAppealing(false)}
        kind="account_pause"
        subjectId={status.pause.id}
        title="Appeal the pause"
        intro="Tell us what we got wrong. Someone at Ojoro reads it and answers here."
      />
    </Situation>
  );
}

/**
 * Shows the paused screen instead of the app while the signed-in account is paused. Everything else
 * renders as before (signed out, onboarding, loading, offline with no status yet).
 */
export function PausedGate({ children }: { children: ReactNode }) {
  const status = useAccountStatus();
  if (status.data?.paused) return <PausedScreen status={status.data} />;
  return <>{children}</>;
}
