"use client";

import { useState } from "react";
import { Camera, ScanLine, X } from "lucide-react";
import { Button } from "./button";
import { useLocale } from "@/context/locale-context";

export function BarcodeScanner({
  onScan,
  label,
}: {
  onScan: (code: string) => void;
  label?: string;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const buttonLabel = label ?? (fr ? "Scanner le code-barres" : "Scan Barcode");
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);

  function simulateScan() {
    setScanning(true);
    setTimeout(() => {
      const code = `BC${Math.floor(Math.random() * 900000 + 100000)}`;
      onScan(code);
      setScanning(false);
      setOpen(false);
    }, 1500);
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Camera className="h-4 w-4" />
        {buttonLabel}
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md card-premium overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
          <h3 className="font-semibold">{fr ? "Lecteur de code-barres (caméra)" : "Camera Barcode Scanner"}</h3>
          <button onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>
        </div>
        <div className="relative flex aspect-video items-center justify-center bg-slate-900">
          <div className="absolute inset-8 border-2 border-emerald-400 rounded-lg" />
          <ScanLine className={`h-12 w-12 text-emerald-400 ${scanning ? "animate-pulse" : ""}`} />
          <p className="absolute bottom-4 text-xs text-white/70">
            {scanning ? (fr ? "Lecture..." : "Scanning...") : (fr ? "Pointez la caméra vers le code-barres (simulé)" : "Point camera at barcode (simulated)")}
          </p>
        </div>
        <div className="p-4">
          <Button onClick={simulateScan} disabled={scanning} className="w-full">
            {scanning ? (fr ? "Lecture..." : "Scanning...") : (fr ? "Simuler un scan" : "Simulate Scan")}
          </Button>
        </div>
      </div>
    </div>
  );
}
