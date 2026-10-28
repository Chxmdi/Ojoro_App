import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import {
  Button,
  Chip,
  DisplayText,
  Divider,
  loadingProps,
  Screen,
  Skeleton,
  Text,
} from '@/design-system';
import { LEVELS, setLevel, sportsError, toggleSport } from '@/features/onboarding/draft';
import { useOnboarding, useSports } from '@/features/onboarding/OnboardingContext';
import { StepHeader } from '@/features/onboarding/StepHeader';
import { InlineError } from '@/features/profile/states';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

/** Onboarding 1 · Sports (OnboardSports.png): pick sports (chips wrap), then a rough level each. */
export default function OnboardSports() {
  const { draft, update } = useOnboarding();
  const sports = useSports();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    track('screen_viewed', { screen: 'onboard_sports' });
  }, []);

  const nameOf = (id: string) => sports.data?.find((s) => s.id === id)?.name ?? id;

  const next = () => {
    const problem = sportsError(draft, nameOf);
    if (problem) {
      setError(problem);
      return;
    }
    track('onboarding_step_completed', { step: 'sports', sports: draft.sports.length });
    router.push('/when');
  };

  const skip = () => {
    // SKIP FOR NOW: no sports (contract: p_sports = []).
    update((d) => ({ ...d, sports: [], levels: {}, pullMeIn: [] }));
    setError(null);
    track('onboarding_step_completed', { step: 'sports', sports: 0, skipped: true });
    router.push('/when');
  };

  return (
    <Screen situation="calm" scroll gutter={false}>
      <StepHeader step={1} />
      <View className="gap-space-8 px-space-5 pb-space-8 pt-space-6">
        <View className="gap-space-3">
          <DisplayText size="lg" accessibilityRole="header">
            WHAT DO YOU PLAY?
          </DisplayText>
          <Text variant="body">Anything you do now or want to try. You can change it any time.</Text>
          {sports.data ? (
            <View
              role="group"
              aria-label="Sports"
              className="mt-space-2 flex-row flex-wrap gap-space-2"
            >
              {sports.data.map((sport) => (
                <Chip
                  key={sport.id}
                  selected={draft.sports.includes(sport.id)}
                  onPress={() => {
                    update((d) => toggleSport(d, sport.id));
                    setError(null);
                  }}
                  testID={`sport-${sport.id}`}
                >
                  {sport.name}
                </Chip>
              ))}
            </View>
          ) : sports.isError ? (
            <InlineError
              message={errorMessage(ojoroErrorOf(sports.error))}
              action="TRY AGAIN"
              onAction={() => void sports.refetch()}
            />
          ) : (
            <View className="mt-space-2" {...loadingProps('Loading sports')}>
              <Skeleton kind="text" lines={3} />
            </View>
          )}
        </View>

        {draft.sports.length > 0 ? (
          <View className="gap-space-5" aria-label="Levels">
            <Divider label="HOW GOOD, ROUGHLY?" />
            {draft.sports.map((id) => (
              <View key={id} className="gap-space-2">
                <Text variant="title-sm">{nameOf(id)}</Text>
                <View
                  role="group"
                  aria-label={`${nameOf(id)} level`}
                  className="flex-row flex-wrap gap-space-2"
                >
                  {LEVELS.map((level) => (
                    <Chip
                      key={level.value}
                      selected={draft.levels[id] === level.value}
                      onPress={() => {
                        update((d) => setLevel(d, id, level.value));
                        setError(null);
                      }}
                      testID={`level-${id}-${level.value}`}
                    >
                      {level.label}
                    </Chip>
                  ))}
                </View>
              </View>
            ))}
            <Text variant="caption" muted>
              Levels are only used to match you fairly. They never show as a score.
            </Text>
          </View>
        ) : null}

        <View className="gap-space-1">
          {error ? (
            <View className="mb-space-3">
              <InlineError message={error} testID="sports-error" />
            </View>
          ) : null}
          <Button block onPress={next} testID="sports-continue">
            CONTINUE
          </Button>
          <Button variant="ghost" block onPress={skip} testID="sports-skip">
            SKIP FOR NOW
          </Button>
        </View>
      </View>
    </Screen>
  );
}
