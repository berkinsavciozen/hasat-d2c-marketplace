export type ProtectedRole = "buyer" | "farmer";

export function hasActiveRole(
  userId: string | null | undefined,
  profile: { id?: string; role?: string } | null,
  expectedRole: ProtectedRole,
): boolean {
  return !!userId && profile?.id === userId && profile.role === expectedRole;
}
