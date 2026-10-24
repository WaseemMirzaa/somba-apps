"use client";

/* eslint-disable @next/next/no-img-element -- uploaded images live on the API host (see ProductImage) */
import { useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { uploadImage, useSellerData } from "@/lib/seller";
import { errMessage } from "@/lib/seller-labels";
import { autoTranslateHint, frInForm } from "@/lib/i18n-fields";

const DESC_MIN = 10;
const DESC_MAX = 1000;

/** One image slot (logo or banner): pick a file, it is uploaded to the API's local uploads folder at once. */
function ImageSlot({
  label,
  hint,
  value,
  onChange,
  shape,
  fr,
}: {
  label: string;
  hint: string;
  value: string | null;
  onChange: (url: string | null) => void;
  shape: "logo" | "banner";
  fr: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await uploadImage(file));
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  const frame = shape === "logo" ? "h-24 w-24 rounded-2xl" : "h-32 w-full rounded-xl";
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      <div className="flex flex-wrap items-center gap-3">
        <div className={`${frame} flex items-center justify-center overflow-hidden border border-dashed border-slate-300 bg-slate-50`}>
          {value ? (
            <img src={value} alt={label} className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className="h-6 w-6 text-slate-400" aria-hidden />
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" type="button" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? (fr ? "Envoi…" : "Uploading…") : value ? (fr ? "Remplacer" : "Replace") : fr ? "Choisir une image" : "Choose image"}
          </Button>
          {value && (
            <Button variant="ghost" size="sm" type="button" disabled={busy} onClick={() => onChange(null)} aria-label={fr ? "Retirer l'image" : "Remove image"}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        data-slot={shape}
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

/** Storefront branding the server keeps on the store: logo, banner and description (`sellers:update`). */
export function StoreBrandingForm() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { seller, updateStore } = useSellerData();
  const [logo, setLogo] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [descriptionFr, setDescriptionFr] = useState("");
  const [tab, setTab] = useState<"en" | "fr">("en");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!seller) return;
    /* eslint-disable react-hooks/set-state-in-effect -- fill the form from the loaded store */
    setLogo(seller.logoUrl ?? null);
    setBanner(seller.bannerUrl ?? null);
    setDescription(seller.description ?? "");
    setDescriptionFr(frInForm(seller.description, seller.descriptionFr));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [seller]);

  const desc = description.trim();
  const descFr = descriptionFr.trim();
  const rangeOk = (v: string) => v === "" || (v.length >= DESC_MIN && v.length <= DESC_MAX);
  const descOk = rangeOk(desc) && rangeOk(descFr);
  const enChanged = !!seller && desc !== (seller.description ?? "");
  const frChanged = !!seller && descFr !== frInForm(seller.description, seller.descriptionFr);
  const dirty = !!seller && (logo !== (seller.logoUrl ?? null) || banner !== (seller.bannerUrl ?? null) || enChanged || frChanged);

  async function save() {
    if (!descOk || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Only the language the seller edited is sent: an untouched machine translation must not become "written by you".
      await updateStore({
        logoUrl: logo,
        bannerUrl: banner,
        ...(enChanged ? { description: desc === "" ? null : desc } : {}),
        ...(frChanged ? { descriptionFr: descFr === "" ? null : descFr } : {}),
      });
      toast(fr ? "Vitrine enregistrée" : "Storefront saved");
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <ImageSlot
        shape="logo"
        fr={fr}
        label={fr ? "Logo" : "Logo"}
        hint={fr ? "Carré, au moins 256 × 256 px. JPEG, PNG ou WebP, 5 Mo max." : "Square, at least 256 × 256 px. JPEG, PNG or WebP, up to 5 MB."}
        value={logo}
        onChange={setLogo}
      />
      <ImageSlot
        shape="banner"
        fr={fr}
        label={fr ? "Bannière" : "Banner"}
        hint={fr ? "Large, idéalement 1600 × 400 px. JPEG, PNG ou WebP, 5 Mo max." : "Wide, ideally 1600 × 400 px. JPEG, PNG or WebP, up to 5 MB."}
        value={banner}
        onChange={setBanner}
      />
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="block text-xs font-medium text-slate-600" htmlFor="store-description">
            {fr ? "Description de la boutique" : "Store description"}
          </label>
          <div role="tablist" aria-label={fr ? "Langue de la description" : "Description language"} className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs">
            {(["en", "fr"] as const).map((l) => (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={tab === l}
                onClick={() => setTab(l)}
                className={`rounded-md px-2.5 py-1 font-semibold ${tab === l ? "bg-[var(--primary)] text-white" : "text-slate-600"}`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <textarea
          id="store-description"
          className="input-premium w-full px-4 py-2 text-sm"
          rows={4}
          maxLength={DESC_MAX}
          value={tab === "en" ? description : descriptionFr}
          onChange={(e) => (tab === "en" ? setDescription(e.target.value) : setDescriptionFr(e.target.value))}
          placeholder={fr ? "Ce que vous vendez, vos délais, ce qui vous distingue…" : "What you sell, your lead times, what makes you different…"}
        />
        <p className={`mt-1 text-xs ${descOk ? "text-slate-500" : "text-red-600"}`}>
          {descOk
            ? `${(tab === "en" ? desc : descFr).length}/${DESC_MAX} · ${autoTranslateHint(fr)}`
            : fr
              ? `${DESC_MIN} à ${DESC_MAX} caractères, ou laissez vide.`
              : `${DESC_MIN} to ${DESC_MAX} characters, or leave empty.`}
        </p>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <Button onClick={() => void save()} disabled={!seller || !descOk || !dirty || busy}>
        {busy ? (fr ? "Enregistrement…" : "Saving…") : fr ? "Enregistrer la vitrine" : "Save storefront"}
      </Button>
    </div>
  );
}

