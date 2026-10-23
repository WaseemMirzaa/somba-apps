import { Logger } from '@nestjs/common';
import { createHash, createPublicKey, randomUUID, verify, type KeyObject } from 'crypto';
import {
  InitiationUncertainError,
  type MobileMoneyCharge,
  type MobileMoneyEvent,
  type MobileMoneyMethod,
  type MobileMoneyProvider,
  type WebhookRequest,
} from './mobile-money.provider';

/**
 * pawaPay (v2) — mobile-money collections, refunds to the payer's phone and payouts in the DRC.
 * Docs: https://docs.pawapay.io/v2/docs. Configure with:
 *   MM_PROVIDER=pawapay, PAWAPAY_API_TOKEN, PAWAPAY_BASE_URL (sandbox by default), PAWAPAY_CURRENCY (USD | CDF),
 *   PAWAPAY_FX_RATE (CDF per USD, only for CDF), PAWAPAY_VERIFY_SIGNATURES (on in production).
 * Every callback is confirmed with a status check before money moves, so a forged callback can do nothing.
 */

/** Injection token for the shared client (null unless MM_PROVIDER=pawapay and a token is set). */
export const PAWAPAY_CLIENT = Symbol('PAWAPAY_CLIENT');

/** Our networks → pawaPay provider codes in the DRC. */
export const PAWAPAY_PROVIDERS: Record<MobileMoneyMethod, string> = {
  airtel_money: 'AIRTEL_COD',
  orange_money: 'ORANGE_COD',
  vodacom_mpesa: 'VODACOM_MPESA_COD',
};

export const SANDBOX_BASE_URL = 'https://api.sandbox.pawapay.io';
export const PRODUCTION_BASE_URL = 'https://api.pawapay.io';

export type PawapayKind = 'deposits' | 'refunds' | 'payouts';

export interface PawapayConfig {
  token: string;
  baseUrl?: string;
  currency?: string;
  /** CDF per USD when charging in CDF. */
  fxRate?: number;
  verifySignatures?: boolean;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/** A pawaPay request that could not be answered: the operation may or may not exist on their side. */
export class PawapayUnavailableError extends Error {}

/** pawaPay said no (REJECTED): the message is safe to show to staff. */
export class PawapayRejectedError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

/** Where a deposit, refund or payout stands on pawaPay's side. */
export interface PawapayStatus {
  found: boolean;
  /** ACCEPTED | ENQUEUED | PROCESSING | IN_RECONCILIATION | COMPLETED | FAILED */
  status?: string;
  final: boolean;
  succeeded: boolean;
  amountUsd?: number;
  providerTransactionId?: string;
  failureMessage?: string;
  clientReferenceId?: string;
}

export class PawapayClient {
  private readonly logger = new Logger('pawaPay');
  readonly baseUrl: string;
  readonly currency: string;
  private readonly fxRate: number;
  readonly verifySignatures: boolean;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private keys: { at: number; byId: Map<string, KeyObject> } | null = null;

  constructor(private readonly cfg: PawapayConfig) {
    this.baseUrl = (cfg.baseUrl || SANDBOX_BASE_URL).replace(/\/+$/, '');
    this.currency = (cfg.currency || 'USD').toUpperCase();
    this.fxRate = cfg.fxRate && cfg.fxRate > 0 ? cfg.fxRate : 0;
    if (this.currency !== 'USD' && !this.fxRate) throw new Error(`PAWAPAY_FX_RATE is required to charge in ${this.currency}.`);
    this.verifySignatures = cfg.verifySignatures ?? false;
    this.fetchImpl = cfg.fetchImpl ?? fetch;
    this.now = cfg.now ?? Date.now;
  }

  /** "12.5", "12", "0.75": pawaPay refuses trailing zeros. CDF has no decimals. */
  formatAmount(usd: number): string {
    if (this.currency === 'USD') return String(Number(usd.toFixed(2)));
    return String(Math.round(usd * this.fxRate));
  }

  toUsd(amount: string | number | undefined, currency?: string): number | undefined {
    const n = Number(amount);
    if (!Number.isFinite(n)) return undefined;
    const cur = (currency || this.currency).toUpperCase();
    return cur === 'USD' ? n : this.fxRate ? Number((n / this.fxRate).toFixed(2)) : undefined;
  }

  /** "+243 81 234 5678" / "0812345678" → "243812345678" (digits, country code, no leading zero). */
  static msisdn(phone: string): string {
    let d = String(phone ?? '').replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('0')) d = `243${d.slice(1)}`;
    else if (d.length === 9) d = `243${d}`;
    return d;
  }

  private async call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ http: number; json: Record<string, unknown> }> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: { authorization: `Bearer ${this.cfg.token}`, 'content-type': 'application/json', accept: 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      throw new PawapayUnavailableError(`pawaPay unreachable: ${(e as Error).message}`);
    }
    let json: Record<string, unknown> = {};
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      /* empty or non-JSON body */
    }
    if (res.status >= 500) throw new PawapayUnavailableError(`pawaPay error ${res.status}`);
    return { http: res.status, json };
  }

  private static failure(json: Record<string, unknown>): { code: string; message: string } {
    const f = (json.failureReason ?? {}) as { failureCode?: string; failureMessage?: string };
    return { code: f.failureCode ?? 'UNKNOWN_ERROR', message: f.failureMessage ?? 'Rejected by pawaPay.' };
  }

  /** Create a deposit, refund or payout. ACCEPTED and DUPLICATE_IGNORED (a retry of ours) both mean "in progress". */
  private async create(kind: PawapayKind, body: Record<string, unknown>): Promise<void> {
    const { http, json } = await this.call('POST', `/v2/${kind}`, body);
    const status = String(json.status ?? '');
    if (http === 200 && (status === 'ACCEPTED' || status === 'DUPLICATE_IGNORED')) return;
    const f = PawapayClient.failure(json);
    throw new PawapayRejectedError(f.message, f.code);
  }

  async deposit(input: { depositId: string; amountUsd: number; phone: string; provider: string; reference: string }): Promise<void> {
    await this.create('deposits', {
      depositId: input.depositId,
      amount: this.formatAmount(input.amountUsd),
      currency: this.currency,
      payer: { type: 'MMO', accountDetails: { phoneNumber: PawapayClient.msisdn(input.phone), provider: input.provider } },
      clientReferenceId: input.reference,
      customerMessage: 'Somba Teka',
    });
  }

  async refund(input: { refundId: string; depositId: string; amountUsd: number; reference: string }): Promise<void> {
    await this.create('refunds', {
      refundId: input.refundId,
      depositId: input.depositId,
      amount: this.formatAmount(input.amountUsd),
      currency: this.currency,
      clientReferenceId: input.reference,
    });
  }

  async payout(input: { payoutId: string; amountUsd: number; phone: string; provider: string; reference: string }): Promise<void> {
    await this.create('payouts', {
      payoutId: input.payoutId,
      amount: this.formatAmount(input.amountUsd),
      currency: this.currency,
      recipient: { type: 'MMO', accountDetails: { phoneNumber: PawapayClient.msisdn(input.phone), provider: input.provider } },
      clientReferenceId: input.reference,
      customerMessage: 'Somba Teka payout',
    });
  }

  /** The mobile-money provider of a number (for seller payouts, which store only the number). */
  async predictProvider(phone: string): Promise<string> {
    const { http, json } = await this.call('POST', '/v2/predict-provider', { phoneNumber: PawapayClient.msisdn(phone) });
    if (http !== 200 || typeof json.provider !== 'string') throw new PawapayRejectedError('pawaPay could not tell the network of this number.', 'INVALID_PHONE_NUMBER');
    return json.provider;
  }

  async check(kind: PawapayKind, id: string): Promise<PawapayStatus> {
    const { http, json } = await this.call('GET', `/v2/${kind}/${encodeURIComponent(id)}`);
    if (http !== 200 || json.status !== 'FOUND' || !json.data) return { found: false, final: false, succeeded: false };
    const d = json.data as Record<string, unknown>;
    const status = String(d.status ?? '');
    const f = (d.failureReason ?? {}) as { failureMessage?: string };
    return {
      found: true,
      status,
      final: status === 'COMPLETED' || status === 'FAILED',
      succeeded: status === 'COMPLETED',
      amountUsd: this.toUsd(d.amount as string, d.currency as string),
      providerTransactionId: typeof d.providerTransactionId === 'string' ? d.providerTransactionId : undefined,
      failureMessage: f.failureMessage,
      clientReferenceId: typeof d.clientReferenceId === 'string' ? d.clientReferenceId : undefined,
    };
  }

  /** Which operation a callback is about (the body carries depositId, refundId or payoutId). */
  static callbackTarget(rawBody: Buffer): { kind: PawapayKind; id: string } {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    } catch {
      throw new Error('Callback body is not JSON.');
    }
    const data = (body.data && typeof body.data === 'object' ? body.data : body) as Record<string, unknown>;
    for (const [field, kind] of [['depositId', 'deposits'], ['refundId', 'refunds'], ['payoutId', 'payouts']] as const) {
      const v = data[field];
      if (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)) return { kind, id: v };
    }
    throw new Error('Callback names no deposit, refund or payout.');
  }

  /** pawaPay's public keys (cached for an hour). */
  private async publicKeys(): Promise<Map<string, KeyObject>> {
    if (this.keys && this.now() - this.keys.at < 3_600_000) return this.keys.byId;
    const { http, json } = await this.call('GET', '/v2/public-key/http');
    const list = (Array.isArray(json) ? json : Array.isArray((json as { data?: unknown }).data) ? (json as { data: unknown[] }).data : Object.values(json)) as {
      id?: string;
      key?: string;
    }[];
    if (http !== 200 || !list.length) throw new Error('Could not load the pawaPay public keys.');
    const byId = new Map<string, KeyObject>();
    for (const k of list) if (k?.id && k.key) byId.set(k.id, createPublicKey(k.key));
    this.keys = { at: this.now(), byId };
    return byId;
  }

  /**
   * Verify a signed callback (RFC 9421 HTTP message signatures, as pawaPay sends them): the body must match
   * Content-Digest, the signature must not have expired, and it must verify against pawaPay's public key over the
   * covered components. Throws when anything does not match.
   */
  async verifyCallback(rawBody: Buffer, headers: Record<string, string | string[] | undefined>, req: WebhookRequest): Promise<void> {
    const h = (k: string) => {
      const v = headers[k];
      return (Array.isArray(v) ? v[0] : v) ?? '';
    };
    const digest = h('content-digest');
    const m = /^(sha-512|sha-256)=:([^:]+):/.exec(digest.trim());
    if (!m) throw new Error('Missing Content-Digest.');
    const actual = createHash(m[1] === 'sha-512' ? 'sha512' : 'sha256').update(rawBody).digest('base64');
    if (actual !== m[2]) throw new Error('Content-Digest does not match the body.');

    const input = /^\s*([\w-]+)=(\(([^)]*)\)(.*))$/.exec(h('signature-input'));
    if (!input) throw new Error('Missing Signature-Input.');
    const [, label, params, list, rest] = input;
    const sig = new RegExp(`(?:^|,)\\s*${label}=:([^:]+):`).exec(h('signature'));
    if (!sig) throw new Error('Missing Signature.');
    const param = (name: string) => new RegExp(`;${name}=("?)([^";]+)\\1`).exec(rest)?.[2];
    const expires = Number(param('expires'));
    if (Number.isFinite(expires) && this.now() / 1000 > expires + 30) throw new Error('Signature expired.');
    const alg = param('alg') ?? 'ecdsa-p256-sha256';
    if (alg !== 'ecdsa-p256-sha256') throw new Error(`Unsupported signature algorithm ${alg}.`);

    const components = list.match(/"[^"]+"/g)?.map((c) => c.slice(1, -1)) ?? [];
    const value = (c: string): string => {
      if (c === '@method') return req.method.toUpperCase();
      if (c === '@authority') return req.authority.toLowerCase();
      if (c === '@path') return req.path;
      return h(c.toLowerCase()).trim();
    };
    const base = [...components.map((c) => `"${c}": ${value(c)}`), `"@signature-params": ${params}`].join('\n');

    const signature = Buffer.from(sig[1], 'base64');
    const keys = await this.publicKeys();
    const keyid = param('keyid');
    const candidates = keyid && keys.has(keyid) ? [keys.get(keyid)!] : [...keys.values()];
    // RFC 9421 ECDSA signatures are the raw r||s pair (64 bytes for P-256); accept DER too.
    const dsaEncoding = signature.length === 64 ? 'ieee-p1363' : 'der';
    const ok = candidates.some((key) => verify('sha256', Buffer.from(base), { key, dsaEncoding }, signature));
    if (!ok) throw new Error('Signature does not verify.');
  }

  newId(): string {
    return randomUUID();
  }
}

/** Collections through pawaPay deposits (the MobileMoneyProvider the payment state machine uses). */
export class PawapayMobileMoneyProvider implements MobileMoneyProvider {
  readonly name = 'pawapay';
  constructor(readonly client: PawapayClient) {}

  async initiate(charge: MobileMoneyCharge) {
    const depositId = this.client.newId();
    try {
      await this.client.deposit({
        depositId,
        amountUsd: charge.amountUsd,
        phone: charge.phone,
        provider: PAWAPAY_PROVIDERS[charge.network],
        reference: charge.reference,
      });
    } catch (e) {
      // No answer: the deposit may exist; keep the payment pending and let the status check decide.
      if (e instanceof PawapayUnavailableError) throw new InitiationUncertainError(depositId, e.message);
      throw e;
    }
    return { providerRef: depositId };
  }

  /** A callback is only a hint: verify it if signatures are on, then ask pawaPay for the deposit's real status. */
  async parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>, req?: WebhookRequest): Promise<MobileMoneyEvent> {
    if (this.client.verifySignatures) {
      if (!req) throw new Error('Request details are needed to verify the signature.');
      await this.client.verifyCallback(rawBody, headers, req);
    }
    const target = PawapayClient.callbackTarget(rawBody);
    if (target.kind !== 'deposits') throw new Error(`Not a deposit callback (${target.kind}).`);
    const event = await this.checkStatus({ reference: '', providerRef: target.id });
    if (!event) throw new Error('Deposit is not final yet.');
    return event;
  }

  /** Final result of a deposit (null while pawaPay is still processing it). */
  async checkStatus(payment: { reference: string; providerRef: string | null }): Promise<MobileMoneyEvent | null> {
    if (!payment.providerRef) return null;
    const s = await this.client.check('deposits', payment.providerRef);
    if (!s.found) return null;
    if (!s.final) return null;
    return {
      reference: s.clientReferenceId ?? payment.reference,
      providerRef: payment.providerRef,
      outcome: s.succeeded ? 'succeeded' : 'failed',
      amountUsd: s.succeeded ? s.amountUsd : undefined,
      reason: s.succeeded ? undefined : (s.failureMessage ?? 'The payment was not approved.'),
      providerTransactionId: s.providerTransactionId,
    };
  }
}

/** The pawaPay client from the environment (null when MM_PROVIDER is not pawapay or no token is set). */
export function createPawapayClient(): PawapayClient | null {
  if ((process.env.MM_PROVIDER ?? '').toLowerCase() !== 'pawapay') return null;
  const token = process.env.PAWAPAY_API_TOKEN?.trim();
  if (!token) return null;
  const prod = process.env.NODE_ENV === 'production';
  return new PawapayClient({
    token,
    baseUrl: process.env.PAWAPAY_BASE_URL || SANDBOX_BASE_URL,
    currency: process.env.PAWAPAY_CURRENCY || 'USD',
    fxRate: Number(process.env.PAWAPAY_FX_RATE) || undefined,
    verifySignatures: process.env.PAWAPAY_VERIFY_SIGNATURES ? process.env.PAWAPAY_VERIFY_SIGNATURES === 'true' : prod,
  });
}
