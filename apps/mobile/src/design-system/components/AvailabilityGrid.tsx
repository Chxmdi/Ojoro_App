import { Platform, Pressable, View } from 'react-native';

import { uiFamily } from '../fonts';
import {
  availabilitySummary,
  DAY_NAMES,
  DAYS,
  dayShort,
  PARTS_OF_DAY,
  partHeading,
  slotKey,
  slotLabel,
  toggleSlot,
  type AvailabilitySlot,
  type Day,
  type PartOfDay,
} from './AvailabilityGrid.logic';
import { FocusRing, noBrowserOutline, useFocusVisible } from './pressFeedback';
import { Text } from './Text';

export {
  DAYS,
  PARTS_OF_DAY,
  toggleSlot,
  type AvailabilitySlot,
  type Day,
  type PartOfDay,
} from './AvailabilityGrid.logic';

export type AvailabilityGridProps = {
  /** The free slots ("tue-evening"). Controlled. */
  value: readonly AvailabilitySlot[];
  /** The next value, in week order, after a cell is toggled. */
  onChange?: ((next: AvailabilitySlot[]) => void) | undefined;
  /** Rows. Default Monday to Sunday. */
  days?: readonly Day[] | undefined;
  /** Columns. Default morning, midday, evening. */
  parts?: readonly PartOfDay[] | undefined;
  disabled?: boolean | undefined;
  /** The grid's name for screen readers. Default "When you're usually free". */
  accessibilityLabel?: string | undefined;
  testID?: string | undefined;
};

/** Day-label column (`grid-template-columns: 48px …`). */
const DAY_COLUMN = 48;
/** Gap between cells (`gap: 6px`). */
const CELL_GAP = 6;

/**
 * The free-time grid (`.slot` in OnboardWhen): day × part-of-day toggles. A
 * free cell turns `inverse` and says FREE, so the state is a word, not just a
 * fill. Each cell is a 44pt target read as "Tuesday evening, free".
 *
 * This is rough free time for finding overlap, never a calendar: no dates, no
 * hours, nothing anyone else sees except the overlap.
 */
export function AvailabilityGrid({
  value,
  onChange,
  days = DAYS,
  parts = PARTS_OF_DAY,
  disabled = false,
  accessibilityLabel = "When you're usually free",
  testID,
}: AvailabilityGridProps) {
  const free = new Set(value);
  return (
    <View
      role="group"
      accessibilityLabel={`${accessibilityLabel}, ${availabilitySummary(value).toLowerCase()}`}
      testID={testID}
      className="gap-space-3"
    >
      <View
        className="flex-row items-center"
        style={{ gap: CELL_GAP }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        {...(Platform.OS === 'web' ? { 'aria-hidden': true } : null)}
      >
        <View style={{ width: DAY_COLUMN }} />
        {parts.map((part) => (
          <Text key={part} variant="label-sm" muted className="flex-1 text-center">
            {partHeading(part)}
          </Text>
        ))}
      </View>
      {days.map((day) => (
        <View
          key={day}
          role="group"
          accessibilityLabel={DAY_NAMES[day]}
          className="flex-row items-center"
          style={{ gap: CELL_GAP }}
        >
          <View style={{ width: DAY_COLUMN }}>
            <Text variant="label" importantForAccessibility="no" accessibilityElementsHidden>
              {dayShort(day)}
            </Text>
          </View>
          {parts.map((part) => {
            const key = slotKey(day, part);
            const on = free.has(key);
            return (
              <Slot
                key={key}
                on={on}
                label={slotLabel(day, part, on)}
                disabled={disabled}
                {...(onChange ? { onPress: () => onChange(toggleSlot(value, key)) } : null)}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

function Slot({
  on,
  label,
  disabled,
  onPress,
}: {
  on: boolean;
  label: string;
  disabled: boolean;
  onPress?: () => void;
}) {
  const focus = useFocusVisible({});
  // aria-pressed on the web (as the prototype); RN has none, so selected on native.
  const state = Platform.OS === 'web' ? { 'aria-pressed': on } : { 'aria-selected': on };
  return (
    <Pressable
      role="button"
      {...state}
      aria-label={label}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onPress={onPress}
      onPressIn={focus.onPressIn}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      className="relative flex-1"
      style={noBrowserOutline}
    >
      <View
        className={`h-touch items-center justify-center border ${
          on ? 'border-inverse bg-inverse' : 'border-line-strong bg-transparent'
        }`}
      >
        {on ? (
          <Text variant="caption" tone="on-inverse" style={SLOT_TEXT}>
            FREE
          </Text>
        ) : null}
      </View>
      {focus.focusVisible ? <FocusRing shape="square" /> : null}
    </Pressable>
  );
}

/** `.slot { font: 600 12px/1 }`. */
const SLOT_TEXT = {
  fontFamily: uiFamily(600),
  fontSize: 12,
  lineHeight: 14,
  letterSpacing: 0,
} as const;
