import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Chip, Icon, Text } from '@/design-system';

import { PRIVACY_PARTS, type Privacy, type PrivacyPart, type Visibility } from './draft';

/**
 * Who sees what, per profile part (OnboardPrivacy.png), with the area-only and block/report notes.
 * Used by onboarding step 3 and by Settings → Privacy.
 */
export function PrivacyChoices({
  value,
  onChange,
  disabled,
  children,
}: {
  value: Privacy;
  onChange: (part: PrivacyPart, next: Visibility) => void;
  disabled?: boolean | undefined;
  /** More rows in the same pattern, after the parts (Settings adds who sees your goal). */
  children?: ReactNode;
}) {
  return (
    <View style={{ gap: 28 }}>
      {PRIVACY_PARTS.map((part) => (
        <View key={part.part} className="border-t border-line pt-space-5" style={{ gap: 10 }}>
          <Text variant="title-sm">{part.title}</Text>
          <View role="radiogroup" aria-label={part.group} className="flex-row flex-wrap gap-space-2">
            {part.choices.map((choice) => (
              <Chip
                key={choice.value}
                selected={value[part.part] === choice.value}
                disabled={disabled ?? false}
                onPress={() => onChange(part.part, choice.value)}
                testID={`privacy-${part.part}-${choice.value}`}
              >
                {choice.label}
              </Chip>
            ))}
          </View>
          {part.note ? (
            <Text variant="caption" muted>
              {part.note}
            </Text>
          ) : null}
        </View>
      ))}
      {children}

      <View className="flex-row items-start gap-space-3 bg-surface-raised p-space-4">
        <Icon name="pin" size={20} />
        <View className="flex-1 gap-space-1">
          <Text variant="title-sm">Where you are: area only</Text>
          <Text variant="body-sm" muted>
            Nobody sees your exact location. You can share it live for one game, with the people in
            it, until it ends.
          </Text>
        </View>
      </View>

      <View className="flex-row items-start gap-space-3">
        <Icon name="alert" size={20} />
        <Text variant="body-sm" className="flex-1">
          {"Block and report are on every profile, chat, plan and Challenge. Blocked people can't see you anywhere."}
        </Text>
      </View>
    </View>
  );
}
