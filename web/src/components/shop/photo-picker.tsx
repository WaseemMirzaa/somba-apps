"use client";

import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { uploadShopPhoto } from "@/lib/shop-upload";
import { useToast } from "@/context/toast-context";

/**
 * Photo attachments: pick up to `max` images, each uploads right away and the parent keeps the URLs.
 * Used by returns, disputes, support and chat.
 */
export function PhotoPicker({
  value,
  onChange,
  max,
  fr,
  label,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  max: number;
  fr: boolean;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function pick(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = max - value.length;
    if (room <= 0) {
      toast(fr ? `Vous pouvez joindre ${max} photos au maximum.` : `You can attach up to ${max} photos.`, "error");
      return;
    }
    setBusy(true);
    const urls: string[] = [];
    for (const f of Array.from(files).slice(0, room)) {
      try {
        urls.push(await uploadShopPhoto(f, fr));
      } catch (e) {
        toast((e as Error).message, "error");
      }
    }
    if (urls.length) onChange([...value, ...urls]);
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {value.map((u) => (
          <div key={u} className="relative h-16 w-16 overflow-hidden rounded-lg border border-[var(--border)] bg-slate-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt={fr ? "Photo jointe" : "Attached photo"} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== u))}
              aria-label={fr ? "Retirer la photo" : "Remove photo"}
              className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {value.length < max && (
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="inline-flex h-16 items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <ImagePlus className="h-4 w-4" />
            {busy ? (fr ? "Envoi…" : "Uploading…") : (label ?? (fr ? "Ajouter des photos" : "Add photos"))}
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" aria-label={label ?? (fr ? "Ajouter des photos" : "Add photos")} onChange={(e) => void pick(e.target.files)} />
      <p className="text-xs text-slate-500">{fr ? `${value.length}/${max} photos · JPEG, PNG ou WebP, 5 Mo max` : `${value.length}/${max} photos · JPEG, PNG or WebP, 5 MB max`}</p>
    </div>
  );
}
