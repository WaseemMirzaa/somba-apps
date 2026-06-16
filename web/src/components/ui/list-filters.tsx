"use client";

import { useLocale } from "@/context/locale-context";

export type ListFilterValues = {
  search: string;
  fromDate: string;
  toDate: string;
  status: string;
};

export const EMPTY_LIST_FILTERS: ListFilterValues = {
  search: "",
  fromDate: "",
  toDate: "",
  status: "",
};

export type StatusOption = {
  value: string;
  label?: string;
  labelFr?: string;
};

export function ListFilters({
  values,
  onChange,
  statusOptions = [],
  searchPlaceholder,
  showDateFilters = true,
  showStatusFilter = true,
}: {
  values: ListFilterValues;
  onChange: (values: ListFilterValues) => void;
  statusOptions?: StatusOption[];
  searchPlaceholder?: string;
  showDateFilters?: boolean;
  showStatusFilter?: boolean;
}) {
  const { locale, t } = useLocale();
  const isFr = locale === "fr";

  function update(partial: Partial<ListFilterValues>) {
    onChange({ ...values, ...partial });
  }

  const hasActiveFilters =
    values.search || values.fromDate || values.toDate || values.status;

  return (
    <div className="card-premium flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="min-w-[200px] flex-1">
        <label className="mb-1.5 block text-xs font-medium text-slate-600">
          {isFr ? "Rechercher" : "Search"}
        </label>
        <input
          type="search"
          className="input-premium w-full px-3 py-2 text-sm"
          placeholder={searchPlaceholder ?? (isFr ? "ID, nom, client…" : "ID, name, customer…")}
          value={values.search}
          onChange={(e) => update({ search: e.target.value })}
        />
      </div>

      {showDateFilters && (
        <>
          <div className="min-w-[140px]">
            <label htmlFor="list-filter-from" className="mb-1.5 block text-xs font-medium text-[var(--primary-dark)]">
              {isFr ? "Date de début" : "From date"}
            </label>
            <input
              id="list-filter-from"
              type="date"
              className="input-premium w-full px-3 py-2 text-sm"
              value={values.fromDate}
              onChange={(e) => update({ fromDate: e.target.value })}
            />
          </div>
          <div className="min-w-[140px]">
            <label htmlFor="list-filter-to" className="mb-1.5 block text-xs font-medium text-[var(--primary-dark)]">
              {isFr ? "Date de fin" : "To date"}
            </label>
            <input
              id="list-filter-to"
              type="date"
              className="input-premium w-full px-3 py-2 text-sm"
              value={values.toDate}
              onChange={(e) => update({ toDate: e.target.value })}
            />
          </div>
        </>
      )}

      {showStatusFilter && statusOptions.length > 0 && (
        <div className="min-w-[160px]">
          <label htmlFor="list-filter-status" className="mb-1.5 block text-xs font-medium text-slate-600">
            {t("status")}
          </label>
          <select
            id="list-filter-status"
            className="input-premium w-full px-3 py-2 text-sm"
            value={values.status}
            onChange={(e) => update({ status: e.target.value })}
          >
            <option value="">{isFr ? "Tous les statuts" : "All statuses"}</option>
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {isFr && option.labelFr ? option.labelFr : option.label ?? option.value}
              </option>
            ))}
          </select>
        </div>
      )}

      {hasActiveFilters && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_LIST_FILTERS)}
          className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-red-50"
        >
          {isFr ? "Effacer" : "Clear"}
        </button>
      )}
    </div>
  );
}
