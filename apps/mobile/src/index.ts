export const serviceName = 'mobile' as const;

export function describeService() {
  return { name: serviceName, status: 'ready' as const };
}
