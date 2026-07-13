export function resolveJobExpireInSeconds(timeoutMs: number): number {
  const querySeconds = Math.ceil(timeoutMs / 1000);
  const bufferSeconds = 300;
  return querySeconds + bufferSeconds;
}
