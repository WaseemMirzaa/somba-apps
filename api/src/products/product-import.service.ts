import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { lookup } from 'dns/promises';
import { Repository } from 'typeorm';
import { Product, Seller } from '../database/entities';
import { CategoriesService } from '../catalog/categories.service';
import { NotificationsService } from '../notifications/notifications.service';
import { activePlanId } from '../content/plans';
import { SellersService } from '../ops/sellers.service';
import { parseCsv } from './csv';
import { isPrivateHost } from './image-url';
import { ProductsService, cleanListing, cleanSku } from './products.service';
import type { ListingInput } from './products.service';

/** Rows accepted per import; a bigger catalogue is sent in several files. */
export const MAX_IMPORT_ROWS = 500;
/** A file fetched from a link may be up to 2 MB; text sent over the socket must fit Socket.IO's 1 MB message limit. */
const MAX_CSV_BYTES = 2 * 1024 * 1024;
export const MAX_INLINE_BYTES = 900_000;

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Column names accepted (accents, case, spaces and punctuation ignored), English and French. */
const COLUMNS: Record<string, string> = {
  name: 'name', 'title': 'name', productname: 'name', nom: 'name', titre: 'name', nomduproduit: 'name', nomen: 'name', nameen: 'name', titleen: 'name',
  namefr: 'nameFr', titlefr: 'nameFr', nomfr: 'nameFr', titrefr: 'nameFr', nomfrancais: 'nameFr', frenchname: 'nameFr',
  description: 'description', descriptionen: 'description',
  descriptionfr: 'descriptionFr', frenchdescription: 'descriptionFr',
  price: 'price', prix: 'price', priceusd: 'price', prixusd: 'price',
  originalprice: 'originalPrice', prixbarre: 'originalPrice', prixinitial: 'originalPrice', compareatprice: 'originalPrice', listprice: 'originalPrice',
  category: 'category', categorie: 'category', categoryname: 'category',
  categoryid: 'categoryId', idcategorie: 'categoryId',
  stock: 'stock', quantity: 'stock', quantite: 'stock', qty: 'stock',
  sku: 'sku', reference: 'sku', ref: 'sku',
  brand: 'brand', marque: 'brand',
  weightgrams: 'weightGrams', weightg: 'weightGrams', poidsg: 'weightGrams', poidsgrammes: 'weightGrams',
  weightkg: 'weightKg', weight: 'weightKg', poids: 'weightKg', poidskg: 'weightKg',
  image: 'image', photo: 'image', imageurl: 'image',
  images: 'images', photos: 'images', imageurls: 'images',
  deliverydays: 'deliveryDays', delai: 'deliveryDays', delailivraison: 'deliveryDays', delaijours: 'deliveryDays',
  variants: 'variants', options: 'variants', variantes: 'variants',
  sourcelang: 'sourceLang', langue: 'sourceLang',
};

/** Column headers of the template file, in this order. */
export const TEMPLATE_HEADER = ['name', 'nameFr', 'description', 'descriptionFr', 'price', 'originalPrice', 'category', 'stock', 'sku', 'brand', 'weightKg', 'images', 'deliveryDays', 'variants'];
const TEMPLATE_ROWS = [
  ['Cotton T-shirt', 'T-shirt en coton', 'Soft everyday T-shirt.', 'T-shirt doux pour tous les jours.', '12.50', '15', 'Fashion', '40', 'TSH-001', 'Somba', '0.2', 'https://example.com/tshirt-1.jpg|https://example.com/tshirt-2.jpg', '3', 'Size=S|M|L;Colour=Black|White'],
  ['Phone case', '', '', '', '6', '', 'Electronics', '100', 'CASE-9', '', '', '', '', ''],
];

/** "Size=S|M|L; Colour=Black|White" -> option groups. */
export function parseVariantCell(cell: string): unknown {
  const text = cell.trim();
  if (!text) return null;
  return text
    .split(/[;\n]/)
    .map((g) => g.trim())
    .filter(Boolean)
    .map((g) => {
      const i = g.search(/[=:]/);
      if (i <= 0) throw new BadRequestException('Options look like "Size=S|M|L;Colour=Black|White".');
      return { name: g.slice(0, i).trim(), options: g.slice(i + 1).split(/[|,]/).map((o) => o.trim()).filter(Boolean) };
    });
}

export interface ImportRowReport {
  /** The row's line number in the file (the header is line 1). */
  row: number;
  name: string | null;
  sku: string | null;
  errors: string[];
  /** The product that was created (absent on a dry run or a failed row). */
  productId?: string;
}

export interface ImportReport {
  total: number;
  created: number;
  failed: number;
  dryRun: boolean;
  /** Every row that could not be imported, with why. */
  errors: ImportRowReport[];
  /** Every row that was (or, on a dry run, would be) imported. */
  products: ImportRowReport[];
}

@Injectable()
export class ProductImportService {
  constructor(
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    private readonly products: ProductsService,
    private readonly categories: CategoriesService,
    private readonly sellersSvc: SellersService,
    private readonly notifications: NotificationsService,
  ) {}

  /** `products:importTemplate`: a CSV to start from. */
  template(): { filename: string; csv: string; columns: string[] } {
    const csv = `﻿${[TEMPLATE_HEADER, ...TEMPLATE_ROWS].map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\r\n')}\r\n`;
    return { filename: 'products-template.csv', csv, columns: TEMPLATE_HEADER };
  }

  /** The file behind `csvUrl`: https only, a public host only, no redirects, 2 MB at most, 10 s. */
  private async fetchCsv(raw: string): Promise<string> {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new BadRequestException('The file link is not valid.');
    }
    if (url.protocol !== 'https:' || url.username || url.password) throw new BadRequestException('The file link must be a secure (https) address.');
    if (isPrivateHost(url.hostname)) throw new BadRequestException('The file link is not valid.');
    try {
      for (const a of await lookup(url.hostname, { all: true })) {
        if (isPrivateHost(a.address)) throw new BadRequestException('The file link is not valid.');
      }
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException('Could not reach the file. Check the link.');
    }
    let res: Response;
    try {
      res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10_000), headers: { accept: 'text/csv,text/plain,*/*' } });
    } catch {
      throw new BadRequestException('Could not download the file. Check the link.');
    }
    if (!res.ok) throw new BadRequestException(`The file could not be downloaded (${res.status}).`);
    if (Number(res.headers.get('content-length') ?? 0) > MAX_CSV_BYTES) throw new BadRequestException('The file is too large (2 MB at most).');
    const reader = res.body?.getReader();
    if (!reader) throw new BadRequestException('The file is empty.');
    const parts: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_CSV_BYTES) {
        await reader.cancel();
        throw new BadRequestException('The file is too large (2 MB at most).');
      }
      parts.push(value);
    }
    return Buffer.concat(parts).toString('utf8');
  }

  /** Rows as objects keyed by the canonical field names (unknown columns are ignored). */
  private async load(input: { rows?: unknown; csv?: unknown; csvUrl?: unknown }): Promise<Record<string, string>[]> {
    if (Array.isArray(input.rows)) {
      return input.rows.map((r) => {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries((r && typeof r === 'object' ? r : {}) as Record<string, unknown>)) {
          const f = COLUMNS[fold(k)];
          if (f && v !== undefined && v !== null) out[f] = Array.isArray(v) ? v.join('|') : typeof v === 'object' ? JSON.stringify(v) : String(v);
        }
        return out;
      });
    }
    let text: string;
    if (typeof input.csv === 'string' && input.csv.trim()) text = input.csv;
    else if (typeof input.csvUrl === 'string' && input.csvUrl.trim()) text = await this.fetchCsv(input.csvUrl.trim());
    else throw new BadRequestException('Send the products as `rows`, `csv` text or a `csvUrl`.');
    const inline = typeof input.csv === 'string' && !!input.csv.trim();
    if (Buffer.byteLength(text) > (inline ? MAX_INLINE_BYTES : MAX_CSV_BYTES)) {
      throw new BadRequestException(inline ? 'The file is too large to send here (900 KB at most): split it, or give a link to it.' : 'The file is too large (2 MB at most).');
    }
    const grid = parseCsv(text);
    if (grid.length < 2) throw new BadRequestException('The file needs a header line and at least one product.');
    const header = grid[0].map((h) => COLUMNS[fold(h)] ?? null);
    if (!header.includes('name') && !header.includes('nameFr')) throw new BadRequestException('The file needs a "name" column.');
    if (!header.includes('price')) throw new BadRequestException('The file needs a "price" column.');
    return grid.slice(1).map((cells) => {
      const out: Record<string, string> = {};
      header.forEach((f, i) => {
        if (f && cells[i] !== undefined && cells[i].trim() !== '') out[f] = cells[i].trim();
      });
      return out;
    });
  }

  /** Turns one row into the listing a seller could have typed. */
  private static listingOf(row: Record<string, string>, problems: string[] = []): ListingInput {
    const input: ListingInput = {};
    const decimal = (s: string) => (/^\d+,\d+$/.test(s) ? s.replace(',', '.') : s);
    for (const [k, v] of Object.entries(row)) {
      switch (k) {
        case 'price':
        case 'originalPrice':
        case 'weightKg':
          (input as Record<string, unknown>)[k] = decimal(v);
          break;
        case 'images':
          input.images = v.split(/[|\n]/).map((s) => s.trim()).filter(Boolean);
          break;
        case 'variants':
          try {
            input.variants = parseVariantCell(v);
          } catch (e) {
            problems.push((e as Error).message); // reported with the row's other problems
          }
          break;
        case 'category':
          input.category = v;
          break;
        default:
          (input as Record<string, unknown>)[k] = v;
      }
    }
    if (input.stock === undefined) input.stock = 0;
    return input;
  }

  /**
   * Every problem of one row, not just the first: `cleanListing` stops at the first bad value, so the row is also
   * checked field by field (each bad value says why) and for the title it cannot do without.
   */
  private static rowErrors(input: ListingInput, first: string | null): string[] {
    const out: string[] = [];
    const add = (m: string) => {
      if (!out.includes(m)) out.push(m);
    };
    const hasTitle = (typeof input.name === 'string' && input.name.trim() !== '') || (typeof input.nameFr === 'string' && input.nameFr.trim() !== '');
    if (!hasTitle) add('Enter a product title in English or French.');
    // The price is required: an empty row says so; a given one is checked on its own.
    try {
      cleanListing({ price: input.price }, { partial: false, allowStatus: false });
    } catch (e) {
      add((e as Error).message);
    }
    for (const [key, value] of Object.entries(input)) {
      if (key === 'price') continue;
      try {
        cleanListing({ [key]: value } as ListingInput, { partial: true, allowStatus: false });
      } catch (e) {
        add((e as Error).message);
      }
    }
    if (first) add(first);
    return out;
  }

  /**
   * `products:import`: create many products at once. Every row is checked on its own (the same rules as
   * `products:create`) and reported; the valid ones are created as PENDING products awaiting moderation. A bad row
   * never blocks the good ones. `dryRun: true` only checks. Titles and descriptions in one language are translated
   * into the other by the usual pipeline. For an admin, `sellerId` names the store the products go to.
   */
  async import(user: { id: string; role: string }, input: { rows?: unknown; csv?: unknown; csvUrl?: unknown; dryRun?: unknown; sellerId?: unknown }): Promise<ImportReport> {
    const admin = user.role.startsWith('admin');
    if (user.role !== 'seller' && !admin) throw new BadRequestException('Only sellers or admins can import products.');
    const seller = admin && input.sellerId ? await this.sellers.findOne({ where: { id: String(input.sellerId) } }) : await this.sellersSvc.byUser(user.id);
    if (!seller) throw new BadRequestException(admin ? 'Choose a store (sellerId).' : 'Open a store first.');
    if (user.role === 'seller' && seller.status !== 'approved') {
      throw new BadRequestException(seller.status === 'pending' ? 'Your store is awaiting approval — you can list products once it is approved.' : 'Your store is not active. Contact support.');
    }
    const dryRun = input.dryRun === true;
    const rows = await this.load(input);
    if (!rows.length) throw new BadRequestException('The file has no products.');
    if (rows.length > MAX_IMPORT_ROWS) throw new BadRequestException(`Import at most ${MAX_IMPORT_ROWS} products at a time.`);

    const plan = (await this.sellersSvc.plans()).find((p) => p.id === activePlanId(seller));
    let room = plan?.maxProducts ? plan.maxProducts - (await this.products.countForSeller([seller.id, ...(seller.userId ? [seller.userId] : [])])) : Infinity;
    const seenSku = new Set<string>();
    const errors: ImportRowReport[] = [];
    const ok: ImportRowReport[] = [];

    for (const [i, row] of rows.entries()) {
      const report: ImportRowReport = { row: i + 2, name: row.name ?? row.nameFr ?? null, sku: row.sku ?? null, errors: [] };
      let clean: ReturnType<typeof cleanListing> | null = null;
      const problems: string[] = [];
      const listing = ProductImportService.listingOf(row, problems);
      try {
        clean = cleanListing(listing, { partial: false, allowStatus: false });
        if (!clean.text.name && !clean.text.nameFr) report.errors.push('Enter a product title in English or French.');
      } catch (e) {
        // Say everything that is wrong with the row, not only the first thing the validator tripped on.
        report.errors.push(...ProductImportService.rowErrors(listing, (e as Error).message));
      }
      for (const p of problems) if (!report.errors.includes(p)) report.errors.push(p);
      // The category and the SKU are checked even when another field is wrong, so one pass shows every problem.
      const category = clean?.category ?? {
        id: typeof listing.categoryId === 'string' && listing.categoryId.trim() ? listing.categoryId.trim() : undefined,
        name: typeof listing.category === 'string' && listing.category.trim() ? listing.category.trim().slice(0, 100) : undefined,
      };
      try {
        await this.categories.resolveRef(category);
      } catch (e) {
        if (!report.errors.includes((e as Error).message)) report.errors.push((e as Error).message);
      }
      let sku: string | null = null;
      try {
        sku = clean ? (clean.columns.sku ?? null) : cleanSku(listing.sku);
      } catch {
        sku = null; // its own message is already in the list
      }
      if (sku) {
        const key = sku.toLowerCase();
        if (seenSku.has(key)) report.errors.push(`The SKU "${sku}" appears twice in this file.`);
        else if (await this.skuTaken(seller.id, sku)) report.errors.push(`The SKU "${sku}" is already used by another of your products.`);
        seenSku.add(key);
      }
      if (!report.errors.length && room <= 0) report.errors.push(`Your ${plan?.name ?? ''} plan allows ${plan?.maxProducts} listings: upgrade it to add more.`.replace('  ', ' '));
      if (report.errors.length || !clean) {
        errors.push(report);
        continue;
      }
      if (dryRun) {
        room--;
        ok.push(report);
        continue;
      }
      try {
        const product = await this.products.create(clean, { status: 'pending', sellerId: seller.id, stockReason: 'import', actorId: user.id });
        report.productId = product.id;
        room--;
        ok.push(report);
      } catch (e) {
        report.errors.push((e as Error).message);
        errors.push(report);
      }
    }
    if (!dryRun && ok.length) {
      await this.notifications.toAdmins({
        title: 'Product awaiting review',
        body: `${ok.length} products imported by ${seller.name} need moderation.`,
        type: 'moderation',
      });
    }
    return { total: rows.length, created: dryRun ? 0 : ok.length, failed: errors.length, dryRun, errors, products: ok };
  }

  private async skuTaken(sellerId: string, sku: string): Promise<boolean> {
    return this.productRepo.createQueryBuilder('p').where('p.sellerId = :sellerId AND LOWER(p.sku) = LOWER(:sku)', { sellerId, sku }).getExists();
  }
}
