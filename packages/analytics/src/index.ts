export const serviceName = 'analytics' as const;

export function describeService() {
  return { name: serviceName, status: 'ready' as const };
}
