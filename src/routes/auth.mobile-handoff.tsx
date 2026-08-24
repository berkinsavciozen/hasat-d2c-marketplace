import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/hasat/BrandLogo";

// Same rule as /login's validateSearch: only same-origin relative paths,
// never external URLs (`//host/...` is protocol-relative and would leave the site).
function isSafeNextPath(next: unknown): next is string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//");
}

const DEFAULT_NEXT = "/buyer/discover";

export const Route = createFileRoute("/auth/mobile-handoff")({
  head: () => ({ meta: [{ title: "Giriş yapılıyor… — Hasat" }] }),
  component: MobileHandoffPage,
});

function MobileHandoffPage() {
  const [failed, setFailed] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      // Tokens travel only in the URL fragment (never the query string): the
      // fragment is never sent to the server or logged, so this is the only
      // place we're willing to read them from.
      const hash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;
      const params = new URLSearchParams(hash);
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      const next = params.get("next");

      // Strip the fragment immediately so tokens never linger in the address
      // bar or browser history, regardless of what happens next.
      window.history.replaceState(null, "", window.location.pathname + window.location.search);

      if (!access_token || !refresh_token) {
        window.location.href = "/login";
        return;
      }

      const { error } = await supabase.auth.setSession({ access_token, refresh_token });

      if (error) {
        toast.error("Oturum süresi dolmuş, tekrar giriş yapman gerekiyor.");
        setFailed(true);
        window.location.href = "/login";
        return;
      }

      window.location.href = isSafeNextPath(next) ? next : DEFAULT_NEXT;
    })();
  }, []);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: "var(--dark)", color: "var(--hwhite)" }}
    >
      <div className="text-center">
        <BrandLogo variant="wordmark" tone="white" height={32} className="mx-auto mb-2 animate-pulse motion-reduce:animate-none" />
        <div className="mt-4 text-sm text-hwhite/60">
          {failed ? "Yönlendiriliyor…" : "Hesabına giriş yapılıyor…"}
        </div>
      </div>
    </div>
  );
}
