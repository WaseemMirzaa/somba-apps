"use client";

import { useRef, useState } from "react";
import { ScanLine } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { findLeg, type DeskTask } from "@/lib/warehouse";

/**
 * Parcel lookup by typed / scanned code. USB and Bluetooth barcode scanners act as keyboards ("keyboard wedge"):
 * they type the code into the focused input and press Enter. Accepts a parcel code (PKG-…), barcode (BC-…),
 * order reference or leg id and hands back the matching real leg.
 */
export function ScanInput({
  legs,
  onFound,
  autoFocus = false,
  buttonLabel,
}: {
  legs: DeskTask[];
  onFound: (leg: DeskTask) => void | Promise<void>;
  autoFocus?: boolean;
  buttonLabel?: string;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = code.trim();
    if (!value) return;
    const hit = findLeg(legs, value);
    if (hit) {
      setMessage(null);
      setCode("");
      await onFound(hit);
    } else {
      setMessage(fr ? `Aucun colis ne correspond à « ${value} ».` : `No parcel matches "${value}".`);
      inputRef.current?.select();
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <div className="relative">
          <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={inputRef}
            value={code}
            autoFocus={autoFocus}
            onChange={(e) => {
              setCode(e.target.value);
              if (message) setMessage(null);
            }}
            className="input-premium w-72 max-w-full py-2 pl-9 pr-3 text-sm"
            placeholder={fr ? "Scanner / saisir colis ou commande" : "Scan or type parcel / order"}
            aria-label={fr ? "Code du colis" : "Parcel code"}
          />
        </div>
        <button type="submit" className="btn-primary rounded-lg px-3 py-2 text-sm font-medium">
          {buttonLabel ?? (fr ? "Ouvrir" : "Open")}
        </button>
      </div>
      {message && (
        <p role="alert" className="text-xs text-red-600">
          {message}
        </p>
      )}
    </form>
  );
}
