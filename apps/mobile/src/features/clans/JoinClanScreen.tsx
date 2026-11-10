import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Input, Screen, Text } from '@/design-system';
import { ScreenHeader } from '@/features/activities/ui';
import { normalizeCode } from '@/features/crews/logic';
import { useIsOnline } from '@/features/profile/states';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf, rpc } from '@/lib/rpc';

import { clanKeys } from './data';

/** JOIN with an invite code: set-to-state on the server, safe to repeat (already in → opens the clan). */
export function useJoinClanWithCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const state = await rpc('join_clan_with_code', { p_code: code });
      if (!state.clan_id) throw new Error('no clan');
      return state.clan_id;
    },
    onSuccess: (clanId) => {
      track('cta_tapped', { cta: 'clan_join_code', clan_id: clanId });
      void qc.invalidateQueries({ queryKey: clanKeys.all(clanId) });
      void qc.invalidateQueries({ queryKey: clanKeys.mine });
    },
  });
}

/**
 * `/clan/join/<code>` (the INVITE link, `ojoro://clan/join/<code>`, features/clans/logic.ts). Undesigned,
 * like Join a crew: the code from the link filled in and one JOIN THE CLAN button, so opening a link never
 * joins without a tap. Joining opens the clan.
 */
export function JoinClanScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const online = useIsOnline();
  const join = useJoinClanWithCode();
  const [code, setCode] = useState((params.code ?? '').toUpperCase());
  const [error, setError] = useState<string | undefined>(undefined);

  const submit = () => {
    const valid = normalizeCode(code);
    if (!valid.ok) {
      setError(valid.error);
      return;
    }
    setError(undefined);
    join.mutate(valid.code, {
      onSuccess: (clanId) => router.replace(`/clan/${clanId}` as Href),
      onError: (e) => setError(errorMessage(ojoroErrorOf(e))),
    });
  };

  return (
    <Screen situation="calm" scroll gutter={false}>
      <ScreenHeader overline="JOIN A CLAN" fallback={'/you' as Href} />
      <View className="gap-space-6 px-space-5 pb-space-10 pt-space-4" testID="clan-join">
        <Text variant="body-sm" muted>
          {"You were sent this clan's invite code. Join to see its runs and leaderboard."}
        </Text>
        <Input
          label="Invite code"
          value={code}
          onChangeText={(t) => {
            setCode(t.toUpperCase());
            if (error) setError(undefined);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={12}
          placeholder="ABCD2345"
          error={error}
          testID="clan-code-input"
          onSubmitEditing={submit}
        />
        <Button block loading={join.isPending} disabled={!online} onPress={submit} testID="clan-join-submit">
          JOIN THE CLAN
        </Button>
        {!online ? (
          <Text variant="caption" muted>
            Offline. Joining needs a connection.
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}
