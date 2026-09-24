const LOGIN_NEXT_ORIGIN = "https://hasat.invalid";
const FORBIDDEN_PATH_ENCODING = /%(?:00|2e|2f|3a|5c)/i;

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function isAllowedLoginPath(url: URL): boolean {
  if (url.pathname === "/tarif-paylasim") return url.search === "";

  if (url.pathname.startsWith("/tarifler/") && url.search === "") {
    const slug = url.pathname.slice("/tarifler/".length);
    return slug.length > 0 && slug !== "." && slug !== ".." && !slug.includes("/");
  }

  if (url.pathname !== "/.lovable/oauth/consent") return false;
  const keys = [...url.searchParams.keys()];
  return (
    keys.length === 1 &&
    keys[0] === "authorization_id" &&
    (url.searchParams.get("authorization_id")?.length ?? 0) > 0
  );
}

/**
 * Login only accepts the internal destinations that currently create a `next` value.
 * Keeping this allowlist narrow prevents open redirects and keeps recipe-share capabilities
 * out of login URLs while still preserving the existing recipe and OAuth consent flows.
 */
export function safeLoginNext(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    hasControlCharacter(value)
  ) {
    return undefined;
  }

  const rawPath = value.split(/[?#]/, 1)[0];
  if (FORBIDDEN_PATH_ENCODING.test(rawPath)) return undefined;

  let url: URL;
  try {
    url = new URL(value, LOGIN_NEXT_ORIGIN);
  } catch {
    return undefined;
  }

  if (url.origin !== LOGIN_NEXT_ORIGIN || url.hash || !isAllowedLoginPath(url)) {
    return undefined;
  }

  return `${url.pathname}${url.search}`;
}

type ClientNavigate = (options: { href: string }) => unknown;

/** Uses TanStack's internal-href path, which commits an SPA navigation without reloading JS. */
export function navigateToLoginNext(navigate: ClientNavigate, value: unknown): boolean {
  const next = safeLoginNext(value);
  if (!next) return false;
  void navigate({ href: next });
  return true;
}
