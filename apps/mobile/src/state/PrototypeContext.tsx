import {
  createContext,
  type PropsWithChildren,
  useContext,
  useMemo,
  useState,
} from 'react';

import { track } from '@/lib/analytics';

type PlanState = 'forming' | 'game-on' | 'live' | 'recap';
type ChallengeState = 'pending' | 'active' | 'countered' | 'complete';

type PrototypeContextValue = {
  participantCount: number;
  joined: boolean;
  planState: PlanState;
  challengeState: ChallengeState;
  joinPlan: () => void;
  addFriend: () => void;
  confirmGame: () => void;
  startActivity: () => void;
  finishActivity: () => void;
  runItBack: () => void;
  acceptChallenge: () => void;
  counterChallenge: () => void;
  completeChallenge: () => void;
  resetChallenge: () => void;
};

const PrototypeContext = createContext<PrototypeContextValue | null>(null);

export function PrototypeProvider({ children }: PropsWithChildren) {
  const [participantCount, setParticipantCount] = useState(4);
  const [joined, setJoined] = useState(false);
  const [planState, setPlanState] = useState<PlanState>('forming');
  const [challengeState, setChallengeState] =
    useState<ChallengeState>('pending');

  const value = useMemo<PrototypeContextValue>(
    () => ({
      participantCount,
      joined,
      planState,
      challengeState,
      joinPlan() {
        if (joined || planState !== 'forming') return;
        setJoined(true);
        setParticipantCount((count) => Math.min(8, count + 1));
        track('im_down_committed', { planId: 'football-tonight' });
      },
      addFriend() {
        if (planState !== 'forming') return;
        setParticipantCount((count) => {
          const next = Math.min(8, count + 1);
          track('plan_threshold_changed', {
            planId: 'football-tonight',
            count: next,
          });
          if (next === 7) {
            track('need_one_more_shown', { planId: 'football-tonight' });
          }
          if (next === 8) {
            setPlanState('game-on');
            track('game_on_reached', { planId: 'football-tonight' });
          }
          return next;
        });
        track('friend_pulled_in', { planId: 'football-tonight' });
      },
      confirmGame() {
        setParticipantCount(8);
        setPlanState('game-on');
        track('game_on_reached', { planId: 'football-tonight' });
      },
      startActivity() {
        setPlanState('live');
        track('activity_started', { activityId: 'football-tonight' });
      },
      finishActivity() {
        setPlanState('recap');
        track('activity_completed', { activityId: 'football-tonight' });
      },
      runItBack() {
        setParticipantCount(4);
        setJoined(false);
        setPlanState('forming');
        track('run_it_back', { activityId: 'football-tonight' });
      },
      acceptChallenge() {
        setChallengeState('active');
        track('challenge_accepted', { challengeId: 'marcus-5k' });
      },
      counterChallenge() {
        setChallengeState('countered');
        track('challenge_countered', { challengeId: 'marcus-5k' });
      },
      completeChallenge() {
        setChallengeState('complete');
        track('challenge_completed', { challengeId: 'marcus-5k' });
      },
      resetChallenge() {
        setChallengeState('pending');
      },
    }),
    [challengeState, joined, participantCount, planState],
  );

  return (
    <PrototypeContext.Provider value={value}>
      {children}
    </PrototypeContext.Provider>
  );
}

export function usePrototype() {
  const value = useContext(PrototypeContext);
  if (!value) {
    throw new Error('usePrototype must be used inside PrototypeProvider');
  }
  return value;
}
