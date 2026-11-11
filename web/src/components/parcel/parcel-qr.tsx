"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { qrAlt } from "@/lib/parcel-labels";

/**
 * The QR code of a parcel code, drawn in the browser (error correction M) as an SVG image with an alt text.
 * While it is being drawn, or if it cannot be, the code is still readable in text next to it (the caller shows it).
 */
export function ParcelQr({
  code,
  boxNo = 1,
  boxCount = 1,
  fr,
  className,
}: {
  code: string;
  boxNo?: number;
  boxCount?: number;
  fr: boolean;
  className?: string;
}) {
  const [svg, setSvg] = useState<{ code: string; url: string | null } | null>(null);

  useEffect(() => {
    let live = true;
    QRCode.toString(code, { type: "svg", errorCorrectionLevel: "M", margin: 1 })
      .then((s) => {
        if (live) setSvg({ code, url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}` });
      })
      .catch(() => {
        if (live) setSvg({ code, url: null });
      });
    return () => {
      live = false;
    };
  }, [code]);

  const ready = svg && svg.code === code;
  if (ready && !svg.url) {
    return (
      <div role="img" aria-label={qrAlt({ code, boxNo, boxCount }, fr)} className={`flex items-center justify-center border border-dashed border-slate-400 text-center text-xs text-slate-600 ${className ?? ""}`}>
        {fr ? "Code QR indisponible : utilisez le code écrit." : "QR code unavailable: use the written code."}
      </div>
    );
  }
  if (!ready) return <div aria-hidden className={`animate-pulse bg-slate-100 ${className ?? ""}`} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={svg.url!} alt={qrAlt({ code, boxNo, boxCount }, fr)} className={className} />;
}
