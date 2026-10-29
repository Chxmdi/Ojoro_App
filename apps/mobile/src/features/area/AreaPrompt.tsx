/**
 * Home's one-time area prompt for people with no area (existing accounts from before the area
 * step, or anyone who tapped NOT NOW in onboarding). Not forced: NOT NOW hides it for good on this
 * device. PICK MY AREA opens /settings/area.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { Button, Panel } from '@/design-system';
import { track } from '@/lib/analytics';

import { areaPromptKey } from './logic';

export function AreaPrompt({ userId, show }: { userId: string | null; show: boolean }) {
  const router = useRouter();
  // null while reading the device's note; hidden until we know.
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    AsyncStorage.getItem(areaPromptKey(userId))
      .then((v) => live && setDismissed(v === '1'))
      .catch(() => live && setDismissed(false));
    return () => {
      live = false;
    };
  }, [userId]);

  if (!show || dismissed !== false || !userId) return null;

  const notNow = () => {
    track('area_prompt_tapped', { action: 'not_now', source: 'home' });
    setDismissed(true);
    void AsyncStorage.setItem(areaPromptKey(userId), '1').catch(() => {});
  };

  return (
    <Panel
      overline="YOUR AREA"
      title="Pick your area to see what's starting near you."
      body="A neighbourhood, never an address. Ojoro never asks for your location."
      accessibilityLabel="Your area"
      testID="area-prompt"
      actions={
        <>
          <Button
            onPress={() => {
              track('area_prompt_tapped', { action: 'pick', source: 'home' });
              router.push('/settings/area');
            }}
            testID="area-prompt-pick"
          >
            PICK MY AREA
          </Button>
          <Button variant="ghost" onPress={notNow} testID="area-prompt-not-now">
            NOT NOW
          </Button>
        </>
      }
    />
  );
}
