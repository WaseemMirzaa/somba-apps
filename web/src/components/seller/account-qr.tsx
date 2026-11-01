"use client";

import { useMemo } from "react";
import { qrMatrix } from "@/lib/qr-code";

/** A QR code drawn as one inline SVG (white quiet zone included), for the 2FA `otpauth://` link. */
export function QrSvg({ text, size = 176, label }: { text: string; size?: number; label: string }) {
  const matrix = useMemo(() => {
    try {
      return qrMatrix(text);
    } catch {
      return null;
    }
  }, [text]);
  if (!matrix) return null;
  const n = matrix.length;
  const quiet = 4;
  let path = "";
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) path += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    }),
  );
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${n + quiet * 2} ${n + quiet * 2}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className="rounded-lg border border-slate-200 bg-white"
    >
      <rect width="100%" height="100%" fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
