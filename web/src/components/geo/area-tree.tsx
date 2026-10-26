"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useAreaChildren, type Area } from "@/lib/areas";

export interface TreeRowContext {
  depth: number;
  open: boolean;
}

/**
 * A lazily loaded area tree (Province → City → District → Commune → Quartier): a node reads its children from
 * `geo:children` only when it is opened, and again whenever the geography or the coverage changes.
 * `renderRow` draws the rest of the row (name, badges, actions); `reveal` opens the nodes on the way to an area.
 */
export function AreaTree({
  fr,
  renderRow,
  reveal,
  selectedId,
  rootParentId = null,
  className,
}: {
  fr: boolean;
  renderRow: (area: Area, ctx: TreeRowContext) => React.ReactNode;
  /** Codes of the areas to open (an area's path), so a search hit is visible in the tree. */
  reveal?: ReadonlySet<string>;
  selectedId?: string | null;
  /** null = the country's provinces. */
  rootParentId?: string | null;
  className?: string;
}) {
  return (
    <ul role="tree" className={className} aria-label={fr ? "Arbre des zones" : "Area tree"}>
      <Level parentId={rootParentId} depth={0} fr={fr} renderRow={renderRow} reveal={reveal} selectedId={selectedId} />
    </ul>
  );
}

function Level({ parentId, depth, fr, renderRow, reveal, selectedId }: { parentId: string | null; depth: number; fr: boolean; renderRow: (a: Area, c: TreeRowContext) => React.ReactNode; reveal?: ReadonlySet<string>; selectedId?: string | null }) {
  const { rows, loading, error } = useAreaChildren(parentId);
  if (loading) {
    return (
      <li className="flex items-center gap-2 py-1.5 text-xs text-slate-400" style={{ paddingLeft: depth * 20 + 8 }}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {fr ? "Chargement…" : "Loading…"}
      </li>
    );
  }
  if (error) {
    return (
      <li className="py-1.5 text-xs text-red-600" style={{ paddingLeft: depth * 20 + 8 }} role="alert">
        {error}
      </li>
    );
  }
  return (
    <>
      {(rows ?? []).map((a) => (
        <Node key={a.id} area={a} depth={depth} fr={fr} renderRow={renderRow} reveal={reveal} selectedId={selectedId} />
      ))}
    </>
  );
}

function Node({ area, depth, fr, renderRow, reveal, selectedId }: { area: Area; depth: number; fr: boolean; renderRow: (a: Area, c: TreeRowContext) => React.ReactNode; reveal?: ReadonlySet<string>; selectedId?: string | null }) {
  const [open, setOpen] = useState(false);
  const shouldReveal = !!reveal?.has(area.code) && area.id !== selectedId;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- opens the way to a search hit
    if (shouldReveal) setOpen(true);
  }, [shouldReveal]);
  const expandable = area.childCount > 0;
  return (
    <li role="treeitem" aria-expanded={expandable ? open : undefined} aria-selected={selectedId === area.id}>
      <div className={`flex items-center gap-1 rounded-lg py-1 pr-2 ${selectedId === area.id ? "bg-blue-50" : "hover:bg-slate-50"}`} style={{ paddingLeft: depth * 20 }} data-area-code={area.code}>
        {expandable ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="rounded p-1 text-slate-500 hover:bg-slate-100"
            aria-label={open ? (fr ? "Replier" : "Collapse") : fr ? "Déplier" : "Expand"}
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="inline-block w-6" />
        )}
        <div className="min-w-0 flex-1">{renderRow(area, { depth, open })}</div>
      </div>
      {open && expandable && (
        <ul role="group">
          <Level parentId={area.id} depth={depth + 1} fr={fr} renderRow={renderRow} reveal={reveal} selectedId={selectedId} />
        </ul>
      )}
    </li>
  );
}
