export interface RetryOperationKeyStore {
  acquire(identity: string): string;
  succeed(identity: string, key: string): void;
}

/**
 * Keeps one operation key only while the same logical request is being retried.
 * A different request gets a fresh key immediately; a successful request rotates
 * the key before the hook can submit another operation.
 */
export function createRetryOperationKeyStore(
  generate: () => string = () => crypto.randomUUID(),
): RetryOperationKeyStore {
  let current: { identity: string | null; key: string } = {
    identity: null,
    key: generate(),
  };

  return {
    acquire(identity) {
      if (current.identity !== identity) {
        current = { identity, key: current.identity === null ? current.key : generate() };
      }
      return current.key;
    },
    succeed(identity, key) {
      if (current.identity === identity && current.key === key) {
        current = { identity: null, key: generate() };
      }
    },
  };
}
