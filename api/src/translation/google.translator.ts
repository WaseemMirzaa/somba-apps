import { Logger } from '@nestjs/common';
import { cert } from 'firebase-admin/app';
import type { Detected, TranslatorProvider } from './translator.provider';

const ENDPOINT = 'https://translation.googleapis.com/language/translate/v2';
/** One call carries at most this many segments / characters (Cloud Translation v2 limits, with headroom). */
export const MAX_SEGMENTS = 100;
export const MAX_CHARS = 25_000;

type Fetch = typeof fetch;

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

/** `FIREBASE_SERVICE_ACCOUNT_JSON` may be raw JSON or base64 of it (same rule as push.service). */
export function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  const text = raw?.trim();
  if (!text) return null;
  try {
    const json = text.startsWith('{') ? text : Buffer.from(text, 'base64').toString('utf8');
    const sa = JSON.parse(json) as Partial<ServiceAccount>;
    return sa.project_id && sa.client_email && sa.private_key ? (sa as ServiceAccount) : null;
  } catch {
    return null;
  }
}

/** Split texts into calls of <= MAX_SEGMENTS segments and <= MAX_CHARS characters (a longer single text goes alone). */
export function batchTexts(texts: string[]): { index: number; text: string }[][] {
  const batches: { index: number; text: string }[][] = [];
  let cur: { index: number; text: string }[] = [];
  let chars = 0;
  texts.forEach((text, index) => {
    if (cur.length && (cur.length >= MAX_SEGMENTS || chars + text.length > MAX_CHARS)) {
      batches.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push({ index, text });
    chars += text.length;
  });
  if (cur.length) batches.push(cur);
  return batches;
}

/**
 * Google Cloud Translation v2 over REST (`format: 'text'`, so nothing is HTML-escaped).
 * Credential: `GOOGLE_TRANSLATE_API_KEY` (server-only key) when set, else an OAuth token minted from the
 * service account in `FIREBASE_SERVICE_ACCOUNT_JSON` (header `x-goog-user-project`).
 */
export class GoogleTranslator implements TranslatorProvider {
  readonly name = 'google' as const;
  readonly enabled = true;
  private readonly logger = new Logger(GoogleTranslator.name);
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly creds: { apiKey?: string; serviceAccount?: ServiceAccount | null },
    private readonly fetchFn: Fetch = (...a: Parameters<typeof fetch>) => fetch(...a),
    private readonly now: () => number = Date.now,
  ) {}

  /** True when a credential of either kind is available. */
  static configured(env: NodeJS.ProcessEnv = process.env): boolean {
    return !!env.GOOGLE_TRANSLATE_API_KEY?.trim() || !!parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): GoogleTranslator {
    return new GoogleTranslator({
      apiKey: env.GOOGLE_TRANSLATE_API_KEY?.trim() || undefined,
      serviceAccount: parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT_JSON),
    });
  }

  private async accessToken(sa: ServiceAccount): Promise<string> {
    if (this.token && this.token.expiresAt - 60_000 > this.now()) return this.token.value;
    const t = await cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }).getAccessToken();
    this.token = { value: t.access_token, expiresAt: this.now() + (t.expires_in ?? 3000) * 1000 };
    return this.token.value;
  }

  private async call(texts: string[], from: string | null, to: string): Promise<{ translatedText: string; detectedSourceLanguage?: string }[]> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    let url = ENDPOINT;
    if (this.creds.apiKey) {
      url += `?key=${encodeURIComponent(this.creds.apiKey)}`;
    } else if (this.creds.serviceAccount) {
      headers.authorization = `Bearer ${await this.accessToken(this.creds.serviceAccount)}`;
      headers['x-goog-user-project'] = this.creds.serviceAccount.project_id;
    } else {
      throw new Error('No translation credential configured.');
    }
    const body: Record<string, unknown> = { q: texts, target: to, format: 'text' };
    if (from) body.source = from;
    const res = await this.fetchFn(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) {
      // Never echo the request (it holds the text and, with a key, the credential): only status + Google's message.
      let detail = '';
      try {
        detail = ((await res.json()) as { error?: { message?: string } })?.error?.message ?? '';
      } catch {
        /* no body */
      }
      this.logger.warn(`Cloud Translation ${res.status}: ${detail.slice(0, 160)}`);
      throw new Error(`Cloud Translation ${res.status}${detail ? `: ${detail.slice(0, 160)}` : ''}`);
    }
    const json = (await res.json()) as { data?: { translations?: { translatedText: string; detectedSourceLanguage?: string }[] } };
    const out = json.data?.translations;
    if (!out || out.length !== texts.length) throw new Error('Cloud Translation returned an unexpected answer.');
    return out;
  }

  async translate(texts: string[], from: string, to: string): Promise<string[]> {
    const result = new Array<string>(texts.length);
    for (const batch of batchTexts(texts)) {
      const out = await this.call(batch.map((b) => b.text), from, to);
      batch.forEach((b, i) => (result[b.index] = out[i].translatedText));
    }
    return result;
  }

  async detect(texts: string[], to: string): Promise<Detected[]> {
    const result = new Array<Detected>(texts.length);
    for (const batch of batchTexts(texts)) {
      const out = await this.call(batch.map((b) => b.text), null, to);
      batch.forEach((b, i) => {
        const lang = (out[i].detectedSourceLanguage ?? 'und').toLowerCase().split('-')[0];
        // Already in the target language: Google hands the text back unchanged.
        result[b.index] = { text: out[i].translatedText, sourceLang: lang };
      });
    }
    return result;
  }
}
