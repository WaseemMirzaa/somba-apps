/** The audit log's filter form and the `audit:list` request it makes (the server filters and pages; nothing is cut here). */
export interface AuditFilters {
  action: string;
  actor: string;
  role: string;
  q: string;
  /** `YYYY-MM-DD` from a date input; the server reads a bare "to" as the whole day. */
  from: string;
  to: string;
}

export const EMPTY_AUDIT_FILTERS: AuditFilters = { action: "", actor: "", role: "", q: "", from: "", to: "" };

export const AUDIT_PAGE_SIZE = 50;

export function hasAuditFilters(f: AuditFilters): boolean {
  return Object.values(f).some((v) => v.trim() !== "");
}

/** The request body: only the filters that are filled in, plus the page. */
export function auditRequest(f: AuditFilters, offset = 0, limit = AUDIT_PAGE_SIZE): Record<string, unknown> {
  const body: Record<string, unknown> = { limit, offset };
  for (const [k, v] of Object.entries(f)) if (v.trim() !== "") body[k] = v.trim();
  return body;
}

/** A date range the wrong way round would only come back as a server error; say so before asking. */
export function auditRangeError(f: AuditFilters, fr: boolean): string | null {
  if (f.from && f.to && f.from > f.to) return fr ? "La date de début est après la date de fin." : "The start date is after the end date.";
  return null;
}
