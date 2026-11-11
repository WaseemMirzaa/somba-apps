"use client";

import { useCallback, useMemo, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { CameraScanPanel, type ScanReply } from "@/components/warehouse/camera-scanner";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import type { ParcelChecklist } from "@/lib/logistics";
import { localizeParcelError } from "@/lib/parcel-errors";
import { boxText, normalizeBoxCode, overlayBoxes, riderScanText, scanCounterText, stageCounts, type BoxLine, type ScanStage } from "@/lib/parcel-scan";
import { socketClient } from "@/lib/realtime/socket-client";
import { errorMessage } from "@/lib/warehouse-live";

/** A short beep and a buzz, so the rider hears and feels the scan without looking. Never throws: a phone without audio or vibration just stays quiet. */
export function scanFeedback(ok: boolean) {
  try {
    navigator.vibrate?.(ok ? 60 : [80, 60, 80]);
  } catch {
    /* no vibration on this device */
  }
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = ok ? 880 : 220;
    gain.gain.value = 0.06;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.12 : 0.28));
    osc.onended = () => void ctx.close().catch(() => {});
  } catch {
    /* no audio */
  }
}

/**
 * The boxes of a leg (or run) as the screen shows them: what the server sent, with the answer of the rider's own scans laid
 * on top at once (the next push confirms it). `apply` takes the checklist a scan answered.
 */
export function useLiveBoxes(given: BoxLine[]) {
  const [live, setLive] = useState<BoxLine[] | null>(null);
  const boxes = useMemo(() => overlayBoxes(given, live), [given, live]);
  const apply = useCallback((list: BoxLine[]) => setLive(list), []);
  return { boxes, apply };
}

/** The checklist: "Box 1/3 PKG-... scanned / to scan" for one stage. */
export function BoxList({ boxes, stage }: { boxes: BoxLine[]; stage: ScanStage }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  return (
    <ul className="space-y-1" data-testid="parcel-checklist">
      {boxes.map((p) => {
        const done = !!(stage === "pickup" ? p.pickupScannedAt : p.dropoffScannedAt);
        return (
          <li key={p.code} className="flex items-center gap-2 text-sm" data-testid="parcel-box" data-done={done}>
            {done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /> : <Circle className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />}
            <span className="text-slate-700">{boxText(p, fr)}</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">{p.code}</span>
            <span className={done ? "ml-auto text-xs font-medium text-emerald-700" : "ml-auto text-xs text-slate-500"}>
              {done ? (fr ? "scanné" : "scanned") : fr ? "à scanner" : "to scan"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * "Scan parcels": the rider scans every box one by one (camera that stays open, a typed field, or a wedge scanner) for the
 * stage the leg is in. Each scan is `rider:scanParcel`; a typed code is sent `manual: true`, a camera read `manual: false`.
 * The checklist ticks at once, and every refusal is shown precisely (reply line and toast).
 */
export function RiderParcelPanel({
  target,
  stage,
  boxes,
  onChecklist,
  onChanged,
}: {
  target: { taskId: string } | { runId: string };
  stage: ScanStage;
  boxes: BoxLine[];
  onChecklist: (list: BoxLine[]) => void;
  /** After a scan the server acknowledged: refresh the leg. */
  onChanged?: () => void;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [camera, setCamera] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<{ text: string; error: boolean } | null>(null);
  const counts = stageCounts(boxes, stage);
  const close = useCallback(() => setCamera(false), []);

  async function send(raw: string, manual: boolean): Promise<ScanReply> {
    const code = normalizeBoxCode(raw) ?? raw.trim();
    try {
      const res = await socketClient.request<ParcelChecklist>("rider:scanParcel", { ...target, code, stage, manual });
      onChecklist(res.parcels);
      scanFeedback(true);
      const text = riderScanText(res, code, fr);
      setReply({ text, error: false });
      toast(text, res.already ? "info" : "success");
      onChanged?.();
      return { text };
    } catch (e) {
      const text = localizeParcelError(errorMessage(e), fr);
      scanFeedback(false);
      setReply({ text, error: true });
      toast(text, "error");
      return { text, error: true };
    }
  }

  async function submitTyped(e: React.FormEvent) {
    e.preventDefault();
    const v = typed.trim();
    if (!v || busy) return;
    setBusy(true);
    const out = await send(v, true);
    setBusy(false);
    if (!(out && typeof out === "object" && out.error)) setTyped("");
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 p-4" data-testid="rider-parcel-panel" aria-label={fr ? "Scanner les colis" : "Scan parcels"}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          {stage === "pickup" ? (fr ? "Scanner les colis à la collecte" : "Scan parcels at pickup") : fr ? "Scanner les colis à la remise" : "Scan parcels at drop-off"}
        </h3>
        <span className="text-xs font-medium text-slate-600" data-testid="parcel-counter">
          {scanCounterText(counts.scanned, counts.total, fr)}
        </span>
      </div>
      <BoxList boxes={boxes} stage={stage} />
      <div aria-live="polite" className="min-h-5 text-sm">
        {reply && <p className={reply.error ? "font-medium text-red-600" : "font-medium text-emerald-700"}>{reply.text}</p>}
      </div>
      <button
        type="button"
        onClick={() => setCamera(true)}
        className="w-full rounded-xl border border-emerald-300 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
        data-testid="parcel-camera"
      >
        {fr ? "Scanner avec la caméra" : "Scan with the camera"}
      </button>
      <form onSubmit={(e) => void submitTyped(e)} className="flex items-center gap-2">
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="input-premium min-w-0 flex-1 px-3 py-2 text-sm"
          placeholder={fr ? "Ou saisissez le code (PKG-…)" : "Or type the code (PKG-…)"}
          aria-label={fr ? "Code du carton" : "Box code"}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
        />
        <button type="submit" disabled={busy} className="rounded-lg border border-[var(--border-strong)] bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
          {busy ? "…" : fr ? "Valider" : "Use code"}
        </button>
      </form>
      <CameraScanPanel
        open={camera}
        onClose={close}
        onCode={(code, origin) => send(code, origin.manual)}
        title={stage === "pickup" ? (fr ? "Scanner les colis à la collecte" : "Scan parcels at pickup") : fr ? "Scanner les colis à la remise" : "Scan parcels at drop-off"}
        hint={fr ? "Cadrez le QR de chaque carton. La caméra reste ouverte pour le suivant." : "Point at each box's QR. The camera stays open for the next one."}
        footer={
          <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-semibold text-slate-700">{scanCounterText(counts.scanned, counts.total, fr)}</p>
            <BoxList boxes={boxes} stage={stage} />
          </div>
        }
      />
    </section>
  );
}
