type AccountDeletionDependencies = {
  deleteAccount: () => Promise<void>;
  signOutLocally: () => Promise<void>;
  clearClientState: () => void;
  redirectToStart: () => void;
};

/**
 * Completes account deletion in a strict order: the client is only cleared
 * after the backend confirms deletion, and cleanup does not depend on a
 * SIGNED_OUT event from an already-deleted auth user.
 */
export async function completeAccountDeletion({
  deleteAccount,
  signOutLocally,
  clearClientState,
  redirectToStart,
}: AccountDeletionDependencies): Promise<void> {
  await deleteAccount();

  try {
    await signOutLocally();
  } catch {
    // The deletion RPC invalidates the server-side user first. Client state
    // must still be cleared if GoTrue can no longer sign that user out.
  }

  clearClientState();
  redirectToStart();
}
