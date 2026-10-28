/**
 * Which social sign-ins this build offers. Apple and Google aren't configured on the local stack
 * (contract: "Apple/Google sign-in configuration" is not in Slice 01), so their buttons show only
 * when the build says the provider is set up: `EXPO_PUBLIC_AUTH_APPLE=on`,
 * `EXPO_PUBLIC_AUTH_GOOGLE=on`. Pure: the caller reads the variables by their literal names.
 */
export type AuthProviders = { apple: boolean; google: boolean };

const ON = new Set(['1', 'true', 'on', 'yes']);

export function parseAuthProviders(env: {
  apple?: string | undefined;
  google?: string | undefined;
}): AuthProviders {
  const on = (value: string | undefined) => ON.has((value ?? '').trim().toLowerCase());
  return { apple: on(env.apple), google: on(env.google) };
}

/** The phone button leads when no social sign-in is offered; otherwise it's the quiet third option. */
export function phoneButtonVariant(providers: AuthProviders): 'primary' | 'ghost' {
  return providers.apple || providers.google ? 'ghost' : 'primary';
}
