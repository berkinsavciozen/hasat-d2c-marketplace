export type ProtectedRole = "buyer" | "farmer";
export type AccessProfile = { id?: string; role?: string; deleted_at?: string | null };

/** Missing deletion status fails closed until the schema contract is available. */
export function hasActiveProfile(
  userId: string | null | undefined,
  profile: AccessProfile | null,
): boolean {
  return !!userId && profile?.id === userId && profile.deleted_at === null;
}

export function hasActiveRole(
  userId: string | null | undefined,
  profile: AccessProfile | null,
  expectedRole: ProtectedRole,
): boolean {
  return hasActiveProfile(userId, profile) && profile?.role === expectedRole;
}

/** Always reads current server state; persisted store/router data cannot authorize access. */
export async function checkProtectedProfile(
  expectedRole: ProtectedRole,
  dependencies: {
    getUserId: () => Promise<string | null>;
    readProfile: (id: string) => Promise<AccessProfile | null>;
    clearInvalidSession: () => Promise<void>;
  },
): Promise<boolean> {
  try {
    const id = await dependencies.getUserId();
    if (id && hasActiveRole(id, await dependencies.readProfile(id), expectedRole)) return true;
  } catch {
    // Auth/profile lookup failures must never admit a protected route.
  }
  await dependencies.clearInvalidSession();
  return false;
}
