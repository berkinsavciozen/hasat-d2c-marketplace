import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useHasat } from "@/lib/hasat/store";
import { hasActiveRole, type ProtectedRole } from "@/lib/hasat/protectedRouteAccess";
import { markExpectedSignOut } from "@/lib/hasat/sessionGuard";

async function clearInvalidSession(): Promise<void> {
  markExpectedSignOut();
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Invalid/deleted auth users can make sign-out fail. The app state must
    // still be cleared before the route redirects to the public start page.
  }
  useHasat.getState().reset();
}

export async function requireActiveProfile(expectedRole: ProtectedRole): Promise<void> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;
  if (userError || !user) {
    await clearInvalidSession();
    throw redirect({ to: "/" });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    useHasat.getState().reset();
    throw redirect({ to: "/" });
  }

  if (!hasActiveRole(user.id, profile, expectedRole)) {
    await clearInvalidSession();
    throw redirect({ to: "/" });
  }
}
