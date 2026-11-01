/**
 * KYC and bookkeeping fields a staff member never receives: the owner's identity papers and legal data, where money
 * is sent, and the owner's account id. Everything else about the store (name, status, plan, rating, vacation…) is theirs to see.
 */
export const STAFF_HIDDEN = [
  'legalName',
  'phone',
  'idNumber',
  'rccm',
  'taxNumber',
  'documentUrls',
  'termsAcceptedAt',
  'kycSubmittedAt',
  'payoutMethod',
  'payoutAccountMasked',
  'payoutAccount',
  'goals',
  'userId',
] as const;

/** A copy of a store object without {@link STAFF_HIDDEN}; anything that is not an object is returned as is. */
export function redactForStaff<T>(store: T): T {
  if (!store || typeof store !== 'object' || Array.isArray(store)) return store;
  const copy = { ...(store as Record<string, unknown>) };
  for (const k of STAFF_HIDDEN) delete copy[k];
  return copy as T;
}
