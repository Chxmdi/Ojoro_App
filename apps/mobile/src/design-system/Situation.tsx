import { situationVariables, type SituationId } from '@ojoro/design-tokens';
import { VariableContextProvider } from 'nativewind';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

const SituationContext = createContext<SituationId>('calm');

/** The situation the nearest <Situation> set. Defaults to calm. */
export function useSituation(): SituationId {
  return useContext(SituationContext);
}

/** Light status-bar content on oxblood and black grounds, dark on the rest. */
export function statusBarStyle(id: SituationId): 'light' | 'dark' {
  return id === 'confirmed' || id === 'live' ? 'light' : 'dark';
}

export type SituationProps = ViewProps & {
  id: SituationId;
  /** Paint the situation's ground (`bg-surface`) on this view. Default true. */
  ground?: boolean;
  className?: string;
  children?: ReactNode;
};

/**
 * Sets the situation on an object's root: semantic colour tokens re-resolve
 * for everything inside, so a GAME ON poster turns oxblood inside a calm feed.
 * Situations nest. Replaces the prototype's `data-theme`.
 */
export function Situation({ id, ground = true, className, children, ...rest }: SituationProps) {
  const variables = useMemo(() => situationVariables(id), [id]);
  const classes = [ground ? 'bg-surface' : null, className].filter(Boolean).join(' ');
  return (
    <SituationContext value={id}>
      <VariableContextProvider value={variables}>
        <View className={classes} {...rest}>
          {children}
        </View>
      </VariableContextProvider>
    </SituationContext>
  );
}
