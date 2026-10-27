import { PAGE_H, PAGE_W, PdfDoc } from '../common/pdf/mini-pdf';
import { fixed2 } from './finance.util';

export interface InvoiceLine {
  orderReference: string;
  /** YYYY-MM-DD */
  date: string;
  productName: string;
  qty: number;
  grossUsd: number;
  commissionPct: number;
  commissionUsd: number;
  /** A line taken back (the order was returned): its amounts are negative. */
  credit: boolean;
}

export interface InvoiceData {
  number: string;
  /** YYYY-MM */
  period: string;
  issuedAt: Date;
  locale: 'en' | 'fr';
  seller: { name: string; legalName: string | null; taxNumber: string | null; rccm: string | null };
  lines: InvoiceLine[];
  totals: { orders: number; units: number; grossUsd: number; commissionUsd: number; creditedUsd: number; netUsd: number };
}

const TEXT = {
  en: {
    title: 'COMMISSION INVOICE',
    number: 'Invoice no.',
    period: 'Period',
    issued: 'Issued',
    from: 'From',
    to: 'Billed to',
    taxNo: 'Tax no.',
    rccm: 'RCCM',
    order: 'Order',
    date: 'Date',
    product: 'Product',
    qty: 'Qty',
    sales: 'Sales',
    rate: 'Rate',
    commission: 'Commission',
    credit: 'credit',
    orders: 'Orders',
    units: 'Units sold',
    gross: 'Sales (after store coupons)',
    commissionDue: 'Commission charged',
    credited: 'Commission credited (returns)',
    total: 'TOTAL COMMISSION DUE',
    net: 'Net to the seller',
    note: 'Commission is charged on delivered sales, after store coupons the seller funded. Commission on goods that were returned is credited. All amounts in US dollars.',
    page: 'Page',
    empty: 'No sales this month.',
    platform: 'Somba&Teka marketplace',
  },
  fr: {
    title: 'FACTURE DE COMMISSION',
    number: 'Facture n°',
    period: 'Période',
    issued: 'Émise le',
    from: 'Émetteur',
    to: 'Facturé à',
    taxNo: 'N° d’impôt',
    rccm: 'RCCM',
    order: 'Commande',
    date: 'Date',
    product: 'Produit',
    qty: 'Qté',
    sales: 'Ventes',
    rate: 'Taux',
    commission: 'Commission',
    credit: 'avoir',
    orders: 'Commandes',
    units: 'Unités vendues',
    gross: 'Ventes (après coupons boutique)',
    commissionDue: 'Commission facturée',
    credited: 'Commission créditée (retours)',
    total: 'TOTAL DE COMMISSION DÛ',
    net: 'Net pour le vendeur',
    note: 'La commission est calculée sur les ventes livrées, après les coupons financés par la boutique. La commission sur les articles retournés est créditée. Tous les montants sont en dollars américains.',
    page: 'Page',
    empty: 'Aucune vente ce mois-ci.',
    platform: 'Place de marché Somba&Teka',
  },
} as const;

const MONTHS = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
} as const;

/** "2026-10" as "October 2026" / "octobre 2026". */
export function periodLabel(period: string, locale: 'en' | 'fr'): string {
  const [y, m] = period.split('-');
  return `${MONTHS[locale][Number(m) - 1] ?? m} ${y}`;
}

/** Money as the reader writes it: "$1,234.50" or "1 234,50 $". */
export function money(n: number, locale: 'en' | 'fr'): string {
  const sign = n < 0 ? '-' : '';
  const [whole, cents] = fixed2(Math.abs(n)).split('.');
  if (locale === 'fr') return `${sign}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${cents} $`;
  return `${sign}$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${cents}`;
}

const dateOut = (iso: string, locale: 'en' | 'fr') => (locale === 'fr' ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);

/** The commission invoice as a PDF, in the seller's language. */
export function renderCommissionInvoice(d: InvoiceData): Buffer {
  const t = TEXT[d.locale];
  const doc = new PdfDoc({ title: `${t.title} ${d.number}`, author: 'Somba&Teka' });
  const L = 40;
  const R = PAGE_W - 40;
  let pageNo = 1;

  const header = () => {
    doc.rect(0, 0, PAGE_W, 78, 0.12);
    doc.text(L, 38, 'Somba&Teka', { size: 20, bold: true, gray: 1 });
    doc.text(L, 56, t.platform, { size: 9, gray: 0.85 });
    doc.text(R, 38, t.title, { size: 14, bold: true, align: 'right', gray: 1 });
    doc.text(R, 56, `${t.number} ${d.number}`, { size: 9, align: 'right', gray: 0.85 });
  };
  const footer = () => {
    doc.line(L, PAGE_H - 44, R, PAGE_H - 44);
    doc.text(L, PAGE_H - 30, `${t.number} ${d.number} · ${periodLabel(d.period, d.locale)}`, { size: 8, gray: 0.4 });
    doc.text(R, PAGE_H - 30, `${t.page} ${pageNo}`, { size: 8, align: 'right', gray: 0.4 });
  };
  header();

  // Parties and meta
  let y = 112;
  doc.text(L, y, t.from, { size: 8, bold: true, gray: 0.45 });
  doc.text(L, y + 14, 'Somba&Teka', { size: 11, bold: true });
  doc.text(L, y + 28, t.platform, { size: 9, gray: 0.3 });
  const colB = 320;
  doc.text(colB, y, t.to, { size: 8, bold: true, gray: 0.45 });
  doc.text(colB, y + 14, d.seller.legalName || d.seller.name, { size: 11, bold: true });
  let by = y + 28;
  if (d.seller.legalName && d.seller.legalName !== d.seller.name) {
    doc.text(colB, by, d.seller.name, { size: 9, gray: 0.3 });
    by += 12;
  }
  if (d.seller.taxNumber) {
    doc.text(colB, by, `${t.taxNo} ${d.seller.taxNumber}`, { size: 9, gray: 0.3 });
    by += 12;
  }
  if (d.seller.rccm) {
    doc.text(colB, by, `${t.rccm} ${d.seller.rccm}`, { size: 9, gray: 0.3 });
    by += 12;
  }
  y = Math.max(by, y + 44) + 6;
  doc.text(L, y, `${t.period}: ${periodLabel(d.period, d.locale)}`, { size: 10, bold: true });
  doc.text(R, y, `${t.issued}: ${dateOut(d.issuedAt.toISOString().slice(0, 10), d.locale)}`, { size: 10, align: 'right' });
  y += 24;

  // Table
  const cols = { order: L, date: L + 82, product: L + 142, qty: L + 332, sales: L + 392, rate: L + 432, comm: R };
  const head = (yy: number) => {
    doc.rect(L, yy - 11, R - L, 18, 0.9);
    doc.text(cols.order + 4, yy + 1, t.order, { size: 8, bold: true });
    doc.text(cols.date, yy + 1, t.date, { size: 8, bold: true });
    doc.text(cols.product, yy + 1, t.product, { size: 8, bold: true });
    doc.text(cols.qty, yy + 1, t.qty, { size: 8, bold: true, align: 'right' });
    doc.text(cols.sales + 40, yy + 1, t.sales, { size: 8, bold: true, align: 'right' });
    doc.text(cols.rate + 30, yy + 1, t.rate, { size: 8, bold: true, align: 'right' });
    doc.text(cols.comm - 4, yy + 1, t.commission, { size: 8, bold: true, align: 'right' });
  };
  head(y);
  y += 20;
  const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
  if (!d.lines.length) {
    doc.text(L + 4, y + 4, t.empty, { size: 9, gray: 0.4 });
    y += 24;
  }
  for (const l of d.lines) {
    if (y > PAGE_H - 150) {
      footer();
      doc.addPage();
      pageNo++;
      header();
      y = 110;
      head(y);
      y += 20;
    }
    const sign = l.credit ? -1 : 1;
    doc.text(cols.order + 4, y, clip(l.orderReference, 14), { size: 8 });
    doc.text(cols.date, y, dateOut(l.date, d.locale), { size: 8 });
    doc.text(cols.product, y, clip(l.productName + (l.credit ? ` (${t.credit})` : ''), 36), { size: 8 });
    doc.text(cols.qty, y, String(l.qty), { size: 8, align: 'right' });
    doc.text(cols.sales + 40, y, money(sign * l.grossUsd, d.locale), { size: 8, align: 'right' });
    doc.text(cols.rate + 30, y, `${l.commissionPct}%`, { size: 8, align: 'right' });
    doc.text(cols.comm - 4, y, money(sign * l.commissionUsd, d.locale), { size: 8, align: 'right' });
    doc.line(L, y + 5, R, y + 5, { gray: 0.88, width: 0.3 });
    y += 15;
  }

  // Totals
  if (y > PAGE_H - 210) {
    footer();
    doc.addPage();
    pageNo++;
    header();
    y = 110;
  }
  y += 10;
  const row = (label: string, value: string, bold = false) => {
    doc.text(R - 150, y, label, { size: bold ? 10 : 9, bold, align: 'right' });
    doc.text(R, y, value, { size: bold ? 10 : 9, bold, align: 'right' });
    y += 15;
  };
  row(t.orders, String(d.totals.orders));
  row(t.units, String(d.totals.units));
  row(t.gross, money(d.totals.grossUsd, d.locale));
  row(t.commissionDue, money(d.totals.commissionUsd, d.locale));
  row(t.credited, money(-d.totals.creditedUsd, d.locale));
  doc.line(R - 260, y - 6, R, y - 6, { gray: 0.3, width: 0.8 });
  y += 4;
  row(t.total, money(d.totals.commissionUsd - d.totals.creditedUsd, d.locale), true);
  row(t.net, money(d.totals.netUsd, d.locale));
  y += 14;
  // Note, wrapped to the page width
  const words = t.note.split(' ');
  let lineText = '';
  for (const w of words) {
    const next = lineText ? `${lineText} ${w}` : w;
    if (next.length > 105) {
      doc.text(L, y, lineText, { size: 8, gray: 0.4 });
      y += 11;
      lineText = w;
    } else lineText = next;
  }
  if (lineText) doc.text(L, y, lineText, { size: 8, gray: 0.4 });
  footer();
  return doc.toBuffer();
}
