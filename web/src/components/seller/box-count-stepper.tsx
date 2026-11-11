"use client";

import { useState } from "react";
import { MAX_BOXES, MIN_BOXES, clampBoxes } from "@/lib/parcel-labels";

/** Boxes in a package: minus / plus buttons and a typed field, always 1 to 20. */
export function BoxCountStepper({
  value,
  onChange,
  disabled,
  fr,
  id,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  fr: boolean;
  id: string;
}) {
  // While the field is being typed in its text may be empty; it snaps back to the clamped value on blur.
  const [text, setText] = useState<string | null>(null);
  const btn = "h-9 w-9 rounded-lg border border-slate-300 bg-white text-lg leading-none text-slate-700 hover:bg-slate-50 disabled:opacity-40";
  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        className={btn}
        aria-label={fr ? "Une boîte de moins" : "One box fewer"}
        disabled={disabled || value <= MIN_BOXES}
        onClick={() => { setText(null); onChange(clampBoxes(value - 1)); }}
      >
        −
      </button>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className="input-premium h-9 w-14 px-2 text-center text-sm"
        value={text ?? String(value)}
        disabled={disabled}
        aria-label={fr ? "Nombre de boîtes (1 à 20)" : "Number of boxes (1 to 20)"}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 3);
          setText(digits);
          if (digits) onChange(clampBoxes(digits));
        }}
        onBlur={() => setText(null)}
      />
      <button
        type="button"
        className={btn}
        aria-label={fr ? "Une boîte de plus" : "One box more"}
        disabled={disabled || value >= MAX_BOXES}
        onClick={() => { setText(null); onChange(clampBoxes(value + 1)); }}
      >
        +
      </button>
    </div>
  );
}
