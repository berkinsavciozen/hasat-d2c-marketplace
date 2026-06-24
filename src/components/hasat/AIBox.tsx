import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthUserId } from "@/lib/hasat/queries";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const COACH_KEY = "hasat_aibox_coach_dismissed";
let coachShownThisSession = false;

export type AIBoxPage = "dashboard" | "analytics" | "journal" | "prices" | "storefront";

interface AIBoxResponse {
  insights: string[];
  urgency: string | null;
  empty?: boolean;
  error?: boolean;
}

async function fetchInsights(page: AIBoxPage): Promise<AIBoxResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("no_token");
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-box-insights`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "apikey": SUPABASE_KEY,
    },
    body: JSON.stringify({ page_type: page }),
  });
  if (!res.ok) throw new Error("http_" + res.status);
  return await res.json();
}

function openChatWithPrefill(insight: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("hasat:ai-chat:open", {
    detail: { prefill: `Bu konuda daha fazla bilgi ver: ${insight}` },
  }));
}

export function AIBox({ page }: { page: AIBoxPage }) {
  const userId = useAuthUserId();
  const storageKey = `hasat_aibox_${page}_collapsed`;
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(storageKey) === "1";
  });

  const [showCoach, setShowCoach] = useState(false);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      if (typeof window !== "undefined") localStorage.setItem(storageKey, next ? "1" : "0");
      return next;
    });
  };

  const dismissCoach = () => {
    setShowCoach(false);
    if (typeof window !== "undefined") localStorage.setItem(COACH_KEY, "1");
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ["ai-box", page, userId],
    queryFn: () => fetchInsights(page),
    enabled: !!userId,
    staleTime: 300_000,
    gcTime: 300_000,
    retry: false,
  });

  const insightsCount = data?.insights?.length ?? 0;
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (coachShownThisSession) return;
    if (insightsCount === 0) return;
    if (localStorage.getItem(COACH_KEY) === "1") return;
    coachShownThisSession = true;
    setShowCoach(true);
  }, [insightsCount]);

  if (!userId) return null;
  if (isError) return null;
  if (data?.error) return null;

  const cardStyle = {
    background: "color-mix(in oklab, var(--lav) 10%, var(--card))",
    borderLeft: "3px solid var(--lav)",
  } as const;

  if (isLoading) {
    return (
      <div className="rounded-xl p-3 md:p-4 mb-4" style={cardStyle}>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 animate-pulse" style={{ color: "var(--lav)" }} />
          <div className="text-sm font-medium animate-pulse">AI Analiz</div>
        </div>
        <div className="space-y-2">
          <div className="h-3 rounded animate-pulse" style={{ background: "color-mix(in oklab, var(--lav) 22%, transparent)", width: "92%" }} />
          <div className="h-3 rounded animate-pulse" style={{ background: "color-mix(in oklab, var(--lav) 22%, transparent)", width: "76%" }} />
          <div className="h-3 rounded animate-pulse" style={{ background: "color-mix(in oklab, var(--lav) 22%, transparent)", width: "84%" }} />
        </div>
      </div>
    );
  }

  if (data?.empty) {
    return (
      <div className="rounded-xl p-3 md:p-4 mb-4" style={cardStyle}>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-4 w-4" style={{ color: "var(--lav)" }} />
          <div className="text-sm font-medium">AI Analiz</div>
        </div>
        <div className="text-sm text-muted-foreground">
          Henüz yeterli veri yok. Günlük kaydı ekledikçe AI önerilerin kişiselleşecek.
        </div>
      </div>
    );
  }

  const insights = data?.insights ?? [];
  if (insights.length === 0) return null;

  const teaser = insights[0].length > 60 ? insights[0].slice(0, 60) + "…" : insights[0];

  return (
  // trigger coach mark once insights render (not loading/empty)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (coachShownThisSession) return;
    if (insights.length === 0) return;
    if (localStorage.getItem(COACH_KEY) === "1") return;
    coachShownThisSession = true;
    setShowCoach(true);
  }, [insights.length]);

  return (
    <div className="relative rounded-xl p-3 md:p-4 mb-4" style={cardStyle}>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={!collapsed}
      >
        <Sparkles className="h-4 w-4 shrink-0" style={{ color: "var(--lav)" }} />
        <div className="text-sm font-medium shrink-0">AI Analiz</div>
        {collapsed && (
          <div className="flex-1 text-xs text-muted-foreground truncate">{teaser}</div>
        )}
        <span className="ml-auto" style={{ color: "var(--lav)" }}>
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </span>
      </button>

      {!collapsed && (
        <div className="mt-3 space-y-2">
          {data?.urgency && (
            <div
              className="rounded-md px-3 py-2 text-sm font-semibold"
              style={{
                background: "color-mix(in oklab, var(--gold) 35%, white)",
                color: "var(--dark)",
              }}
            >
              ⚠ {data.urgency}
            </div>
          )}
          <ul className="space-y-1.5">
            {insights.map((line, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => openChatWithPrefill(line)}
                  className="flex w-full items-start gap-2 text-left text-sm rounded-md px-2 py-1.5 hover:bg-[color-mix(in_oklab,var(--lav)_15%,transparent)] transition"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "var(--lav)" }} />
                  <span className="flex-1">{line}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
