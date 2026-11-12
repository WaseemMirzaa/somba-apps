/** Old customer <-> seller chats, read-only for KOMORIKO support (`chat:adminList`, `chat:adminMessages`; docs/contracts/admin-controls.md §3). */

import type { TextI18n } from "@/lib/text-i18n";
import type { ChatMessage } from "@/lib/shop-engage";

export interface AdminConversation {
  id: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  storeName: string;
  storeLogo: string | null;
  productId: string | null;
  productName: string | null;
  productNameFr?: string | null;
  productImage: string | null;
  orderId: string | null;
  orderReference: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageI18n?: TextI18n | null;
  messageCount: number;
}

export interface AdminChatThread {
  conversation: AdminConversation;
  /** Oldest first. */
  messages: ChatMessage[];
  hasMore: boolean;
}

export const CHAT_PAGE = 50;

/** The request body of `chat:adminList` for a search box and a page offset. */
export function chatListBody(q: string, offset: number): { q?: string; limit: number; offset: number } {
  const query = q.trim();
  return { ...(query ? { q: query } : {}), limit: CHAT_PAGE, offset };
}

/** Older messages are asked with `before` = the id of the oldest one already shown. */
export function chatOlderBody(conversationId: string, messages: { id: string }[]): { conversationId: string; before?: string; limit: number } {
  return { conversationId, ...(messages.length ? { before: messages[0].id } : {}), limit: CHAT_PAGE };
}

/** Merge a page of older messages (oldest first) in front of what is shown, without duplicates. */
export function prependOlder<T extends { id: string }>(shown: T[], older: T[]): T[] {
  const have = new Set(shown.map((m) => m.id));
  return [...older.filter((m) => !have.has(m.id)), ...shown];
}
