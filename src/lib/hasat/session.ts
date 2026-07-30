const SESSION_KEY = "hasat-anon-session-id";

/**
 * Stable anon session id, persisted in localStorage. Used to attribute
 * `recipe_views` (and later, other anon analytics) to the same visitor
 * across page loads and across login — the same id keeps being sent
 * after a visitor signs in, so a pre-login session can be matched to the
 * profile that later views the same recipe.
 */
export function getOrCreateSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let id = window.localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    // localStorage unavailable (privacy mode etc.) — view still renders, just unattributed.
    return null;
  }
}
