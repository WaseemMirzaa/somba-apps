"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { assetUrl, uploadImages } from "@/lib/seller-api";
import { errMessage } from "@/lib/seller-labels";
import { ProductImage } from "@/components/seller/product-image";

/**
 * Photo attachments for a message (dispute reply, chat, support ticket): pick up to `max` images, each is uploaded
 * at once and the parent keeps the uploaded URLs. Controlled: `value` is the list of uploaded URLs.
 */
export function AttachmentPicker({
  value,
  onChange,
  max = 4,
  disabled,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  max?: number;
  disabled?: boolean;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = max - value.length;
    if (room <= 0) {
      toast(fr ? `${max} photos au maximum.` : `Up to ${max} photos.`, "error");
      return;
    }
    setBusy(true);
    try {
      const urls = await uploadImages(Array.from(files).slice(0, room));
      onChange([...value, ...urls]);
    } catch (e) {
      toast(errMessage(e), "error");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {value.map((u, i) => (
        <span key={u + i} className="relative h-14 w-14 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          <ProductImage src={assetUrl(u)} alt={fr ? `Pièce jointe ${i + 1}` : `Attachment ${i + 1}`} />
          <button
            type="button"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            className="absolute right-0 top-0 rounded-bl bg-black/60 p-0.5 text-white"
            aria-label={fr ? "Retirer la photo" : "Remove photo"}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {value.length < max && (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => input.current?.click()}
          className="inline-flex h-14 items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          {fr ? "Ajouter des photos" : "Add photos"}
        </button>
      )}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => void pick(e.target.files)} />
    </div>
  );
}

/** Read-only thumbnails of uploaded photos; a click opens the full image in a new tab. */
export function AttachmentGallery({ urls, className }: { urls: string[] | null | undefined; className?: string }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  if (!urls || urls.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-2 ${className ?? ""}`}>
      {urls.map((u, i) => (
        <a
          key={u + i}
          href={assetUrl(u)}
          target="_blank"
          rel="noreferrer"
          className="block h-16 w-16 overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
          aria-label={fr ? `Ouvrir la photo ${i + 1}` : `Open photo ${i + 1}`}
        >
          <ProductImage src={assetUrl(u)} alt={fr ? `Photo ${i + 1}` : `Photo ${i + 1}`} />
        </a>
      ))}
    </div>
  );
}
