/**
 * Parcel labels: the pure helpers behind the seller's print page (paper sizes, the CSS that prints them, label text, grid math)
 * and the box-count rules. The QR code itself is drawn in the browser by `components/parcel/parcel-qr.tsx`.
 *
 * No imports: `npm test` loads this file on its own.
 */

/** One label = one box, as the API answers (`orders:sellerLabels`, `orders:sellerReady`, `parcels:forReturn`). */
export interface ParcelLabel {
  code: string;
  boxNo: number;
  boxCount: number;
  orderReference: string;
  storeName?: string;
  /** The destination AREA only: never a phone number or a street. */
  destinationArea?: string;
}

/** What the seller endpoints answer: the labels, how many boxes, and whether a rider already scanned one (count locked). */
export interface ParcelLabelPack {
  labels: ParcelLabel[];
  boxCount: number;
  locked: boolean;
}

export const MIN_BOXES = 1;
export const MAX_BOXES = 20;

/** A typed box count, clamped to 1-20 (anything that is not a number reads as 1). */
export function clampBoxes(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isFinite(n)) return MIN_BOXES;
  return Math.min(MAX_BOXES, Math.max(MIN_BOXES, Math.trunc(n)));
}

/** The server's refusal after a rider scanned a box (the same sentence, shown verbatim; French lives in api-errors). */
export const BOXES_LOCKED_COPY = {
  en: "The rider already scanned these boxes. Contact support to change them.",
  fr: "Le livreur a déjà scanné ces boîtes. Contactez l'assistance pour les modifier.",
};

export type PaperId = "a6" | "a4";

export interface PaperOption {
  id: PaperId;
  label: string;
  labelFr: string;
  /** The page size as CSS `size` (the @page rule). */
  pageSize: string;
  pageMargin: string;
  cols: number;
  /** Rows of labels on one page. */
  rows: number;
  labelWidthMm: number;
  labelHeightMm: number;
}

export const PAPERS: Record<PaperId, PaperOption> = {
  a6: {
    id: "a6",
    label: "Label 100 x 150 mm (A6)",
    labelFr: "Étiquette 100 x 150 mm (A6)",
    pageSize: "100mm 150mm",
    pageMargin: "0",
    cols: 1,
    rows: 1,
    labelWidthMm: 100,
    labelHeightMm: 150,
  },
  a4: {
    id: "a4",
    label: "A4 sheet",
    labelFr: "Feuille A4",
    pageSize: "A4",
    pageMargin: "5mm",
    cols: 2,
    rows: 2,
    labelWidthMm: 100,
    labelHeightMm: 142,
  },
};

export const PAPER_ORDER: PaperId[] = ["a6", "a4"];
export const DEFAULT_PAPER: PaperId = "a6";
export const PAPER_STORAGE_KEY = "komoriko.labelPaper";

/** A stored paper choice, or the default when it is missing or unknown. */
export function readPaper(raw: unknown): PaperId {
  return raw === "a4" || raw === "a6" ? raw : DEFAULT_PAPER;
}

/** Labels on one printed page. */
export function labelsPerPage(paper: PaperId): number {
  const p = PAPERS[paper];
  return p.cols * p.rows;
}

/** Printed pages needed for `count` labels. */
export function pageCount(paper: PaperId, count: number): number {
  if (count <= 0) return 0;
  return Math.ceil(count / labelsPerPage(paper));
}

/** Whether a whole grid fits the page (page size minus margins), for A4 in mm. Checked by the tests. */
export function gridFits(paper: PaperId): boolean {
  const p = PAPERS[paper];
  if (paper === "a6") return p.labelWidthMm <= 100 && p.labelHeightMm <= 150;
  const margin = 5;
  return p.cols * p.labelWidthMm <= 210 - 2 * margin && p.rows * p.labelHeightMm <= 297 - 2 * margin;
}

/** "Box 1/3" / "Colis 1/3". */
export function boxText(boxNo: number, boxCount: number, fr: boolean): string {
  return `${fr ? "Colis" : "Box"} ${boxNo}/${boxCount}`;
}

/** The alt text of a label's QR image. */
export function qrAlt(label: Pick<ParcelLabel, "code" | "boxNo" | "boxCount">, fr: boolean): string {
  return fr
    ? `Code QR du colis ${label.code}, boîte ${label.boxNo} sur ${label.boxCount}`
    : `QR code of parcel ${label.code}, box ${label.boxNo} of ${label.boxCount}`;
}

/** "2 boxes" / "2 boîtes". */
export function boxesPhrase(n: number, fr: boolean): string {
  return fr ? `${n} ${n === 1 ? "boîte" : "boîtes"}` : `${n} ${n === 1 ? "box" : "boxes"}`;
}

/** Toast after the labels were made: "Labels ready: 2 boxes". */
export function labelsReadyToast(n: number, fr: boolean): string {
  return fr ? `Étiquettes prêtes : ${boxesPhrase(n, true)}` : `Labels ready: ${boxesPhrase(n, false)}`;
}

/** Labels in box order, each box once (a duplicate code keeps its first copy). */
export function orderedLabels(labels: ParcelLabel[]): ParcelLabel[] {
  const seen = new Set<string>();
  return [...labels]
    .sort((a, b) => a.boxNo - b.boxNo)
    .filter((l) => (seen.has(l.code) ? false : (seen.add(l.code), true)));
}

/** The class of the printable block: everything else on the page is hidden when printing. */
export const PRINT_ROOT_CLASS = "parcel-sheet";

/**
 * The CSS injected on the print page: the label size on screen and on paper, the `@page` rule, one label per page (A6) or a
 * 2-column grid (A4), and the hiding of the app chrome (sidebar, header, toolbar: every element that is neither the sheet,
 * inside it, nor one of its ancestors).
 */
export function paperCss(paper: PaperId): string {
  const p = PAPERS[paper];
  const root = `.${PRINT_ROOT_CLASS}`;
  const a6 = paper === "a6";
  return [
    `@page { size: ${p.pageSize}; margin: ${p.pageMargin} }`,
    `${root} { display: flex; flex-wrap: wrap; gap: 16px; }`,
    `${root} .parcel-label { width: ${p.labelWidthMm}mm; height: ${p.labelHeightMm}mm; box-sizing: border-box; }`,
    `@media print {`,
    `  html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; height: auto !important; overflow: visible !important; }`,
    `  body :not(${root}):not(:has(${root})):not(${root} *) { display: none !important; }`,
    `  :has(${root}) { display: block !important; position: static !important; overflow: visible !important; height: auto !important; min-height: 0 !important; max-width: none !important; width: auto !important; margin: 0 !important; padding: 0 !important; border: 0 !important; box-shadow: none !important; transform: none !important; }`,
    a6
      ? `  ${root} { display: block !important; }`
      : `  ${root} { display: grid !important; grid-template-columns: repeat(${p.cols}, ${p.labelWidthMm}mm); gap: 0 !important; }`,
    `  ${root} .parcel-label { break-inside: avoid; page-break-inside: avoid; ${a6 ? "border: 0 !important;" : "border: 0.2mm dashed #888 !important;"} }`,
    // 150 mm of label on a 150 mm page can spill a blank page by a rounding hair: print it a touch shorter.
    a6 ? `  ${root} .parcel-label { height: 149mm; }` : "",
    a6 ? `  ${root} .parcel-label { break-after: page; page-break-after: always; }` : "",
    a6 ? `  ${root} .parcel-label:last-child { break-after: auto; page-break-after: auto; }` : "",
    `}`,
  ]
    .filter(Boolean)
    .join("\n");
}
