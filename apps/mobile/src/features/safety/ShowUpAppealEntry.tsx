import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Text, TextButton } from '@/design-system';
import { track } from '@/lib/analytics';

import { appealableGames, missedGameLabel } from './accountStatus';
import { AppealSheet } from './AppealSheet';
import { useMissedGames } from './useAccountStatus';

/**
 * Under your own reputation: "Something wrong with your record?" when at least one game counts as
 * missed (docs/TRUST_CONTRACT.md "Appeals", show_up). Nothing otherwise.
 */
export function ShowUpAppealEntry() {
  const missed = useMissedGames();
  const games = useMemo(() => appealableGames(missed.data ?? []), [missed.data]);
  const [open, setOpen] = useState(false);
  if (games.length === 0) return null;
  const count = games.length === 1 ? '1 game counts' : `${games.length} games count`;
  return (
    <View className="gap-space-1" testID="show-up-appeal-entry">
      <Text variant="caption" muted>
        {`${count} as missed. Something wrong with your record?`}
      </Text>
      <TextButton
        onPress={() => {
          track('appeal_opened', { kind: 'show_up' });
          setOpen(true);
        }}
        accessibilityLabel="Ask Ojoro to look at a missed game"
      >
        ASK US TO LOOK
      </TextButton>
      <AppealSheet
        visible={open}
        onClose={() => setOpen(false)}
        kind="show_up"
        choices={games.map((g) => ({ id: g.activity_id, label: missedGameLabel(g) }))}
        title="Look at a missed game"
        intro="Pick the game and say what happened. If you were there, we count it."
      />
    </View>
  );
}
