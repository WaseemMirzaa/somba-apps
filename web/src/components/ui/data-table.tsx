export type DataTableColumn = {
  key: string;
  label: string;
  render?: (row: Record<string, unknown>) => React.ReactNode;
  /** Use this column as the card heading in the mobile view. Defaults to the first column. */
  primary?: boolean;
  /** Omit this column from the stacked mobile card view. */
  hideOnMobile?: boolean;
};

export function DataTable({
  columns,
  data,
  className,
  emptyMessage,
}: {
  columns: DataTableColumn[];
  data: Record<string, unknown>[];
  className?: string;
  emptyMessage?: string;
}) {
  const primaryCol = columns.find((col) => col.primary) ?? columns[0];
  // "actions" columns get a full-width footer on mobile instead of a label/value row.
  const actionCol = columns.find((col) => col.key === "actions" && col !== primaryCol);
  const detailCols = columns.filter(
    (col) => col !== primaryCol && col !== actionCol && !col.hideOnMobile
  );

  const renderCell = (col: DataTableColumn, row: Record<string, unknown>) =>
    col.render ? col.render(row) : String(row[col.key] ?? "");

  return (
    <div className={className}>
      {/* Desktop / large tablet: full table */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-slate-500"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {data.map((row, i) => (
              <tr key={i} className="transition-colors hover:bg-slate-50/80">
                {columns.map((col) => (
                  <td key={col.key} className="px-5 py-4 text-slate-700">
                    {renderCell(col, row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile / small tablet: stacked cards, no horizontal scroll */}
      <ul className="divide-y divide-[var(--border)] lg:hidden">
        {data.map((row, i) => (
          <li key={i} className="space-y-3 px-4 py-4 sm:px-5">
            {primaryCol && (
              <div className="text-sm font-semibold text-slate-900">
                {renderCell(primaryCol, row)}
              </div>
            )}
            {detailCols.length > 0 && (
              <dl className="space-y-1.5">
                {detailCols.map((col) => {
                  const value = renderCell(col, row);
                  if (value === "" || value === null || value === undefined) return null;
                  return (
                    <div key={col.key} className="flex items-start justify-between gap-4">
                      <dt className="shrink-0 text-xs font-medium uppercase tracking-wide text-slate-400">
                        {col.label}
                      </dt>
                      <dd className="min-w-0 break-words text-right text-sm text-slate-700">
                        {value}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            )}
            {actionCol && (
              <div className="border-t border-[var(--border)] pt-2.5">
                {renderCell(actionCol, row)}
              </div>
            )}
          </li>
        ))}
      </ul>

      {data.length === 0 && (
        <p className="px-5 py-8 text-center text-sm text-slate-400">
          {emptyMessage ?? "No records found"}
        </p>
      )}
    </div>
  );
}
