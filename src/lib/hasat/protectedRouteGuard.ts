import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useHasat } from "@/lib/hasat/store";
import { checkProtectedProfile, type ProtectedRole } from "@/lib/hasat/protectedRouteAccess";
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
  const allowed = await checkProtectedProfile(expectedRole, {
    getUserId: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user?.id ?? null;
    },
    readProfile: async (id) => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, role, deleted_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    clearInvalidSession,
  });
  if (!allowed) throw redirect({ to: "/" });
}
