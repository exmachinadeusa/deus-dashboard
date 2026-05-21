// src/types/session.ts
// Telegram session veri tipi

export interface SessionData {
  step: string | null;
  data: Record<string, unknown>;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  siteId: string;
}
