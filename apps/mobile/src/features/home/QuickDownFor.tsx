/**
 * SAY WHAT YOU'RE DOWN FOR (FirstHome; also Main when nobody near you is down): one tap creates
 * the Down For with the required defaults (the chip's window, it ends when the window ends, anyone
 * nearby, your distance). "One tap. It expires on its own." Something else opens the full sheet.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Chip, ChipRow, Divider, Text, useToast } from '@/design-system';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { useCreateDownFor } from '../downfor/data';
import { windowOptions } from '../downfor/logic';
import { routes } from '../plans/parts';
import { clockWithPeriod, DEFAULT_TIME_ZONE } from '../plans/time';
import { quickChips, type QuickChip } from './firstHomeLogic';

export function QuickDownFor({
  sports,
  downFor,
  radiusKm,
  onSomethingElse,
  source,
}: {
  /** Your sports first (main first), then the catalog. */
  sports: readonly { id: string; name: string }[];
  /** Sports you already have an active Down For in (their chip shows selected). */
  downFor: readonly string[];
  radiusKm: number | null | undefined;
  onSomethingElse: () => void;
  source: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const create = useCreateDownFor();
  const [now] = useState(() => new Date());
  const tz = DEFAULT_TIME_ZONE;
  const windows = windowOptions(now, tz);
  const chips = quickChips(sports, windows);
  const [pending, setPending] = useState<string | null>(null);

  const tap = (chip: QuickChip) => {
    if (downFor.includes(chip.sportId)) {
      toast.show({ kind: 'neutral', message: `You're already down for ${chip.label.toLowerCase()}. Withdraw it above to change it.` });
      return;
    }
    const at = new Date();
    const w = windowOptions(at, tz).find((x) => x.id === chip.windowId);
    if (!w) {
      onSomethingElse();
      return;
    }
    track('quick_down_for_tapped', { source, sport: chip.sportId, window: chip.windowId });
    setPending(chip.sportId);
    create.tap(
      {
        p_sport_id: chip.sportId,
        p_window_start: new Date(Math.max(Date.parse(w.start), at.getTime())).toISOString(),
        p_window_end: w.end,
        p_expires_at: w.end,
        p_audience: 'public',
        ...(radiusKm ? { p_radius_km: radiusKm } : null),
      },
      {
        onSuccess: (state) => {
          if (state.matched_plan_id) {
            toast.show({ kind: 'success', message: 'Ojoro matched you into a plan.' });
            router.push(routes.plan(state.matched_plan_id));
          } else {
            toast.show({
              kind: 'success',
              message: `You're down for ${chip.label.toLowerCase()} until ${clockWithPeriod(w.end, tz)}. It ends on its own.`,
            });
          }
        },
        onError: (e) => toast.show({ kind: 'error', message: errorMessage(ojoroErrorOf(e)) }),
        onSettled: () => setPending(null),
      },
    );
  };

  return (
    <View className="gap-space-3" role="region" aria-label="Say what you're down for" testID="quick-down-for">
      <Divider label="SAY WHAT YOU'RE DOWN FOR" />
      <Text variant="body-sm">One tap. It expires on its own, and Ojoro gathers people around it.</Text>
      <ChipRow label="Quick Down For" layout="wrap">
        {chips.map((c) => (
          <Chip
            key={c.sportId}
            selected={downFor.includes(c.sportId)}
            disabled={pending !== null && pending !== c.sportId}
            onPress={() => tap(c)}
            testID={`quick-${c.sportId}`}
          >
            {c.label}
          </Chip>
        ))}
        <Chip onPress={onSomethingElse} testID="down-for-something-else">
          Something else
        </Chip>
      </ChipRow>
    </View>
  );
}
