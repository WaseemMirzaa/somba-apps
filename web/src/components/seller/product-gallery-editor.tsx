"use client";

import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
import { ProductImage } from "@/components/seller/product-image";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { assetUrl, uploadImages } from "@/lib/seller-api";
import { errMessage } from "@/lib/seller-labels";
import { MAX_IMAGES } from "@/lib/seller-products";

/**
 * The product gallery: up to 8 photos, the first one is the cover. Upload several at once, drag a photo (or use the
 * arrow buttons: they work with the keyboard) to reorder, make any photo the cover, remove one. Controlled: `value`
 * is the list of uploaded URLs, cover first.
 */
export function ProductGalleryEditor({
  value,
  onChange,
  onBusy,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  /** Tells the form an upload is running (it must not be submitted meanwhile). */
  onBusy?: (busy: boolean) => void;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  async function pick(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = MAX_IMAGES - value.length;
    const chosen = Array.from(files);
    if (room <= 0) {
      const msg = fr ? `${MAX_IMAGES} photos au maximum par produit.` : `At most ${MAX_IMAGES} pictures per product.`;
      setError(msg);
      toast(msg, "error");
      return;
    }
    setBusy(true);
    onBusy?.(true);
    setError(null);
    try {
      const urls = await uploadImages(chosen.slice(0, room));
      onChange([...value, ...urls]);
      if (chosen.length > room) {
        toast(fr ? `Seules ${room} photo(s) ont été ajoutées : la limite est de ${MAX_IMAGES}.` : `Only ${room} photo(s) were added: the limit is ${MAX_IMAGES}.`, "info");
      }
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
      onBusy?.(false);
      if (input.current) input.current.value = "";
    }
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= value.length || from === to) return;
    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  const btn = "rounded-md bg-white/90 p-1 text-slate-700 shadow-sm hover:bg-white disabled:opacity-30";

  return (
    <div className="space-y-3" data-testid="gallery-editor">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label={fr ? "Photos du produit" : "Product photos"}>
        {value.map((url, i) => (
          <li
            key={url + i}
            draggable
            onDragStart={() => setDragFrom(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragFrom !== null) move(dragFrom, i);
              setDragFrom(null);
            }}
            onDragEnd={() => setDragFrom(null)}
            className={`relative aspect-square overflow-hidden rounded-xl border-2 bg-slate-50 ${i === 0 ? "border-[var(--primary)]" : "border-[var(--border)]"} ${dragFrom === i ? "opacity-50" : ""}`}
            data-testid="gallery-item"
          >
            <ProductImage src={assetUrl(url)} alt={fr ? `Photo ${i + 1}` : `Photo ${i + 1}`} />
            {i === 0 && (
              <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-[var(--primary)] px-2 py-0.5 text-[11px] font-semibold text-white">
                <Star className="h-3 w-3" aria-hidden="true" />
                {fr ? "Couverture" : "Cover"}
              </span>
            )}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/50 to-transparent p-1.5">
              <span className="flex gap-1">
                <button type="button" className={btn} disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={fr ? `Déplacer la photo ${i + 1} vers la gauche` : `Move photo ${i + 1} left`}>
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
                <button type="button" className={btn} disabled={i === value.length - 1} onClick={() => move(i, i + 1)} aria-label={fr ? `Déplacer la photo ${i + 1} vers la droite` : `Move photo ${i + 1} right`}>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </span>
              <span className="flex gap-1">
                {i !== 0 && (
                  <button type="button" className={btn} onClick={() => move(i, 0)} aria-label={fr ? `Définir la photo ${i + 1} comme couverture` : `Make photo ${i + 1} the cover`} title={fr ? "Définir comme couverture" : "Make cover"}>
                    <Star className="h-3.5 w-3.5" />
                  </button>
                )}
                <button type="button" className={`${btn} text-red-600`} onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={fr ? `Retirer la photo ${i + 1}` : `Remove photo ${i + 1}`}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            </div>
          </li>
        ))}
        {value.length < MAX_IMAGES && (
          <li>
            <button
              type="button"
              disabled={busy}
              onClick={() => input.current?.click()}
              className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-[var(--border)] text-xs font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
              {busy ? (fr ? "Envoi…" : "Uploading…") : fr ? "Ajouter des photos" : "Add photos"}
            </button>
          </li>
        )}
      </ul>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden data-testid="gallery-input" onChange={(e) => void pick(e.target.files)} />
      <p className="text-xs text-slate-500">
        {fr
          ? `${value.length} sur ${MAX_IMAGES} photos · JPEG, PNG ou WebP, 5 Mo maximum chacune. La première photo est la couverture : glissez-déposez ou utilisez les flèches pour changer l'ordre.`
          : `${value.length} of ${MAX_IMAGES} photos · JPEG, PNG or WebP, 5 MB each. The first photo is the cover: drag and drop or use the arrows to reorder.`}
      </p>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
