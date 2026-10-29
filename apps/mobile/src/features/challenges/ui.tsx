/**
 * Small pieces shared by the Call-Out screens: a form field with its label and error, the day and
 * time chips (composer and counter), and a rules row.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Chip, ChipRow, Text } from '@/design-system';

import { InlineError } from '../profile/states';
import { dayChoices, timeChoicesFor } from './logic';

export function Field({
  label,
  error,
  hint,
  children,
  testID,
}: {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  children: ReactNode;
  testID?: string;
}) {
  return (
    <View className="gap-space-2" role="group" aria-label={label} testID={testID}>
      <Text variant="label">{label}</Text>
      {hint ? (
        <Text variant="caption" muted>
          {hint}
        </Text>
      ) : null}
      {children}
      {error ? <InlineError message={error} testID={`${testID ?? 'field'}-error`} /> : null}
    </View>
  );
}

/** Day chips, then the times still possible that day (at least an hour out). */
export function WhenChips({
  dayOffset,
  minuteOfDay,
  onChange,
  now,
  timeZone,
  testID,
}: {
  dayOffset: number;
  minuteOfDay: number | null;
  onChange: (v: { dayOffset: number; minuteOfDay: number | null }) => void;
  now: Date;
  timeZone: string;
  testID: string;
}) {
  const days = dayChoices(now, timeZone);
  const times = timeChoicesFor(dayOffset, now, timeZone);
  return (
    <>
      <ChipRow label="Day">
        {days.map((d) => (
          <Chip
            key={d.offset}
            selected={dayOffset === d.offset}
            onPress={() =>
              onChange({
                dayOffset: d.offset,
                minuteOfDay: minuteOfDay !== null && timeChoicesFor(d.offset, now, timeZone).some((t) => t.minute === minuteOfDay) ? minuteOfDay : null,
              })
            }
            testID={`${testID}-day-${d.offset}`}
          >
            {d.label}
          </Chip>
        ))}
      </ChipRow>
      {times.length > 0 ? (
        <ChipRow label="Start time">
          {times.map((t) => (
            <Chip
              key={t.minute}
              selected={minuteOfDay === t.minute}
              onPress={() => onChange({ dayOffset, minuteOfDay: t.minute })}
              testID={`${testID}-time-${t.minute}`}
            >
              {t.label}
            </Chip>
          ))}
        </ChipRow>
      ) : (
        <Text variant="body-sm">Too late to start today. Pick tomorrow or later.</Text>
      )}
    </>
  );
}

/** One row of THE RULES: a muted label left, the value right. */
export function RuleRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      className="flex-row justify-between gap-space-4 border-b border-line py-[14px]"
      accessible
      accessibilityLabel={`${label.toLowerCase()}: ${value}`}
      testID={`rule-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <Text variant="label" muted className="flex-none">
        {label}
      </Text>
      <Text variant="body-sm" className="shrink text-right">
        {value}
      </Text>
    </View>
  );
}
