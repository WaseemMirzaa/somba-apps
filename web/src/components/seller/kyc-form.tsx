"use client";

/* eslint-disable @next/next/no-img-element -- uploaded documents live on the API host (see ProductImage) */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FileImage, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";
import { uploadImage } from "@/lib/seller";
import type { Seller } from "@/lib/realtime/types";

/** Limits mirrored from the API (`validateKyc` in api/src/ops/sellers.service.ts). */
export const KYC_LIMITS = { name: [2, 100], legalName: [2, 150], idNumber: [4, 40], ref: 60, docs: [1, 5], fileMb: 5 } as const;

/** One uploaded (or still local) document. */
export interface KycDoc {
  id: string;
  /** Platform upload URL once uploaded (always set for documents loaded from the server). */
  url: string | null;
  /** The picked file, until it has been uploaded. */
  file: File | null;
  /** What the thumbnail shows (the URL, or an object URL of the local file). */
  preview: string;
}

export interface KycValues {
  name: string;
  legalName: string;
  phone: string;
  idNumber: string;
  rccm: string;
  taxNumber: string;
  docs: KycDoc[];
  acceptTerms: boolean;
}

export type KycField = "name" | "legalName" | "phone" | "idNumber" | "rccm" | "taxNumber" | "docs" | "acceptTerms";
export type KycErrors = Partial<Record<KycField, string>>;

export const EMPTY_KYC: KycValues = { name: "", legalName: "", phone: "", idNumber: "", rccm: "", taxNumber: "", docs: [], acceptTerms: false };

let docSeq = 0;
const docId = () => `doc-${Date.now()}-${++docSeq}`;

/** Prefill from the store the server holds (terms must always be accepted again). */
export function kycFromSeller(s: Seller | null): KycValues {
  if (!s) return EMPTY_KYC;
  return {
    name: s.name ?? "",
    legalName: s.legalName ?? "",
    phone: s.phone ?? "",
    idNumber: s.idNumber ?? "",
    rccm: s.rccm ?? "",
    taxNumber: s.taxNumber ?? "",
    docs: (s.documentUrls ?? []).map((url) => ({ id: docId(), url, file: null, preview: url })),
    acceptTerms: false,
  };
}

const PHONE_CHARS = /^\+?[0-9 ()\-.]+$/;

/** Same rules as the server, so the seller sees every problem before anything is uploaded. */
export function validateKycValues(v: KycValues, fr: boolean): KycErrors {
  const e: KycErrors = {};
  const len = (s: string) => s.trim().length;
  const [nMin, nMax] = KYC_LIMITS.name;
  if (len(v.name) < nMin || len(v.name) > nMax) {
    e.name = fr ? `Le nom de la boutique doit contenir ${nMin} à ${nMax} caractères.` : `Store name must be ${nMin}-${nMax} characters.`;
  }
  const [lMin, lMax] = KYC_LIMITS.legalName;
  if (len(v.legalName) < lMin || len(v.legalName) > lMax) {
    e.legalName = fr ? `La raison sociale doit contenir ${lMin} à ${lMax} caractères.` : `Legal name must be ${lMin}-${lMax} characters.`;
  }
  const phone = v.phone.trim();
  let digits = phone.replace(/[^0-9]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (!PHONE_CHARS.test(phone) || digits.length < 9 || digits.length > 15) {
    e.phone = fr ? "Saisissez un numéro valide (par ex. +243 81 234 5678)." : "Enter a valid phone number (for example +243 81 234 5678).";
  }
  const [iMin, iMax] = KYC_LIMITS.idNumber;
  if (len(v.idNumber) < iMin || len(v.idNumber) > iMax) {
    e.idNumber = fr ? `Le numéro de pièce d'identité doit contenir ${iMin} à ${iMax} caractères.` : `ID number must be ${iMin}-${iMax} characters.`;
  }
  if (len(v.rccm) > KYC_LIMITS.ref) e.rccm = fr ? `Maximum ${KYC_LIMITS.ref} caractères.` : `At most ${KYC_LIMITS.ref} characters.`;
  if (len(v.taxNumber) > KYC_LIMITS.ref) e.taxNumber = fr ? `Maximum ${KYC_LIMITS.ref} caractères.` : `At most ${KYC_LIMITS.ref} characters.`;
  if (v.docs.length < KYC_LIMITS.docs[0] || v.docs.length > KYC_LIMITS.docs[1]) {
    e.docs = fr ? "Ajoutez 1 à 5 documents (pièce d'identité, RCCM…)." : "Add 1 to 5 documents (ID, trade register…).";
  }
  if (!v.acceptTerms) e.acceptTerms = fr ? "Vous devez accepter les conditions vendeur." : "You must accept the seller terms.";
  return e;
}

/** Files already uploaded in this session (a failed submit must not upload them twice). */
const uploaded = new WeakMap<File, string>();

/**
 * The wire payload of `sellers:register` / `sellers:resubmit`. Uploads any picked file first,
 * so call it only once the account exists (uploads need a signed-in user).
 */
export async function kycPayload(v: KycValues): Promise<Record<string, unknown>> {
  const documentUrls: string[] = [];
  for (const d of v.docs) {
    if (d.url) {
      documentUrls.push(d.url);
      continue;
    }
    if (!d.file) continue;
    let url = uploaded.get(d.file);
    if (!url) {
      url = await uploadImage(d.file);
      uploaded.set(d.file, url);
    }
    documentUrls.push(url);
  }
  return {
    name: v.name.trim(),
    legalName: v.legalName.trim(),
    phone: v.phone.trim(),
    idNumber: v.idNumber.trim(),
    rccm: v.rccm.trim() || undefined,
    taxNumber: v.taxNumber.trim() || undefined,
    documentUrls,
    acceptTerms: v.acceptTerms,
  };
}

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * The store-application form shared by registration and resubmission: store + legal identity, phone,
 * ID, optional RCCM / tax number, 1-5 document images, and the terms checkbox. It validates like the
 * server; `onSubmit` receives the values (call {@link kycPayload} to upload and build the request).
 * `top` / `bottom` slot extra fields around the KYC block; `precheck` lets the page validate them too.
 */
export function KycForm({
  initial = EMPTY_KYC,
  submitLabel,
  busy,
  error,
  top,
  bottom,
  precheck,
  onSubmit,
}: {
  initial?: KycValues;
  submitLabel: string;
  busy: boolean;
  /** The server's message for the last attempt (the page also raises it as a toast). */
  error?: string | null;
  top?: React.ReactNode;
  bottom?: React.ReactNode;
  /** Runs on submit before anything is sent; return false to stop (the page shows its own errors). */
  precheck?: () => boolean;
  onSubmit: (values: KycValues) => void | Promise<void>;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [v, setV] = useState<KycValues>(initial);
  const [showErrors, setShowErrors] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const objectUrls = useRef<Set<string>>(new Set());

  // Free the local previews when the form goes away.
  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls.clear();
    };
  }, []);

  const errors = showErrors ? validateKycValues(v, fr) : {};
  const set = <K extends keyof KycValues>(key: K, value: KycValues[K]) => setV((cur) => ({ ...cur, [key]: value }));

  function pick(files: FileList | null) {
    if (!files || files.length === 0) return;
    setPickError(null);
    const room = KYC_LIMITS.docs[1] - v.docs.length;
    const added: KycDoc[] = [];
    let problem: string | null = null;
    for (const file of Array.from(files)) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        problem = fr ? "Seuls les formats JPEG, PNG ou WebP sont acceptés." : "Only JPEG, PNG or WebP images are allowed.";
        continue;
      }
      if (file.size > KYC_LIMITS.fileMb * 1024 * 1024) {
        problem = fr ? `Une image dépasse ${KYC_LIMITS.fileMb} Mo.` : `An image is larger than ${KYC_LIMITS.fileMb} MB.`;
        continue;
      }
      if (added.length >= room) {
        problem = fr ? "5 documents au maximum." : "At most 5 documents.";
        break;
      }
      const preview = URL.createObjectURL(file);
      objectUrls.current.add(preview);
      added.push({ id: docId(), url: null, file, preview });
    }
    if (added.length) set("docs", [...v.docs, ...added]);
    setPickError(problem);
    if (input.current) input.current.value = "";
  }

  function remove(id: string) {
    const doc = v.docs.find((d) => d.id === id);
    if (doc?.file && objectUrls.current.has(doc.preview)) {
      URL.revokeObjectURL(doc.preview);
      objectUrls.current.delete(doc.preview);
    }
    set("docs", v.docs.filter((d) => d.id !== id));
    setPickError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setShowErrors(true);
    const mine = validateKycValues(v, fr);
    const extraOk = precheck ? precheck() : true;
    if (Object.keys(mine).length > 0 || !extraOk) return;
    await onSubmit(v);
  }

  const inputCls = "input-premium w-full px-4 py-2 text-sm";
  const invalid = (k: KycField) => (errors[k] ? true : undefined);
  const describe = (k: KycField, id: string) => (errors[k] ? `${id}-err` : undefined);

  return (
    <form onSubmit={submit} noValidate className="card-premium space-y-4 p-6">
      {top}
      <Field id="kyc-name" label={fr ? "Nom de la boutique" : "Store name"} error={errors.name}>
        <input id="kyc-name" className={inputCls} value={v.name} maxLength={KYC_LIMITS.name[1]} onChange={(e) => set("name", e.target.value)} aria-invalid={invalid("name")} aria-describedby={describe("name", "kyc-name")} />
      </Field>
      <Field
        id="kyc-legal"
        label={fr ? "Raison sociale / nom légal" : "Legal name"}
        error={errors.legalName}
        hint={fr ? "Le nom de l'entreprise ou de la personne, tel qu'il figure sur vos documents." : "The business or person's name as it appears on your documents."}
      >
        <input id="kyc-legal" className={inputCls} value={v.legalName} maxLength={KYC_LIMITS.legalName[1]} onChange={(e) => set("legalName", e.target.value)} aria-invalid={invalid("legalName")} aria-describedby={describe("legalName", "kyc-legal")} autoComplete="organization" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="kyc-phone" label={fr ? "Téléphone" : "Phone"} error={errors.phone}>
          <input id="kyc-phone" type="tel" className={inputCls} value={v.phone} maxLength={25} placeholder="+243 81 234 5678" onChange={(e) => set("phone", e.target.value)} aria-invalid={invalid("phone")} aria-describedby={describe("phone", "kyc-phone")} autoComplete="tel" />
        </Field>
        <Field id="kyc-id" label={fr ? "N° de pièce d'identité / passeport" : "ID / passport number"} error={errors.idNumber}>
          <input id="kyc-id" className={inputCls} value={v.idNumber} maxLength={KYC_LIMITS.idNumber[1]} onChange={(e) => set("idNumber", e.target.value)} aria-invalid={invalid("idNumber")} aria-describedby={describe("idNumber", "kyc-id")} />
        </Field>
        <Field id="kyc-rccm" label={fr ? "N° RCCM (optionnel)" : "RCCM number (optional)"} error={errors.rccm}>
          <input id="kyc-rccm" className={inputCls} value={v.rccm} maxLength={KYC_LIMITS.ref + 20} onChange={(e) => set("rccm", e.target.value)} aria-invalid={invalid("rccm")} aria-describedby={describe("rccm", "kyc-rccm")} />
        </Field>
        <Field id="kyc-tax" label={fr ? "N° d'impôt (optionnel)" : "Tax number (optional)"} error={errors.taxNumber}>
          <input id="kyc-tax" className={inputCls} value={v.taxNumber} maxLength={KYC_LIMITS.ref + 20} onChange={(e) => set("taxNumber", e.target.value)} aria-invalid={invalid("taxNumber")} aria-describedby={describe("taxNumber", "kyc-tax")} />
        </Field>
      </div>

      <div>
        <p className="mb-1 text-sm font-medium">{fr ? "Documents justificatifs" : "Supporting documents"}</p>
        <p className="mb-2 text-xs text-slate-500">
          {fr
            ? "Photo de votre pièce d'identité, du RCCM ou de l'attestation fiscale. JPEG, PNG ou WebP, 5 Mo max, 5 documents au maximum. Seule la modération les voit."
            : "A photo of your ID, trade register or tax certificate. JPEG, PNG or WebP, up to 5 MB each, at most 5 documents. Only moderation can see them."}
        </p>
        <ul className="flex flex-wrap gap-3">
          {v.docs.map((d, i) => (
            <li key={d.id} className="relative">
              <img
                src={d.preview}
                alt={fr ? `Document ${i + 1}` : `Document ${i + 1}`}
                className="h-20 w-20 rounded-lg border border-slate-200 bg-slate-50 object-cover"
              />
              <button
                type="button"
                onClick={() => remove(d.id)}
                disabled={busy}
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                aria-label={fr ? `Retirer le document ${i + 1}` : `Remove document ${i + 1}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {v.docs.length < KYC_LIMITS.docs[1] && (
            <li>
              <button
                type="button"
                onClick={() => input.current?.click()}
                disabled={busy}
                className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                <FileImage className="h-5 w-5" aria-hidden />
                {fr ? "Ajouter" : "Add"}
              </button>
            </li>
          )}
        </ul>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" data-slot="kyc-docs" onChange={(e) => pick(e.target.files)} />
        {(errors.docs || pickError) && (
          <p role="alert" className="mt-1 text-xs text-red-600">
            {pickError ?? errors.docs}
          </p>
        )}
      </div>

      {bottom}

      <div>
        <label className="flex items-start gap-2 text-sm" htmlFor="kyc-terms">
          <input id="kyc-terms" type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300" checked={v.acceptTerms} onChange={(e) => set("acceptTerms", e.target.checked)} aria-invalid={invalid("acceptTerms")} aria-describedby={describe("acceptTerms", "kyc-terms")} />
          <span>
            {fr ? "J'accepte les " : "I accept the "}
            <Link href="/legal/seller" target="_blank" rel="noopener noreferrer" className="text-[var(--primary)] underline">
              {fr ? "conditions vendeur" : "seller terms"}
            </Link>
          </span>
        </label>
        {errors.acceptTerms && (
          <p id="kyc-terms-err" role="alert" className="mt-1 text-xs text-red-600">
            {errors.acceptTerms}
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? (fr ? "Envoi…" : "Sending…") : submitLabel}
      </Button>
    </form>
  );
}
