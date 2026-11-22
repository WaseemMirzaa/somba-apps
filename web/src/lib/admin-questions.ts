import type { TextI18n } from "@/lib/text-i18n";

/** Server group QUESTION_READERS (api/src/content/reviews.service.ts): who opens the admin Q&A pages. */
export const canReadQuestions = (role: string): boolean =>
  role === "admin" || role === "admin_operations" || role === "admin_moderation" || role === "admin_support";

/** Server rule MODERATORS: who may answer. Support reads only. */
export const canAnswerQuestions = (role: string): boolean =>
  role === "admin" || role === "admin_operations" || role === "admin_moderation";

export interface AdminQuestion {
  id: string;
  productId: string;
  askedBy: string;
  customerName: string;
  sellerId: string | null;
  storeName: string;
  productName: string;
  productNameFr: string;
  productImage: string | null;
  question: string;
  answer: string | null;
  answeredBy: string | null;
  answeredAt: string | null;
  createdAt: string;
  status: "answered" | "unanswered";
  questionI18n?: TextI18n;
  answerI18n?: TextI18n;
}

export interface AdminQuestionPage {
  items: AdminQuestion[];
  total: number;
  nextCursor: string | null;
}

export type QuestionStatusTab = "unanswered" | "answered" | "all";

/** The product's name in the viewer's language, falling back to the other one, then to the id. Null-safe. */
export function questionProductName(q: Pick<AdminQuestion, "productName" | "productNameFr" | "productId">, fr: boolean): string {
  const a = fr ? q.productNameFr : q.productName;
  const b = fr ? q.productName : q.productNameFr;
  return (a || b || "").trim() || String(q.productId ?? "").slice(0, 8);
}
