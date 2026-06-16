import type { ListFilterValues } from "@/components/ui/list-filters";

export type ListFilterConfig<T> = {
  searchFields?: (keyof T | ((item: T) => string | undefined))[];
  dateField?: keyof T | ((item: T) => string | undefined);
  statusField?: keyof T | ((item: T) => string | undefined);
};

function resolveField<T>(item: T, field: keyof T | ((item: T) => string | undefined)): string {
  const value = typeof field === "function" ? field(item) : item[field];
  return value == null ? "" : String(value);
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  const normalized = value.length >= 10 ? value.slice(0, 10) : value;
  const parsed = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

type TimelineItem = { time?: string; label?: string };

export function timelineRequestDate(item: { timeline?: TimelineItem[] }): string | undefined {
  const event =
    item.timeline?.find(
      (entry) => entry.time && entry.time !== "—" && /requested|return requested/i.test(entry.label ?? "")
    ) ?? item.timeline?.find((entry) => entry.time && entry.time !== "—");
  return event?.time?.slice(0, 10);
}

export function applyListFilters<T>(
  items: T[],
  filters: ListFilterValues,
  config: ListFilterConfig<T> = {}
): T[] {
  const search = filters.search.trim().toLowerCase();
  const from = parseDate(filters.fromDate);
  const to = parseDate(filters.toDate);
  const status = filters.status.trim().toLowerCase();

  return items.filter((item) => {
    if (status && config.statusField) {
      const itemStatus = resolveField(item, config.statusField).toLowerCase();
      if (itemStatus !== status) return false;
    }

    if (from || to) {
      if (!config.dateField) return true;
      const itemDate = parseDate(resolveField(item, config.dateField));
      if (!itemDate) return false;
      if (from && itemDate < from) return false;
      if (to && itemDate > to) return false;
    }

    if (search && config.searchFields?.length) {
      const haystack = config.searchFields
        .map((field) => resolveField(item, field))
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    return true;
  });
}
