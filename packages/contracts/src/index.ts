export const serviceName = 'contracts' as const;

export function describeService() {
  return { name: serviceName, status: 'ready' as const };
}
