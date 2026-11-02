/**
 * Stripe configuration read from the environment. Pure (no SDK, no I/O), so both the client factory and the public
 * settings view ("is the card option on?") use the SAME rule: card payments switch on only when all three values are
 * present, well-formed and in the same mode. Nothing here ever returns or logs a secret except to the caller that asked
 * for the config itself; the problems it lists name variables, never values.
 */

export type StripeMode = 'test' | 'live';

export interface StripeEnvConfig {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
  mode: StripeMode;
}

export type StripeConfigResult = { ok: true; config: StripeEnvConfig } | { ok: false; problems: string[] };

const SECRET_KEY = /^(sk|rk)_(test|live)_[A-Za-z0-9]{10,}$/;
const PUBLISHABLE_KEY = /^pk_(test|live)_[A-Za-z0-9]{10,}$/;
const WEBHOOK_SECRET = /^whsec_[A-Za-z0-9+/=_-]{16,}$/;

/** `sk_test_…` / `pk_live_…` → 'test' | 'live'. */
export const stripeKeyMode = (key: string): StripeMode | null => (key.includes('_test_') ? 'test' : key.includes('_live_') ? 'live' : null);

/** The last 4 characters, the only part of a key that is ever shown. */
export const last4 = (value: string): string => value.slice(-4);

/** Replace anything in `text` that looks like a Stripe key or webhook secret (and any exact secret given). */
export function scrubSecrets(text: string, exact: string[] = []): string {
  let out = String(text ?? '')
    .replace(/\b(?:sk|rk|pk)_(?:test|live)_[A-Za-z0-9*_]+/g, '[redacted]')
    .replace(/\bwhsec_[A-Za-z0-9+/=_*-]+/g, '[redacted]');
  for (const secret of exact) if (secret && secret.length >= 8) out = out.split(secret).join('[redacted]');
  return out;
}

export function readStripeConfig(env: NodeJS.ProcessEnv = process.env): StripeConfigResult {
  const secretKey = (env.STRIPE_SECRET_KEY ?? '').trim();
  const publishableKey = (env.STRIPE_PUBLISHABLE_KEY ?? '').trim();
  const webhookSecret = (env.STRIPE_WEBHOOK_SECRET ?? '').trim();
  const problems: string[] = [];
  if (!secretKey) problems.push('STRIPE_SECRET_KEY is missing');
  else if (!SECRET_KEY.test(secretKey)) problems.push('STRIPE_SECRET_KEY is malformed (expected sk_/rk_ test|live)');
  if (!publishableKey) problems.push('STRIPE_PUBLISHABLE_KEY is missing');
  else if (!PUBLISHABLE_KEY.test(publishableKey)) problems.push('STRIPE_PUBLISHABLE_KEY is malformed (expected pk_ test|live)');
  if (!webhookSecret) problems.push('STRIPE_WEBHOOK_SECRET is missing');
  else if (!WEBHOOK_SECRET.test(webhookSecret)) problems.push('STRIPE_WEBHOOK_SECRET is malformed (expected whsec_…)');
  if (problems.length) return { ok: false, problems };
  const mode = stripeKeyMode(secretKey)!;
  if (stripeKeyMode(publishableKey) !== mode) {
    return { ok: false, problems: ['STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY are in different modes (test vs live)'] };
  }
  return { ok: true, config: { secretKey, publishableKey, webhookSecret, mode } };
}

/** What the apps are told in the public settings: is the card option on? */
export const cardPaymentsMode = (env: NodeJS.ProcessEnv = process.env): 'stripe' | 'off' => (readStripeConfig(env).ok ? 'stripe' : 'off');
