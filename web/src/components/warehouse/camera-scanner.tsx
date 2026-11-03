"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { CAMERA_PROBLEM_TEXT, cameraProblem, cleanScan, shouldAccept, type CameraProblem } from "@/lib/stock-codes";

/** What a scan handler may answer: nothing, or a line to show under the picture ("PKG-AB12CD received", "No parcel matches…"). */
export type ScanReply = void | string | { text: string; error?: boolean };

/**
 * Camera barcode / QR scanning for the warehouse desk, built on `@zxing/browser` (loaded only when the camera opens, so
 * the pages stay light). It reads Code 128 / 39 / EAN / UPC / ITF / QR / Data Matrix with the back camera, which is what a
 * phone browser offers first. It never replaces typing: when the camera cannot start (no `https`, permission refused, no
 * camera, another app using it) the panel says why and keeps a typed field, and USB / Bluetooth scanners ("keyboard
 * wedge") keep working in the page's own fields. The camera stays open so a whole run can be scanned parcel by parcel.
 */
export function CameraScanPanel({
  open,
  onClose,
  onCode,
  title,
  hint,
}: {
  open: boolean;
  onClose: () => void;
  onCode: (code: string) => ScanReply | Promise<ScanReply>;
  title: string;
  hint?: string;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastRef = useRef<{ text: string; at: number } | null>(null);
  const handlerRef = useRef(onCode);
  const [problem, setProblem] = useState<CameraProblem | null>(null);
  const [starting, setStarting] = useState(true);
  const [reply, setReply] = useState<{ text: string; error: boolean } | null>(null);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    handlerRef.current = onCode;
  }, [onCode]);

  const deliver = useCallback(async (raw: string) => {
    const text = cleanScan(raw);
    if (!text) return;
    let out: ScanReply;
    try {
      out = await handlerRef.current(text);
    } catch (e) {
      out = { text: e instanceof Error ? e.message : "Request failed.", error: true };
    }
    if (typeof out === "string") setReply({ text: out, error: false });
    else if (out && typeof out === "object") setReply({ text: out.text, error: !!out.error });
  }, []);

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let stop: (() => void) | undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProblem(null);
    setStarting(true);
    setReply(null);
    lastRef.current = null;
    void (async () => {
      const hasMediaDevices = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
      const secure = typeof window !== "undefined" && window.isSecureContext;
      if (!hasMediaDevices) {
        setProblem(cameraProblem(null, { hasMediaDevices, secure }));
        setStarting(false);
        return;
      }
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
        const hints = new Map<import("@zxing/library").DecodeHintType, unknown>();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.ITF,
          BarcodeFormat.QR_CODE,
          BarcodeFormat.DATA_MATRIX,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });
        const controls = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
          videoRef.current ?? undefined,
          (result) => {
            if (!result) return; // nothing readable in this frame
            const text = result.getText();
            const now = Date.now();
            if (!shouldAccept(lastRef.current, text, now)) return;
            lastRef.current = { text, at: now };
            try {
              navigator.vibrate?.(60);
            } catch {
              /* no vibration on this device */
            }
            void deliver(text);
          },
        );
        if (stopped) controls.stop();
        else stop = () => controls.stop();
        if (!stopped) setStarting(false);
      } catch (e) {
        if (!stopped) {
          setProblem(cameraProblem(e, { hasMediaDevices, secure }));
          setStarting(false);
        }
      }
    })();
    return () => {
      stopped = true;
      stop?.();
    };
  }, [open, deliver]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const problemText = problem ? CAMERA_PROBLEM_TEXT[problem][fr ? "fr" : "en"] : null;
  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-slate-900/60 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl sm:max-w-md sm:rounded-2xl sm:p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-[family-name:var(--font-display)] text-base font-bold text-slate-900">{title}</h2>
            {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label={fr ? "Fermer la caméra" : "Close camera"}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {!problem && (
          <div className="relative overflow-hidden rounded-xl bg-slate-900" style={{ aspectRatio: "4 / 3" }}>
            <video ref={videoRef} className="h-full w-full object-cover" playsInline muted aria-label={fr ? "Aperçu de la caméra" : "Camera preview"} />
            <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" aria-hidden="true" />
            {starting && (
              <p role="status" className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
                {fr ? "Démarrage de la caméra…" : "Starting the camera…"}
              </p>
            )}
          </div>
        )}
        {problemText && (
          <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800" data-testid="camera-problem">
            {problemText}
          </p>
        )}

        <div aria-live="polite" className="mt-3 min-h-5 text-sm">
          {reply && <p className={reply.error ? "font-medium text-red-600" : "font-medium text-emerald-700"}>{reply.text}</p>}
        </div>

        <form
          className="mt-3 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = typed;
            setTyped("");
            void deliver(v);
          }}
        >
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="input-premium min-w-0 flex-1 px-3 py-2 text-sm"
            placeholder={fr ? "Ou saisissez le code" : "Or type the code"}
            aria-label={fr ? "Code saisi" : "Typed code"}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
          <button type="submit" className="rounded-lg border border-[var(--border-strong)] bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            {fr ? "Valider" : "Use code"}
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * A camera button for a field: opens the scan panel and hands every decoded code to `onCode`. Icon-only on purpose
 * (a label sits beside the field), so it is the one affordance that carries an icon without a label.
 */
export function CameraButton({
  onCode,
  title,
  hint,
  className = "",
}: {
  onCode: (code: string) => ScanReply | Promise<ScanReply>;
  title: string;
  hint?: string;
  className?: string;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex shrink-0 items-center justify-center rounded-lg border border-[var(--border-strong)] bg-white p-2 text-slate-700 shadow-sm hover:bg-slate-50 ${className}`}
        aria-label={fr ? "Scanner avec la caméra" : "Scan with the camera"}
        title={fr ? "Scanner avec la caméra" : "Scan with the camera"}
        data-testid="camera-button"
      >
        <Camera className="h-4 w-4" aria-hidden="true" />
      </button>
      <CameraScanPanel open={open} onClose={close} onCode={onCode} title={title} hint={hint} />
    </>
  );
}
