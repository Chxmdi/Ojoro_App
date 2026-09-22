export const serviceName = 'design-tokens' as const;

export function describeService() {
  return { name: serviceName, status: 'ready' as const };
}
