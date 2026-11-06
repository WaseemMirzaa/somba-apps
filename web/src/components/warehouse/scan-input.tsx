"use client";

import { useRef, useState } from "react";
import { ScanLine } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { CameraButton } from "@/components/warehouse/camera-scanner";
import { findLeg, parcelCode, type DeskTask } from "@/lib/warehouse";

/**
 * Parcel lookup by typed / scanned code. USB and Bluetooth barcode scanners act as keyboards ("keyboard wedge"):
 * they type the code into the focused input and press Enter. Accepts a parcel code (PKG-…), barcode (BC-…),
 * order reference or leg id and hands back the matching real leg. The camera button scans the same codes with a phone or
 * laptop camera (`@zxing/browser`) and keeps the camera open, so a whole run can be loaded parcel by parcel; where the
 * camera cannot start, the typed field and the wedge scanner are all there is, and they always work.
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

  /** Look the code up among the loaded legs and hand the leg on; returns what to tell the person. */
  async function lookUp(raw: string): Promise<{ ok: boolean; text: string }> {
    const value = raw.trim();
    const hit = findLeg(legs, value);
    if (hit) {
      await onFound(hit);
      return { ok: true, text: parcelCode(hit) };
    }
    return { ok: false, text: fr ? `Aucun colis ne correspond à « ${value} ».` : `No parcel matches "${value}".` };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = code.trim();
    if (!value) return;
    const r = await lookUp(value);
    if (r.ok) {
      setMessage(null);
      setCode("");
    } else {
      setMessage(r.text);
      inputRef.current?.select();
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-52 sm:flex-none">
          <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={inputRef}
            value={code}
            autoFocus={autoFocus}
            onChange={(e) => {
              setCode(e.target.value);
              if (message) setMessage(null);
            }}
            className="input-premium w-full py-2 pl-9 pr-3 text-sm sm:w-72"
            placeholder={fr ? "Scanner / saisir colis ou commande" : "Scan or type parcel / order"}
            aria-label={fr ? "Code du colis" : "Parcel code"}
          />
        </div>
        <button type="submit" className="btn-primary rounded-lg px-3 py-2 text-sm font-medium">
          {buttonLabel ?? (fr ? "Ouvrir" : "Open")}
        </button>
        <CameraButton
          title={fr ? "Scanner un colis" : "Scan a parcel"}
          hint={fr ? "Cadrez le code-barres ou le QR du colis. La caméra reste ouverte pour le suivant." : "Point at the parcel's barcode or QR. The camera stays open for the next one."}
          onCode={async (value) => {
            const r = await lookUp(value);
            return r.ok ? { text: fr ? `${r.text} traité` : `${r.text} done` } : { text: r.text, error: true };
          }}
        />
      </div>
      {message && (
        <p role="alert" className="text-xs text-red-600">
          {message}
        </p>
      )}
    </form>
  );
}
