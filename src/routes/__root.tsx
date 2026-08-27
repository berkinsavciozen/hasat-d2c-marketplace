import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { takeExpectedSignOut } from "@/lib/hasat/sessionGuard";
import { PUBLIC_BASE_URL } from "@/lib/hasat/constants";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Hasat — Çiftçi & Alıcı Platformu" },
      {
        name: "description",
        content:
          "Hasat, çiftçileri doğrudan restoran ve perakendecilere bağlayan izlenebilir tarım pazar yeridir.",
      },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Hasat — Çiftçi & Alıcı Platformu" },
      {
        property: "og:description",
        content:
          "Hasat, çiftçileri doğrudan restoran ve perakendecilere bağlayan izlenebilir tarım pazar yeridir.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${PUBLIC_BASE_URL}/` },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Hasat — Çiftçi & Alıcı Platformu" },
      {
        name: "twitter:description",
        content:
          "Hasat, çiftçileri doğrudan restoran ve perakendecilere bağlayan izlenebilir tarım pazar yeridir.",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/a4aef110-8537-4306-8849-45326916aaee/id-preview-91b0abdf--0618c152-09fd-4b12-bfeb-a933f5cc1238.lovable.app-1781172310882.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/a4aef110-8537-4306-8849-45326916aaee/id-preview-91b0abdf--0618c152-09fd-4b12-bfeb-a933f5cc1238.lovable.app-1781172310882.png",
      },
      { name: "theme-color", content: "#0D3B66" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Manrope:wght@600;700;800&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/site.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

import { Toaster } from "@/components/ui/sonner";
import { RoleSwitcher } from "@/components/hasat/RoleSwitcher";
import { supabase } from "@/integrations/supabase/client";
import { useHasat } from "@/lib/hasat/store";

function AuthBootstrap() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const setRole = useHasat((s) => s.setRole);
  const updateUser = useHasat((s) => s.updateUser);
  const reset = useHasat((s) => s.reset);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled || !session?.user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .maybeSingle();
      if (cancelled || !profile) return;
      const role = (profile.role === "buyer" ? "buyer" : "farmer") as "farmer" | "buyer";
      setRole(role);
      if (!profile.name || profile.name.trim() === "") {
        const path = window.location.pathname;
        if (!path.startsWith("/login") && !path.startsWith("/onboarding")) {
          router.navigate({ to: role === "buyer" ? "/onboarding/buyer" : "/onboarding/farmer" });
        }
        return;
      }
      updateUser({
        id: session.user.id,
        name: profile.name,
        phone: profile.phone ?? "",
        city: profile.city ?? "",
        premium: !!profile.premium,
      });
    })();

    // P23-M8-b — TEK temizlik noktası: `reset()` + query cache + yönlendirme
    // yalnızca burada yapılır. Sayfa içi çıkış/hesap silme handler'ları
    // (`buyer.account.tsx`, `farmer.settings.tsx`) artık kendi `reset()`/
    // `navigate()`'ini çağırmıyor — ikisi de aynı temizliği neredeyse aynı
    // anda tetiklediğinde (`signOut()` bu event'i kendi promise'i
    // sonuçlanmadan ateşliyor) yarışan iki `navigate()` çağrısı "çıkış fatal
    // hata veriyor" bug'ının kök nedeniydi (bkz. sessionGuard.ts).
    //
    // P23-M8-b-2 — T1'in kendi düzeltmesinin açtığı regresyon: bu handler
    // HER `SIGNED_OUT`'u gerçek çıkış sayıyordu. İki savunma eklendi:
    // (1) `navigator.onLine` false ise (captive-portal/geçici bağlantı
    // sorunu — gotrue-js saf ağ hatalarında zaten SIGNED_OUT yayınlamıyor,
    // bkz. sessionGuard.ts başlık notu, ama sunucudan gelen tuhaf bir yanıt
    // yine de yanlışlıkla non-retryable sayılabilir) temizlik atlanır —
    // token storage'da kalıyor, bir sonraki başarılı yenilemede kendiliğinden
    // düzelir. (2) `useHasat.getState().user` zaten null'sa (önceki bir
    // SIGNED_OUT'ta veya hiç giriş yapılmadıysa) tekrar temizlenecek/
    // bildirilecek bir şey yok — bu, "oturumunuz sonlandı" toast'ının art
    // arda tekrar tekrar çıkmasının kök nedeniydi (her başarısız yenileme
    // denemesi kendi SIGNED_OUT'unu üretiyordu).
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        const wasKnownAuthenticated = !!useHasat.getState().user;
        const expected = takeExpectedSignOut();
        if (!expected && typeof navigator !== "undefined" && !navigator.onLine) {
          return;
        }
        if (!wasKnownAuthenticated && !expected) {
          return;
        }
        reset();
        queryClient.clear();
        if (!expected) {
          toast.error("Oturumun sona erdi. Lütfen tekrar giriş yap.");
        }
        router.navigate({ to: "/" });
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[10000] -translate-y-24 rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg transition-transform focus:translate-y-0 motion-reduce:transition-none"
      >
        Ana içeriğe geç
      </a>
      <AuthBootstrap />
      <NetworkStatus />
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      <Toaster position="top-center" richColors className="z-[9999]" />
      <RoleSwitcher />
    </QueryClientProvider>
  );
}

function NetworkStatus() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={
        online
          ? "sr-only"
          : "sticky top-0 z-[60] border-b border-saffron/40 bg-cream px-4 py-2 text-center text-sm font-medium text-foreground"
      }
    >
      {online
        ? "Bağlantı yeniden kuruldu."
        : "Çevrimdışısınız. Bağlantı gelene kadar bazı işlemler kullanılamayabilir."}
    </div>
  );
}
