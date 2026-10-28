import { router, useIsFocused, usePathname, type Href } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';

import { Button, loadingProps, Situation, TextButton } from '@/design-system';
import { supabase } from '@/lib/supabase';

import { InlineError } from '../profile/states';
import { mayRender, redirectFor, routeAccess } from './gate';
import { consumeReturnTo, peekReturnTo, rememberReturnTo } from './returnTo';
import { useGate } from './useGate';

/**
 * Wraps every screen of the root Stack (its `screenLayout`). A screen renders only when the gate
 * allows it, so nobody sees a flash of the wrong screen and signed-in screens never mount while
 * signed out. The focused screen moves people to where they belong, and a deep link opened while
 * signed out (a plan, a game) is where they land after signing in.
 */
export function RouteGuard({ routeName, children }: { routeName: string; children: ReactNode }) {
  const { gate, retry } = useGate();
  const focused = useIsFocused();
  const pathname = usePathname();
  const access = routeAccess(routeName);
  const target = redirectFor(gate, access, peekReturnTo());

  useEffect(() => {
    if (!focused || !target) return;
    if (access === 'app' && gate.kind !== 'ready') rememberReturnTo(pathname);
    if (gate.kind === 'ready') consumeReturnTo();
    if (router.canDismiss()) router.dismissAll();
    router.replace(target as Href);
  }, [focused, target, access, gate.kind, pathname]);

  if (mayRender(gate, access)) return <>{children}</>;
  if (gate.kind === 'profile-error' && focused) return <ProfileError onRetry={retry} />;
  // The calm ground while deciding (the splash covers it on devices).
  return (
    <Situation id="calm" className="flex-1" {...loadingProps('Loading Ojoro')}>
      <View />
    </Situation>
  );
}

function ProfileError({ onRetry }: { onRetry: () => void }) {
  return (
    <Situation id="calm" className="flex-1 justify-center gap-space-4 px-space-5">
      <InlineError message="We can't reach Ojoro to load your profile. Check your connection and try again." />
      <Button onPress={onRetry} block testID="gate-retry">
        TRY AGAIN
      </Button>
      <TextButton onPress={() => void supabase.auth.signOut()}>SIGN OUT</TextButton>
    </Situation>
  );
}
