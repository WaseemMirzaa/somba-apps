import type { Repository } from 'typeorm';
import type { User } from '../database/entities';

export type Locale = 'en' | 'fr';

/** `en` or `fr`, anything else null. */
export const asLocale = (v: unknown): Locale | null => (v === 'fr' || v === 'en' ? v : null);

/**
 * The language of the account that made a request: an explicit `override` (`locale: 'fr'` in the request) when it is a
 * language we speak, else the language saved on the account, else English. Never throws.
 */
export async function callerLocale(users: Pick<Repository<User>, 'findOne'>, userId: string | null | undefined, override?: unknown): Promise<Locale> {
  const asked = asLocale(override);
  if (asked) return asked;
  if (!userId) return 'en';
  try {
    const row = await users.findOne({ where: { id: userId }, select: { id: true, locale: true } });
    return asLocale(row?.locale) ?? 'en';
  } catch {
    return 'en';
  }
}
