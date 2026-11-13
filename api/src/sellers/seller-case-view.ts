import { firstName } from '../common/attachments';
import type { TextI18n } from '../translation/translation.service';
import type { CaseKind } from '../database/entities/case-seller-message.entity';

/**
 * What a store sees of a return, exchange or replacement on its goods (docs/contracts/admin-controls.md §13): the customer's FIRST
 * NAME only (no id, phone, e-mail or address), the order reference, what was ordered, the reason and photos, where the case stands,
 * the money effect and support's decision note. NEVER the customer <-> support thread. Read-only: support decides everything.
 */
export interface SellerCaseItem {
  name: string;
  nameFr: string | null;
  variant: string | null;
  variantFr: string | null;
  qty: number;
}

export interface SellerCaseStep {
  key: string;
  done: boolean;
  at: Date | string | null;
}

export interface SellerCaseView {
  /** Always true: tells a seller-portal client this is the store's redacted view (the same event names also carry the owner's own purchases). */
  sellerView: true;
  kind: CaseKind;
  id: string;
  reference: string;
  orderId: string;
  orderReference: string;
  customerFirstName: string;
  status: string;
  /** Returns only: the stage (`awaiting_support`, `approved`, `pickup`, `received`, `closed`, ...). */
  stage: string | null;
  category: string | null;
  reason: string | null;
  reasonI18n?: TextI18n;
  attachments: string[];
  items: SellerCaseItem[];
  /** Support's decision note (a refusal reason, an approval note): `resolution` for a return, the decision note for an exchange / replacement. */
  decisionNote: string | null;
  decisionNoteFr: string | null;
  decisionNoteI18n?: TextI18n;
  /** Returns: money back to the customer. */
  refundUsd: number | null;
  /** Exchanges: price difference (negative = refunded to the customer's wallet). */
  priceDiffUsd: number | null;
  /** Replacements and exchanges: where the new unit is (dispatch status). */
  dispatchStatus: string | null;
  timeline: SellerCaseStep[];
  /** Returns: status of the pickup from the customer and of the leg that brings the goods back to the store. */
  legs: { pickup: string | null; returnToSeller: string | null } | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  /** Messages from support the store has not read yet (filled by the service). */
  unread: number;
}

type Any = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const n = (v: unknown): number | null => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const when = (v: unknown): Date | string | null => (v ? (v as Date | string) : null);

const EXCHANGE_FLOW = ['requested', 'approved', 'received', 'ready', 'dispatched', 'delivered'];
const REPLACEMENT_FLOW = ['requested', 'approved', 'received', 'allocated', 'dispatched', 'delivered'];

function flowSteps(flow: string[], status: string, v: Any): SellerCaseStep[] {
  const idx = flow.indexOf(status);
  if (status === 'rejected') {
    return [
      { key: 'requested', done: true, at: when(v.createdAt) },
      { key: 'rejected', done: true, at: when(v.sellerRespondedAt) ?? when(v.updatedAt) },
    ];
  }
  return flow.map((key, i) => ({
    key,
    done: i <= idx,
    at: key === 'requested' ? when(v.createdAt) : key === 'approved' ? when(v.sellerRespondedAt) : key === 'delivered' ? when(v.deliveredAt) : null,
  }));
}

function returnSteps(v: Any): SellerCaseStep[] {
  const stage = String(v.stage ?? '');
  const closed = String(v.status ?? '') !== 'open';
  const refused = String(v.status ?? '') === 'rejected';
  if (refused) {
    return [
      { key: 'opened', done: true, at: when(v.createdAt) },
      { key: 'refused', done: true, at: when(v.updatedAt) },
    ];
  }
  const past = (...stages: string[]) => closed || stages.includes(stage);
  return [
    { key: 'opened', done: true, at: when(v.createdAt) },
    { key: 'approved', done: past('approved', 'pickup', 'received'), at: null },
    { key: 'pickup', done: past('pickup', 'received'), at: null },
    { key: 'received', done: closed || stage === 'received' || !!v.receivedAt, at: when(v.receivedAt) },
    { key: 'closed', done: closed, at: closed ? when(v.updatedAt) : null },
  ];
}

const base = (kind: CaseKind, v: Any) => ({
  sellerView: true as const,
  kind,
  id: String(v.id),
  reference: String(v.reference ?? ''),
  orderId: String(v.orderId ?? ''),
  orderReference: String(v.orderReference ?? ''),
  customerFirstName: firstName(String(v.customerName ?? '')),
  status: String(v.status ?? ''),
  attachments: Array.isArray(v.attachments) ? (v.attachments as string[]) : [],
  createdAt: v.createdAt as Date | string,
  updatedAt: v.updatedAt as Date | string,
  unread: 0,
});

/** A return as the store sees it. `legs` is filled by the service (delivery tasks). */
export function redactReturn(v: Any): SellerCaseView {
  const items = (Array.isArray(v.items) ? v.items : []) as Any[];
  return {
    ...base('return', v),
    stage: s(v.stage),
    category: s(v.category),
    reason: s(v.reason),
    ...(v.reasonI18n ? { reasonI18n: v.reasonI18n as TextI18n } : {}),
    items: items.map((i) => ({ name: String(i.productName ?? ''), nameFr: s(i.productNameFr), variant: s(i.variant), variantFr: s(i.variantFr), qty: Number(i.qty) || 0 })),
    decisionNote: s(v.resolution),
    decisionNoteFr: s(v.resolutionFr),
    ...(v.resolutionI18n ? { decisionNoteI18n: v.resolutionI18n as TextI18n } : {}),
    refundUsd: n(v.refundUsd),
    priceDiffUsd: null,
    dispatchStatus: null,
    timeline: returnSteps(v),
    legs: null,
  };
}

export function redactExchange(v: Any): SellerCaseView {
  const status = String(v.status ?? '');
  return {
    ...base('exchange', v),
    stage: null,
    category: null,
    reason: s(v.reason),
    ...(v.reasonI18n ? { reasonI18n: v.reasonI18n as TextI18n } : {}),
    // The item that goes back and the item that goes out.
    items: [
      { name: String(v.fromName ?? ''), nameFr: s(v.fromNameFr), variant: s(v.fromVariant), variantFr: null, qty: Number(v.qty) || 1 },
      { name: String(v.toName ?? ''), nameFr: s(v.toNameFr), variant: s(v.toVariant), variantFr: null, qty: Number(v.qty) || 1 },
    ],
    decisionNote: s(v.sellerReason),
    decisionNoteFr: null,
    ...(v.sellerReasonI18n ? { decisionNoteI18n: v.sellerReasonI18n as TextI18n } : {}),
    refundUsd: null,
    priceDiffUsd: n(v.priceDiffUsd),
    dispatchStatus: null,
    timeline: flowSteps(EXCHANGE_FLOW, status, v),
    legs: null,
  };
}

export function redactReplacement(v: Any): SellerCaseView {
  const status = String(v.status ?? '');
  return {
    ...base('replacement', v),
    stage: null,
    category: s(v.condition),
    reason: s(v.reason),
    ...(v.reasonI18n ? { reasonI18n: v.reasonI18n as TextI18n } : {}),
    items: [{ name: String(v.productName ?? ''), nameFr: s(v.productNameFr), variant: s(v.variant), variantFr: null, qty: Number(v.qty) || 1 }],
    decisionNote: s(v.sellerReason),
    decisionNoteFr: null,
    ...(v.sellerReasonI18n ? { decisionNoteI18n: v.sellerReasonI18n as TextI18n } : {}),
    refundUsd: null,
    priceDiffUsd: null,
    dispatchStatus: s(v.dispatchStatus),
    timeline: flowSteps(REPLACEMENT_FLOW, status, v),
    legs: null,
  };
}

export const redactCase = (kind: CaseKind, v: Any): SellerCaseView => (kind === 'return' ? redactReturn(v) : kind === 'exchange' ? redactExchange(v) : redactReplacement(v));

/** The reference-led line every notice about a case carries: `RET-… · SOM-…`. */
export const caseLine = (v: { reference?: string | null; orderReference?: string | null }) => `${v.reference ?? ''} · ${v.orderReference ?? ''}`;
