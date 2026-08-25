import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, X, Send, Plus, History, ChevronLeft, MessageCircle } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useRouterState } from "@tanstack/react-router";
import { useProfile, useAuthUserId } from "@/lib/hasat/queries";
import {
  useAIChat,
  fetchSessionsList,
  hasAnyMessage,
  fetchTier,
  type ChatMessage,
} from "./useAIChat";
import { JournalEntryCard } from "./JournalEntryCard";
import { UpgradeModal } from "@/components/hasat/UpgradeModal";
import { HASAT_WHATSAPP_NUMBER } from "@/lib/hasat/constants";

const COACH_KEY = "hasat_ai_chat_coach_dismissed";
const FREE_LIMIT = 50;
const PREMIUM_LIMIT = 500;
const SOFT_WARN_THRESHOLD = 45;

function nextMonthResetLabel(): string {
  const d = new Date();
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return next.toLocaleDateString("tr-TR", { day: "numeric", month: "long" }) + "'de";
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
  } catch {
    return "";
  }
}

function renderMarkdown(text: string): string {
  // minimal: **bold** + line breaks; HTML-escape first
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br/>");
}

function MessageBubble({ m }: { m: ChatMessage }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%]">
          <div
            className="rounded-2xl rounded-br-sm px-3 py-2 text-sm"
            style={{ background: "var(--primary)", color: "white" }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
          />
          <div className="text-[10px] text-muted-foreground mt-0.5 text-right">
            {fmtTime(m.created_at)}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%]">
        <div
          className="rounded-2xl rounded-bl-sm px-3 py-2 text-sm bg-card border-l-2 text-foreground"
          style={{ borderLeftColor: "var(--gold)" }}
        >
          {m.streaming && !m.content ? (
            <span className="inline-flex gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-foreground/40 animate-pulse" />
              <span className="h-1.5 w-1.5 rounded-full bg-foreground/40 animate-pulse [animation-delay:120ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-foreground/40 animate-pulse [animation-delay:240ms]" />
            </span>
          ) : m.content ? (
            <span dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
          ) : m.journal ? (
            <span className="text-muted-foreground text-xs italic">Günlük kaydı hazır</span>
          ) : null}
        </div>
        {m.journal && !m.streaming && <JournalEntryCard initial={m.journal} messageId={m.id} />}
        <div className="text-[10px] text-muted-foreground mt-0.5">{fmtTime(m.created_at)}</div>
      </div>
    </div>
  );
}

function UsageMeter({ count }: { count: number }) {
  const pct = Math.min(100, (count / FREE_LIMIT) * 100);
  const color = count <= 35 ? "var(--sage)" : count <= 45 ? "var(--saffron)" : "var(--hred)";
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
        <div className="h-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span>
        {count} / {FREE_LIMIT} mesaj
      </span>
    </div>
  );
}

export function FarmerAIChat() {
  const userId = useAuthUserId();
  const { data: profile } = useProfile();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const [open, setOpen] = useState(false);
  const [tier, setTier] = useState<"free" | "premium">("free");
  const [showCoach, setShowCoach] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [sessions, setSessions] = useState<{ sessionId: string; preview: string; date: string }[]>(
    [],
  );
  const [draft, setDraft] = useState("");
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [softWarnDismissed, setSoftWarnDismissed] = useState(false);
  const listEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const profileCtx = useMemo(
    () => (profile ? { name: profile.name, city: profile.city, tier } : null),
    [profile, tier],
  );

  const chat = useAIChat({ userId, pathname, profile: profileCtx });

  // Fetch tier whenever userId is known
  useEffect(() => {
    if (!userId) return;
    fetchTier(userId)
      .then(setTier)
      .catch(() => {});
  }, [userId]);

  // Coach mark
  useEffect(() => {
    if (!userId) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem(COACH_KEY) === "1") return;
    hasAnyMessage(userId)
      .then((has) => {
        if (!has) setShowCoach(true);
      })
      .catch(() => {});
  }, [userId]);

  // Online detection
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Load on open
  useEffect(() => {
    if (open && userId) {
      chat.loadLatestSession();
      chat.loadUsage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId, tier]);

  // Auto-scroll
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages.length, chat.messages[chat.messages.length - 1]?.content]);

  // Focus input on open
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 200);
  }, [open]);

  // Deeplink: external trigger to open chat with optional prefill
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { prefill?: string } | undefined;
      setOpen(true);
      if (detail?.prefill) setDraft(detail.prefill);
      setTimeout(() => inputRef.current?.focus(), 250);
    };
    window.addEventListener("hasat:ai-chat:open", handler as EventListener);
    return () => window.removeEventListener("hasat:ai-chat:open", handler as EventListener);
  }, []);

  const dismissCoach = () => {
    setShowCoach(false);
    if (typeof window !== "undefined") localStorage.setItem(COACH_KEY, "1");
  };

  const openPanel = () => {
    dismissCoach();
    setOpen(true);
  };

  const openHistory = async () => {
    if (!userId) return;
    const list = await fetchSessionsList(userId);
    setSessions(list);
    setHistoryOpen(true);
  };

  const freeLimited = tier === "free" && chat.usageCount >= FREE_LIMIT;
  const premiumLimited = tier === "premium" && chat.usageCount >= PREMIUM_LIMIT;
  const limited = freeLimited || premiumLimited || chat.limitReached;
  const showSoftWarn =
    tier === "free" &&
    !freeLimited &&
    !softWarnDismissed &&
    chat.usageCount >= SOFT_WARN_THRESHOLD &&
    chat.usageCount < FREE_LIMIT;
  const remainingFree = Math.max(0, FREE_LIMIT - chat.usageCount);
  const inputDisabled = !online || limited || chat.sending;

  const submit = () => {
    const t = draft.trim();
    if (!t) return;
    setDraft("");
    chat.send(t);
  };

  if (!userId) return null;

  return (
    <>
      {/* FAB */}
      {!open && (
        <button
          type="button"
          onClick={openPanel}
          aria-label="Hasat AI ile sohbet et"
          className="fixed z-50 grid place-items-center rounded-full shadow-lg transition active:scale-95"
          style={{
            background: "var(--primary)",
            color: "white",
            width: 56,
            height: 56,
            right: 16,
            bottom: "calc(56px + max(env(safe-area-inset-bottom), 0.5rem) + 16px)",
          }}
        >
          <Sparkles className="h-6 w-6" />
        </button>
      )}

      {/* Coach mark */}
      {showCoach && !open && (
        <div
          onClick={dismissCoach}
          className="fixed z-50 max-w-[260px] text-xs rounded-xl px-3 py-2 shadow-lg cursor-pointer"
          style={{
            background: "var(--primary)",
            color: "var(--hwhite)",
            right: 16,
            bottom: "calc(56px + env(safe-area-inset-bottom, 0px) + 80px)",
          }}
        >
          Fiyat sor, günlük ekle veya sipariş durumunu öğren — Türkçe yaz, anlayalım ✨
          <span
            className="absolute -bottom-1 right-6 h-2 w-2 rotate-45"
            style={{ background: "var(--primary)" }}
          />
        </div>
      )}

      {/* Panel */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[80vh] p-0 rounded-t-2xl flex flex-col gap-0">
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b">
            <div
              className="grid h-8 w-8 place-items-center rounded-full"
              style={{ background: "var(--primary)", color: "white" }}
            >
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-base font-semibold leading-tight">Hasat AI</div>
              {tier === "free" ? (
                <UsageMeter count={chat.usageCount} />
              ) : (
                <div className="text-[11px] text-muted-foreground">Premium • ayda 500 mesaj</div>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={openHistory}
              aria-label="Geçmiş Sohbetler"
              className="min-h-[48px] min-w-[48px]"
            >
              <History className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={chat.newSession}
              aria-label="Yeni Sohbet"
              className="min-h-[48px] min-w-[48px]"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline ml-1 text-xs">Yeni</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              aria-label="Kapat"
              className="min-h-[48px] min-w-[48px]"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* WhatsApp secondary entry */}
          <a
            href={`https://wa.me/${HASAT_WHATSAPP_NUMBER}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] text-muted-foreground hover:bg-muted/40 border-b"
          >
            <MessageCircle className="h-3.5 w-3.5" style={{ color: "var(--whatsapp)" }} />
            <span>WhatsApp'tan da yazabilirsin →</span>
          </a>

          {/* Message list */}
          <div
            className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
            style={{ background: "color-mix(in oklab, var(--hwhite) 50%, white)" }}
          >
            {chat.loading && chat.messages.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">Yükleniyor…</div>
            ) : chat.messages.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                Hasat AI'ye soru sor — fiyat, pazar önerisi, günlük kaydı veya ürün önerisi.
              </div>
            ) : (
              chat.messages.map((m) => <MessageBubble key={m.id} m={m} />)
            )}
            {chat.error && (
              <div className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
                {chat.error}
              </div>
            )}
            <div ref={listEndRef} />
          </div>

          {/* Input */}
          <div
            className="border-t px-3 py-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] space-y-2"
            style={{ background: "white" }}
          >
            {showSoftWarn && (
              <div className="flex items-start gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs">
                <span className="flex-1 text-foreground/80">
                  {remainingFree} mesajın kaldı — ay sonunda sıfırlanacak.{" "}
                  <button
                    type="button"
                    onClick={() => setUpgradeOpen(true)}
                    className="underline font-medium"
                    style={{ color: "var(--saffron)" }}
                  >
                    Sınırsız sohbet için Premium'a geç →
                  </button>
                </span>
                <button
                  type="button"
                  onClick={() => setSoftWarnDismissed(true)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Kapat"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {!online && !limited ? (
              <div className="text-xs text-center py-2 text-muted-foreground">Bağlantı yok</div>
            ) : (
              <div className="flex items-end gap-2">
                <Textarea
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  disabled={inputDisabled}
                  placeholder={
                    limited ? "Taslağın burada kalıyor — kopyalayabilirsin" : "Mesaj yaz…"
                  }
                  rows={1}
                  className="min-h-[40px] max-h-32 resize-none"
                />
                <Button
                  onClick={submit}
                  disabled={inputDisabled || !draft.trim()}
                  size="icon"
                  style={{ background: "var(--primary)", color: "white" }}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            )}

            {limited && (
              <div className="rounded-md bg-muted px-3 py-3 space-y-3 text-sm">
                {freeLimited ? (
                  <>
                    <div className="text-foreground">
                      Bu ay için {FREE_LIMIT} mesaj hakkını kullandın.
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Kotan {nextMonthResetLabel()} sıfırlanacak.
                      </div>
                    </div>
                    <Button
                      onClick={() => setUpgradeOpen(true)}
                      className="w-full"
                      style={{ background: "var(--saffron)", color: "white" }}
                    >
                      Premium'a geç — ₺149/ay, ayda 500 mesaj
                    </Button>
                    <div className="text-xs text-muted-foreground text-center">
                      Acil bir konu mu var?{" "}
                      <a
                        href={`https://wa.me/${HASAT_WHATSAPP_NUMBER}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        İnsan desteğine WhatsApp'tan yazabilirsin
                      </a>
                    </div>
                  </>
                ) : premiumLimited ? (
                  <>
                    <div className="text-foreground">
                      Bu ay {PREMIUM_LIMIT} mesaj sınırına ulaştın — çok yoğun bir ay geçirmiş
                      olmalısın! 🌾
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Kotan {nextMonthResetLabel()} sıfırlanacak.
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground text-center">
                      Acil bir konu mu var?{" "}
                      <a
                        href={`https://wa.me/${HASAT_WHATSAPP_NUMBER}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        İnsan desteğine WhatsApp'tan yazabilirsin
                      </a>
                    </div>
                  </>
                ) : (
                  <div className="text-foreground">
                    Mesaj limitine ulaştınız.{" "}
                    <button
                      type="button"
                      onClick={() => setUpgradeOpen(true)}
                      className="underline font-medium"
                      style={{ color: "var(--saffron)" }}
                    >
                      Premium'a geç →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* History sheet */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="bottom" className="h-[70vh] p-0 rounded-t-2xl flex flex-col">
          <div className="flex items-center gap-2 px-4 py-3 border-b">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setHistoryOpen(false)}
              aria-label="Geri"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="font-serif">Geçmiş Sohbetler</div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {sessions.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                Henüz sohbet yok.
              </div>
            ) : (
              sessions.map((s) => (
                <button
                  key={s.sessionId}
                  className="w-full text-left px-4 py-3 border-b hover:bg-muted/50"
                  onClick={() => {
                    chat.loadSession(s.sessionId);
                    setHistoryOpen(false);
                  }}
                >
                  <div className="text-xs text-muted-foreground">{fmtDate(s.date)}</div>
                  <div className="text-sm line-clamp-2">{s.preview}</div>
                </button>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </>
  );
}
