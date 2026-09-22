export const serviceName = 'config' as const;

export function describeService() {
  return { name: serviceName, status: 'ready' as const };
}
