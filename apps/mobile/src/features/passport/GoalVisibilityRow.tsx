import type { PassportView, Visibility } from '@ojoro/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { View } from 'react-native';

import { Chip, Text, useToast } from '@/design-system';
import { track } from '@/lib/analytics';
import { useUserId } from '@/lib/auth';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { passportKeys, usePassportView, useSetGoalsVisibility } from './data';

const CHOICES: { value: Visibility; label: string }[] = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'friends', label: 'Friends' },
  { value: 'crews', label: 'My Crews' },
  { value: 'only_me', label: 'Just me' },
];

/**
 * Settings → Who sees what: your goal, on its own setting (PRD §9.1; default Friends), in the same
 * pattern as the other rows. Saves at once with `set_goals_visibility` (set-to-state).
 */
export function GoalVisibilityRow({ disabled }: { disabled?: boolean }) {
  const userId = useUserId();
  const qc = useQueryClient();
  const toast = useToast();
  const view = usePassportView(userId);
  const set = useSetGoalsVisibility(userId);
  const current = view.data?.goals_visibility ?? null;

  const choose = (value: Visibility) => {
    const key = passportKeys.view(userId);
    const before = qc.getQueryData<PassportView | null>(key);
    if (before) qc.setQueryData<PassportView>(key, { ...before, goals_visibility: value });
    set.mutate(value, {
      onSuccess: () => {
        track('visibility_changed', { part: 'goals', value });
        toast.show({ kind: 'success', message: 'Saved.' });
      },
      onError: (e) => {
        if (before) qc.setQueryData(key, before);
        toast.show({ kind: 'error', message: errorMessage(ojoroErrorOf(e)) });
      },
    });
  };

  return (
    <View className="border-t border-line pt-space-5" style={{ gap: 10 }} testID="privacy-goals">
      <Text variant="title-sm">Your goal</Text>
      <View role="radiogroup" aria-label="Goal visible to" className="flex-row flex-wrap gap-space-2">
        {CHOICES.map((choice) => (
          <Chip
            key={choice.value}
            selected={current === choice.value}
            disabled={(disabled ?? false) || !view.data}
            onPress={() => choose(choice.value)}
            testID={`privacy-goals-${choice.value}`}
          >
            {choice.label}
          </Chip>
        ))}
      </View>
    </View>
  );
}
