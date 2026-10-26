import { BadRequestException } from '@nestjs/common';

export const PAYOUT_METHODS = ['bank', 'mobile_money'] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

/** "FR76 •••• 1234" - enough for the owner to recognise it, nothing a colleague could use. */
export function maskAccount(account: string | null | undefined): string | null {
  const a = String(account ?? '').replace(/\s+/g, ' ').trim();
  if (!a) return null;
  if (a.length <= 6) return '••••';
  return `${a.slice(0, 2)} •••• ${a.slice(-4)}`;
}

export function cleanPayoutAccount(input: { method?: unknown; account?: unknown }): { method: PayoutMethod; account: string } {
  const method = String(input?.method ?? '');
  if (!(PAYOUT_METHODS as readonly string[]).includes(method)) throw new BadRequestException('Choose bank or mobile money.');
  const account = String(input?.account ?? '').trim();
  if (account.length < 5 || account.length > 250) {
    throw new BadRequestException(method === 'bank' ? 'Enter your bank account (holder and IBAN / account number).' : 'Enter the mobile-money number to pay.');
  }
  return { method: method as PayoutMethod, account };
}
