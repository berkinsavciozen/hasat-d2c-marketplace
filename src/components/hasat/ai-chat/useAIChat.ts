import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { parseAssistantContent, type ParsedJournal } from "./parseJournalEntry";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  streaming?: boolean;
  journal?: ParsedJournal | null;
}

interface ProfileCtx { name: string | null; city: string | null; tier: "free" | "premium" }

function hydrateAssistant(m: ChatMessage): ChatMessage {
  if (m.role !== "assistant" || m.streaming) return m;
  const { visibleText, journal } = parseAssistantContent(m.content);
  return { ...m, content: visibleText, journal };
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c: string) =>
    (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16),
  );
}

function ymd(): string { return new Date().toISOString().slice(0, 7); }

async function fetchContextBlock(userId: string): Promise<string> {
  const [entries, listings, offers, parcels] = await Promise.all([
    supabase.from("harvest_entries").select("crop, quantity, unit, quality, harvest_date")
      .eq("farmer_id", userId).order("harvest_date", { ascending: false }).limit(5),
    supabase.from("listings").select("crop, quantity, price_per_unit, unit")
      .eq("farmer_id", userId).eq("status", "active").limit(10),
    supabase.from("offers").select("id, created_at, status, listing_id")
      .eq("status", "pending").order("created_at", { ascending: true }),
    supabase.from("parcels").select("id, name").eq("farmer_id", userId),
  ]);

  const e = entries.data ?? [];
  const l = listings.data ?? [];
  const o = offers.data ?? [];
  const p = parcels.data ?? [];

  const lines: string[] = [];
  lines.push("=== Çiftçi Verileri ===");
  lines.push(`Parseller: ${p.length ? p.map((x: any) => `${x.name} (${x.id})`).join(", ") : "yok"}`);
  lines.push(`Son hasatlar (${e.length}): ${e.map((x: any) => `${x.crop} ${x.quantity}${x.unit} kalite:${x.quality} ${x.harvest_date}`).join(" | ") || "yok"}`);
  lines.push(`Aktif ilanlar (${l.length}): ${l.map((x: any) => `${x.crop} ${x.quantity}${x.unit} @ ${x.price_per_unit}TL`).join(" | ") || "yok"}`);
  lines.push(`Bekleyen teklifler: ${o.length}${o.length ? ` (en eski: ${o[0].created_at})` : ""}`);
  return lines.join("\n");
}

function buildSystemPrompt(p: ProfileCtx, page: string, ctx: string): string {
  return `Sen Hasat platformunun AI asistanısın. Hasat, Türk çiftçiler için bir D2C tarım pazaryeri ve çiftçi yönetim platformudur.

Görüşme dili: Türkçe. Her zaman sade, anlaşılır Türkçe kullan. Teknik jargon kullanma.

Çiftçinin adı: ${p.name ?? "—"}, şehri: ${p.city ?? "—"}, üyelik tipi: ${p.tier}.

Mevcut sayfa: ${page}.

Günlük kaydı eklemek isterse bilgileri topla ve cevabına [JOURNAL_ENTRY]{json}[/JOURNAL_ENTRY] bloğu ekle.

Kısa ve net cevaplar ver. Maksimum 3 paragraf.

${ctx}`;
}

export function useAIChat(opts: { userId: string | null; pathname: string; profile: ProfileCtx | null }) {
  const { userId, pathname, profile } = opts;
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [usageCount, setUsageCount] = useState<number>(0);
  const [limitReached, setLimitReached] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctxInjectedRef = useRef<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  const loadLatestSession = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data: latest } = await supabase
        .from("ai_chat_messages")
        .select("session_id, created_at")
        .eq("user_id", userId).eq("source", "in_app")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (latest?.session_id) {
        setSessionId(latest.session_id);
        const { data: msgs } = await supabase
          .from("ai_chat_messages")
          .select("id, role, content, created_at")
          .eq("session_id", latest.session_id)
          .order("created_at", { ascending: true });
        setMessages((msgs ?? []) as ChatMessage[]);
      } else {
        setSessionId(uuid());
        setMessages([]);
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const loadUsage = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from("ai_usage_tracking")
      .select("message_count").eq("user_id", userId).eq("month", ymd()).maybeSingle();
    setUsageCount(data?.message_count ?? 0);
  }, [userId]);

  const newSession = useCallback(() => {
    abortRef.current?.abort();
    setSessionId(uuid());
    setMessages([]);
    setError(null);
    setLimitReached(false);
  }, []);

  const loadSession = useCallback(async (sid: string) => {
    setSessionId(sid);
    setLoading(true);
    try {
      const { data } = await supabase.from("ai_chat_messages")
        .select("id, role, content, created_at")
        .eq("session_id", sid).order("created_at", { ascending: true });
      setMessages((data ?? []) as ChatMessage[]);
    } finally { setLoading(false); }
  }, []);

  const send = useCallback(async (text: string) => {
    if (!userId || !sessionId || !profile || !text.trim() || sending) return;
    setError(null);

    // Gate
    const { data: canSend, error: rpcErr } = await supabase.rpc("can_send_ai_message", { _user_id: userId });
    if (rpcErr) { setError("Bir sorun oluştu, tekrar deneyin."); return; }
    if (!canSend) { setLimitReached(true); return; }

    setSending(true);
    const now = new Date().toISOString();
    const userMsg: ChatMessage = { id: uuid(), role: "user", content: text, created_at: now };

    // Insert user row
    const { error: insErr } = await supabase.from("ai_chat_messages").insert({
      user_id: userId, session_id: sessionId, role: "user", content: text,
      source: "in_app", page_context: pathname, metadata: {},
    });
    if (insErr) { setError("Mesaj kaydedilemedi."); setSending(false); return; }

    setMessages((m) => [...m, userMsg]);

    // Streaming bubble placeholder
    const asstId = uuid();
    setMessages((m) => [...m, { id: asstId, role: "assistant", content: "", created_at: new Date().toISOString(), streaming: true }]);

    // Build payload
    const recent = [...messages, userMsg].slice(-10).map((m) => ({ role: m.role, content: m.content }));
    let ctxBlock = "";
    if (!ctxInjectedRef.current.has(sessionId)) {
      try { ctxBlock = await fetchContextBlock(userId); } catch { ctxBlock = ""; }
      ctxInjectedRef.current.add(sessionId);
    }
    const systemPrompt = buildSystemPrompt(profile, pathname, ctxBlock);

    const ac = new AbortController();
    abortRef.current = ac;

    let assistantText = "";
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("no_token");

      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat-stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "apikey": SUPABASE_KEY,
        },
        body: JSON.stringify({ messages: recent, systemPrompt }),
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({} as any));
        if (j.error === "credits_exhausted") throw new Error("Krediler tükendi. Lütfen daha sonra tekrar deneyin.");
        if (j.error === "rate_limited") throw new Error("Çok fazla istek. Bir dakika sonra tekrar deneyin.");
        throw new Error("Bir sorun oluştu, tekrar deneyin.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const j = JSON.parse(payload);
            const delta = j?.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta.length) {
              assistantText += delta;
              setMessages((m) => m.map((x) => x.id === asstId ? { ...x, content: assistantText } : x));
            }
          } catch { /* ignore parse errors */ }
        }
      }

      if (!assistantText.trim()) throw new Error("Boş yanıt alındı.");

      // Persist assistant + finalize
      await supabase.from("ai_chat_messages").insert({
        user_id: userId, session_id: sessionId, role: "assistant", content: assistantText,
        source: "in_app", page_context: pathname, metadata: {},
      });
      setMessages((m) => m.map((x) => x.id === asstId ? { ...x, content: assistantText, streaming: false } : x));

      const { data: newCount } = await supabase.rpc("increment_ai_usage", { _user_id: userId });
      if (typeof newCount === "number") setUsageCount(newCount);
    } catch (e: any) {
      setError(e?.message ?? "Bir sorun oluştu, tekrar deneyin.");
      // Remove streaming placeholder
      setMessages((m) => m.filter((x) => x.id !== asstId));
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }, [userId, sessionId, profile, pathname, sending, messages]);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  return {
    sessionId, messages, loading, sending, usageCount, limitReached, error,
    loadLatestSession, loadUsage, newSession, loadSession, setError, send,
  };
}

export async function fetchSessionsList(userId: string) {
  const { data } = await supabase.from("ai_chat_messages")
    .select("session_id, content, created_at, role")
    .eq("user_id", userId).eq("source", "in_app")
    .order("created_at", { ascending: false }).limit(200);
  const seen = new Map<string, { sessionId: string; preview: string; date: string }>();
  for (const r of (data ?? []) as any[]) {
    if (!seen.has(r.session_id)) {
      seen.set(r.session_id, { sessionId: r.session_id, preview: r.content, date: r.created_at });
    } else if (r.role === "user") {
      // prefer earliest user message as preview
      const cur = seen.get(r.session_id)!;
      if (new Date(r.created_at) < new Date(cur.date)) cur.preview = r.content;
    }
  }
  return Array.from(seen.values());
}

export async function hasAnyMessage(userId: string): Promise<boolean> {
  const { count } = await supabase.from("ai_chat_messages")
    .select("id", { head: true, count: "exact" })
    .eq("user_id", userId).limit(1);
  return (count ?? 0) > 0;
}

export async function fetchTier(userId: string): Promise<"free" | "premium"> {
  const { data } = await supabase.from("profiles").select("tier").eq("id", userId).maybeSingle();
  return ((data as any)?.tier === "premium" ? "premium" : "free");
}
