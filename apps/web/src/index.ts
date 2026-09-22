export const serviceName = 'web' as const;

export function describeService() {
  return { name: serviceName, status: 'ready' as const };
}
