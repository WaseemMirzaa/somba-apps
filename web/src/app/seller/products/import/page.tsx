"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Download, FileUp, Loader2, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailSection } from "@/components/ui/info-grid";
import { EmptyState } from "@/components/seller/data-state";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useSellerAccess } from "@/lib/seller";
import { sellerRequest } from "@/lib/seller-api";
import { downloadCsv, errMessage } from "@/lib/seller-labels";
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  importRowError,
  saveTextFile,
  type ImportReport,
} from "@/lib/seller-products";

/** Bulk import of products from a CSV file: template, dry run with a per-row report, then the real import. */
export default function SellerProductImportPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const access = useSellerAccess();
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"template" | "check" | "import" | null>(null);
  const [checked, setChecked] = useState<ImportReport | null>(null);
  const [done, setDone] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const crumbs = [
    { label: fr ? "Vendeur" : "Seller", href: "/seller" },
    { label: t("products"), href: "/seller/products" },
    { label: fr ? "Importer un CSV" : "Import CSV" },
  ];

  if (!access.can("catalog") || access.suspended) {
    return (
      <div className="space-y-6">
        <PageHeader title={fr ? "Importer un CSV" : "Import CSV"} backHref="/seller/products" breadcrumbs={crumbs} />
        <EmptyState>{fr ? "Votre rôle ne permet pas d'importer des produits." : "Your role does not allow importing products."}</EmptyState>
      </div>
    );
  }

  const planBlocked = !!error && /does not include|upgrade your plan|n'inclut pas|offre supérieure|formule supérieure/i.test(error);

  const planName = /Your (.+?) plan|Votre formule (.+?) n'inclut|Votre offre (.+?) n'inclut/i.exec(error ?? "")?.slice(1).find(Boolean) ?? "";

  async function downloadTemplate() {
    setBusy("template");
    try {
      const tpl = await sellerRequest<{ filename: string; csv: string; columns: string[] }>("products:importTemplate");
      saveTextFile(tpl.filename || "products-template.csv", tpl.csv);
    } catch (e) {
      toast(errMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }

  function reset() {
    setFileName("");
    setCsv("");
    setChecked(null);
    setDone(null);
    setError(null);
    setFileError(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function onFile(file: File | undefined) {
    setChecked(null);
    setDone(null);
    setError(null);
    setFileError(null);
    if (!file) {
      setCsv("");
      setFileName("");
      return;
    }
    setFileName(file.name);
    if (file.size > MAX_IMPORT_BYTES) {
      setCsv("");
      setFileError(
        fr
          ? `Ce fichier fait ${Math.ceil(file.size / 1024)} Ko : 900 Ko maximum. Découpez-le en plusieurs fichiers (${MAX_IMPORT_ROWS} produits au plus chacun).`
          : `This file is ${Math.ceil(file.size / 1024)} KB: 900 KB at most. Split it into several files (up to ${MAX_IMPORT_ROWS} products each).`,
      );
      return;
    }
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim()).length - 1;
    if (lines > MAX_IMPORT_ROWS) {
      setCsv("");
      setFileError(
        fr
          ? `Ce fichier contient environ ${lines} lignes : ${MAX_IMPORT_ROWS} produits au maximum par import.`
          : `This file has about ${lines} rows: at most ${MAX_IMPORT_ROWS} products per import.`,
      );
      return;
    }
    setCsv(text);
  }

  async function run(dryRun: boolean) {
    if (!csv) return;
    setBusy(dryRun ? "check" : "import");
    setError(null);
    try {
      const report = await sellerRequest<ImportReport>("products:import", { csv, dryRun });
      if (dryRun) setChecked(report);
      else {
        setDone(report);
        setChecked(null);
        toast(
          fr ? `${report.created} produit(s) importé(s), ${report.failed} ignoré(s)` : `${report.created} product(s) imported, ${report.failed} skipped`,
          report.failed > 0 ? "info" : "success",
        );
      }
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(null);
    }
  }

  function downloadErrors(report: ImportReport) {
    const rows: (string | number)[][] = [[fr ? "Ligne" : "Row", fr ? "Produit" : "Product", "SKU", fr ? "Erreurs" : "Errors"]];
    for (const r of report.errors) rows.push([r.row, r.name ?? "", r.sku ?? "", r.errors.map((m) => importRowError(m, fr)).join(" | ")]);
    downloadCsv(fr ? "rapport-import.csv" : "import-report.csv", rows);
  }

  const report = done ?? checked;
  const importable = checked ? checked.products.length : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Importer des produits (CSV)" : "Import products (CSV)"}
        subtitle={
          fr
            ? `Jusqu'à ${MAX_IMPORT_ROWS} produits par fichier. Chaque produit importé est créé en attente de validation par la modération.`
            : `Up to ${MAX_IMPORT_ROWS} products per file. Each imported product is created pending moderation.`
        }
        backHref="/seller/products"
        breadcrumbs={crumbs}
      />

      <DetailSection title={fr ? "1. Récupérez le modèle" : "1. Get the template"}>
        <p className="text-sm text-slate-600">
          {fr
            ? "Colonnes : name, nameFr, description, descriptionFr, price, originalPrice, category, stock, sku, brand, weightKg, images (liens séparés par |), deliveryDays, variants (Taille=S|M|L;Couleur=Noir|Blanc). Les noms de colonnes peuvent être en français ou en anglais ; seules « name » et « price » sont obligatoires."
            : "Columns: name, nameFr, description, descriptionFr, price, originalPrice, category, stock, sku, brand, weightKg, images (links separated by |), deliveryDays, variants (Size=S|M|L;Colour=Black|White). Column names may be English or French; only “name” and “price” are required."}
        </p>
        <div className="mt-3">
          <Button variant="secondary" onClick={() => void downloadTemplate()} disabled={busy === "template"}>
            {busy === "template" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {fr ? "Télécharger le modèle" : "Download the template"}
          </Button>
        </div>
      </DetailSection>

      <DetailSection title={fr ? "2. Choisissez votre fichier" : "2. Choose your file"}>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv,text/plain"
            data-testid="import-file"
            aria-label={fr ? "Fichier CSV" : "CSV file"}
            hidden
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <Button variant="secondary" onClick={() => fileInput.current?.click()} disabled={busy !== null}>
            <FileUp className="h-4 w-4" />
            {fileName ? (fr ? "Changer de fichier" : "Choose another file") : fr ? "Choisir un fichier CSV" : "Choose a CSV file"}
          </Button>
          {fileName && <span className="text-xs text-slate-500">{fileName}</span>}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {fr ? "CSV en UTF-8, séparateur « , », « ; » ou tabulation. 900 Ko maximum." : "UTF-8 CSV, delimiter “,”, “;” or tab. 900 KB at most."}
        </p>
        {fileError && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{fileError}</p>}
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={() => void run(true)} disabled={!csv || busy !== null}>
            {busy === "check" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            {fr ? "Vérifier le fichier" : "Check file"}
          </Button>
          {(csv || report) && (
            <Button variant="ghost" onClick={reset} disabled={busy !== null}>
              {fr ? "Recommencer" : "Start over"}
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="import-error">
            {planBlocked
              ? fr
                ? `Votre offre${planName ? ` ${planName}` : ""} n'inclut pas l'import en masse de produits. Passez à une offre supérieure pour l'utiliser.`
                : `Your${planName ? ` ${planName}` : ""} plan does not include bulk product import. Upgrade your plan to use it.`
              : error}
            {planBlocked && (
              <>
                {" "}
                <Link href="/seller/subscribe" className="font-semibold underline">{fr ? "Voir les offres" : "See plans"}</Link>
              </>
            )}
          </p>
        )}
      </DetailSection>

      {report && (
        <DetailSection title={done ? (fr ? "3. Résultat de l'import" : "3. Import result") : fr ? "3. Rapport de vérification" : "3. Check report"}>
          <div className="flex flex-wrap items-center gap-2" data-testid="import-summary">
            <Badge variant="default">{fr ? `${report.total} ligne(s)` : `${report.total} row(s)`}</Badge>
            <Badge variant="success">
              {done
                ? fr ? `${report.created} importé(s)` : `${report.created} imported`
                : fr ? `${report.products.length} importable(s)` : `${report.products.length} importable`}
            </Badge>
            <Badge variant={report.failed > 0 ? "danger" : "default"}>{fr ? `${report.failed} en erreur` : `${report.failed} with errors`}</Badge>
            {!done && <Badge variant="info">{fr ? "Simulation : rien n'a été créé" : "Dry run: nothing was created"}</Badge>}
          </div>

          {report.errors.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-xl border border-red-100" data-testid="import-errors">
              <table className="w-full text-left text-sm">
                <thead className="bg-red-50 text-xs uppercase text-red-700">
                  <tr>
                    <th className="px-3 py-2">{fr ? "Ligne" : "Row"}</th>
                    <th className="px-3 py-2">{fr ? "Produit" : "Product"}</th>
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2">{fr ? "Problème" : "Problem"}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.errors.map((r) => (
                    <tr key={r.row} className="border-t border-red-100 align-top">
                      <td className="px-3 py-2 font-mono">{r.row}</td>
                      <td className="px-3 py-2">{r.name || "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.sku || "—"}</td>
                      <td className="px-3 py-2">
                        <ul className="list-disc space-y-0.5 pl-4 text-red-700">
                          {r.errors.map((m, i) => <li key={i}>{importRowError(m, fr)}</li>)}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {report.products.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-xl border border-emerald-100" data-testid="import-ok">
              <table className="w-full text-left text-sm">
                <thead className="bg-emerald-50 text-xs uppercase text-emerald-700">
                  <tr>
                    <th className="px-3 py-2">{fr ? "Ligne" : "Row"}</th>
                    <th className="px-3 py-2">{fr ? "Produit" : "Product"}</th>
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2">{done ? (fr ? "Statut" : "Status") : fr ? "Prêt" : "Ready"}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.products.map((r) => (
                    <tr key={r.row} className="border-t border-emerald-100">
                      <td className="px-3 py-2 font-mono">{r.row}</td>
                      <td className="px-3 py-2">
                        {r.productId ? <Link href={`/seller/products/${r.productId}`} className="text-[var(--primary)] hover:underline">{r.name || "—"}</Link> : r.name || "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{r.sku || "—"}</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                          {done ? (fr ? "En attente de validation" : "Pending review") : fr ? "Importable" : "Importable"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {checked && (
              <Button onClick={() => void run(false)} disabled={busy !== null || importable === 0}>
                {busy === "import" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {fr ? `Importer ${importable} produit(s)` : `Import ${importable} product(s)`}
              </Button>
            )}
            {report.errors.length > 0 && (
              <Button variant="secondary" onClick={() => downloadErrors(report)}>
                <Download className="h-4 w-4" />
                {fr ? "Télécharger les erreurs (CSV)" : "Download the errors (CSV)"}
              </Button>
            )}
            {done && (
              <Link href="/seller/products" className="btn-primary rounded-lg px-4 py-2 text-sm font-medium">
                {fr ? "Voir mes produits" : "Back to my products"}
              </Link>
            )}
          </div>
          {checked && importable > 0 && report.failed > 0 && (
            <p className="mt-3 flex items-start gap-2 text-xs text-amber-700">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {fr
                ? "Les lignes en erreur seront ignorées : les autres sont importées. Corrigez le fichier pour les récupérer."
                : "Rows with errors are skipped; the others are imported. Fix the file to bring them in."}
            </p>
          )}
          {done && done.created > 0 && (
            <p className="mt-3 text-xs text-slate-600">
              {fr
                ? "Les produits importés sont « en attente » : un modérateur doit les approuver avant qu'ils soient visibles des clients."
                : "Imported products are “pending”: a moderator must approve them before shoppers can see them."}
            </p>
          )}
        </DetailSection>
      )}
    </div>
  );
}
