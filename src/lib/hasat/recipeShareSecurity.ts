const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

let pendingToken: string | null = null;

export function captureShareTokenFromFragment(location: Location, history: History): boolean {
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  const candidate = params.get("share");
  const safeSearch = new URLSearchParams(location.search);
  safeSearch.delete("share");
  safeSearch.delete("token");
  const query = safeSearch.toString();
  history.replaceState(history.state, "", `${location.pathname}${query ? `?${query}` : ""}`);
  pendingToken = candidate && TOKEN_PATTERN.test(candidate) ? candidate : null;
  return pendingToken !== null;
}

export function hasPendingShareToken(): boolean {
  return pendingToken !== null;
}

export function withPendingShareToken<T>(run: (token: string) => Promise<T>): Promise<T> {
  if (!pendingToken) return Promise.reject(new Error("recipe_share_token_missing"));
  return run(pendingToken);
}

export function clearPendingShareToken(): void {
  pendingToken = null;
}

export function buildPrivateRecipeShareUrl(baseUrl: string, token: string): string {
  if (!TOKEN_PATTERN.test(token)) throw new Error("recipe_share_invalid_or_inactive");
  return `${baseUrl.replace(/\/$/, "")}/tarif-paylasim#share=${token}`;
}
