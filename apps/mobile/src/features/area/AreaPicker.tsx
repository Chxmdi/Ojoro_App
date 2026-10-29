/**
 * The area picker (undesigned; owner decision: minimal and privacy-safe). A searchable list of
 * neighbourhoods from `areas_list()`, saved with `set_area`. It never asks for the device's
 * location: an area is a neighbourhood, never an address. Used by the onboarding step and by
 * Settings → Your area (`/settings/area`).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import {
  Button,
  DisplayText,
  Icon,
  Input,
  loadingProps,
  Skeleton,
  Strip,
  StripList,
  Text,
  TextButton,
} from '@/design-system';
import { track } from '@/lib/analytics';
import { useUserId } from '@/lib/auth';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { InlineError, OfflineNote, PrivacyNote, useIsOnline } from '../profile/states';
import { useAreas, useMyAreaLabel, useSetArea } from './data';
import { AREA_PRIVACY_LINE, areaMeta, filterAreas, noMatchLine } from './logic';

export type AreaPickerProps = {
  /** Where it's shown, for analytics. */
  source: 'onboarding' | 'settings';
  title: string;
  body: string;
  /** CONTINUE (onboarding) or SAVE (settings). */
  submitLabel: string;
  /** Sent with the area (onboarding passes the radius picked on the step before). */
  radiusKm?: number | undefined;
  /** After set_area succeeds, with the saved label. */
  onSaved: (label: string) => void;
  /** A way past without picking (NOT NOW). Hidden without it. */
  onSkip?: (() => void) | undefined;
  skipLabel?: string | undefined;
  /** The header row above the title (back, step progress). */
  header?: ReactNode;
};

export function AreaPicker({
  source,
  title,
  body,
  submitLabel,
  radiusKm,
  onSaved,
  onSkip,
  skipLabel = 'NOT NOW',
  header,
}: AreaPickerProps) {
  const userId = useUserId();
  const online = useIsOnline();
  const areas = useAreas();
  const mine = useMyAreaLabel(userId);
  const save = useSetArea(userId);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Start from the area you have, once it's known.
  const current = mine.data ?? null;
  useEffect(() => {
    if (current && picked === null) setPicked(current);
  }, [current, picked]);

  const rows = filterAreas(areas.data ?? [], query);

  const submit = () => {
    if (!picked) {
      setError('Pick the area you usually play in.');
      return;
    }
    setError(null);
    save.mutate(
      { label: picked, radiusKm },
      {
        onSuccess: (state) => {
          track('area_picked', { source, changed: picked !== current });
          onSaved(state.area ?? picked);
        },
        onError: (e) => setError(errorMessage(ojoroErrorOf(e))),
      },
    );
  };

  let list: ReactNode;
  if (areas.isPending) {
    list = (
      <View {...loadingProps('Loading areas')} className="gap-space-2">
        <Skeleton kind="strip" />
        <Skeleton kind="strip" />
        <Skeleton kind="strip" />
      </View>
    );
  } else if (areas.isError && !areas.data) {
    list = (
      <InlineError
        message={errorMessage(ojoroErrorOf(areas.error))}
        action="TRY AGAIN"
        onAction={() => void areas.refetch()}
        testID="areas-error"
      />
    );
  } else if ((areas.data ?? []).length === 0) {
    list = (
      <Text variant="body-sm" testID="areas-empty">
        Ojoro has no areas yet. Areas come from the places people play; check back soon.
      </Text>
    );
  } else if (rows.length === 0) {
    list = (
      <Text variant="body-sm" testID="areas-no-match">
        {noMatchLine(query)}
      </Text>
    );
  } else {
    list = (
      <StripList>
        {rows.map((a) => {
          const on = picked?.toLowerCase() === a.label.toLowerCase();
          return (
            <Strip
              key={a.label}
              title={a.area}
              titleVariant="title-sm"
              meta={areaMeta(a)}
              trailing={on ? <Icon name="check" /> : null}
              accessibilityLabel={`${a.area}, ${areaMeta(a)}${on ? ', selected' : ''}`}
              onPress={() => {
                setPicked(a.label);
                setError(null);
              }}
              testID={`area-${a.area}`}
            />
          );
        })}
      </StripList>
    );
  }

  return (
    <View className="flex-1">
      {header}
      <View className="gap-space-6 px-space-5 pb-space-8 pt-space-6">
        <View className="gap-space-3">
          <DisplayText size="lg" accessibilityRole="header">
            {title}
          </DisplayText>
          <Text variant="body">{body}</Text>
        </View>

        {!online ? (
          <OfflineNote
            dataUpdatedAt={areas.dataUpdatedAt}
            what="the areas"
            extra="Your area saves when you're back."
          />
        ) : null}

        <Input
          label="Search areas"
          icon="search"
          value={query}
          onChangeText={setQuery}
          placeholder="Neighbourhood or city"
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          testID="area-search"
        />

        <View role="radiogroup" aria-label="Areas">
          {list}
        </View>

        <PrivacyNote>{AREA_PRIVACY_LINE}</PrivacyNote>

        {error ? <InlineError message={error} testID="area-error" /> : null}
        <View className="gap-space-2">
          <Button block loading={save.isPending} disabled={!online} onPress={submit} testID="area-save">
            {submitLabel}
          </Button>
          {onSkip ? (
            <TextButton onPress={onSkip} className="self-center" testID="area-skip">
              {skipLabel}
            </TextButton>
          ) : null}
        </View>
      </View>
    </View>
  );
}
