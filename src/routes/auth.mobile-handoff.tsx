import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/hasat/BrandLogo";
import { parseHandoffFragment, resolveHandoffNext } from "./mobileHandoffAccess";

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
      // T9: the fragment now carries only an opaque, single-use, 60s-lived nonce — never the real
      // access_token/refresh_token (see mobileHandoffAccess.ts for why). Still read exclusively from
      // the fragment, same as before: it's never sent to the server or logged.
      const { nonce, next } = parseHandoffFragment(window.location.hash);

      // Strip the fragment immediately so the nonce never lingers in the address
      // bar or browser history, regardless of what happens next.
      window.history.replaceState(null, "", window.location.pathname + window.location.search);

      if (!nonce) {
        window.location.href = "/login";
        return;
      }

      const { data, error } = await supabase.functions.invoke<{
        access_token?: string;
        refresh_token?: string;
        next_path?: string | null;
      }>("mobile-handoff-exchange", { body: { nonce } });

      if (error || !data?.access_token || !data?.refresh_token) {
        toast.error("Oturum süresi dolmuş, tekrar giriş yapman gerekiyor.");
        setFailed(true);
        window.location.href = "/login";
        return;
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });

      if (sessionError) {
        toast.error("Oturum süresi dolmuş, tekrar giriş yapman gerekiyor.");
        setFailed(true);
        window.location.href = "/login";
        return;
      }

      window.location.href = resolveHandoffNext(data.next_path, next);
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
