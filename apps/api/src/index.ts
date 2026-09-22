export const serviceName = 'api' as const;

export function healthPayload() {
  return {
    status: 'ok' as const,
    service: serviceName,
    version: process.env.APP_VERSION ?? 'dev',
  };
}
