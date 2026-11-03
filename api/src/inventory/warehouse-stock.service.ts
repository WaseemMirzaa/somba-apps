import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { EntityManager, In, Repository } from 'typeorm';
import { AuditLog, DeliveryTask, Hub, OUT_REASONS, Product, RECEIVE_REASONS, WarehouseBin, WarehouseLedger, WarehouseStock } from '../database/entities';
import type { LedgerKind, LedgerReason } from '../database/entities';
import { DEFAULT_VARIANT, checkVariant, storedVariantGroups } from '../common/variants/variants';
import { pageOf } from '../common/paging';
import { Actor, LogisticsEvent, LogisticsService } from '../logistics/logistics.service';
import { isHubBound } from '../logistics/leg-rules';
import { tierAllows } from '../logistics/tiers';
import type { DeskAction } from '../logistics/tiers';
import { ProductsService } from '../products/products.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ADMIN_ROLES } from '../notifications/notifications.service';

/** Admin roles that may change a warehouse's stock (every admin may read it). Warehouse staff by tier. */
export const STOCK_ADMINS: readonly string[] = ['admin', 'admin_operations'];
export const RECEIVING_BIN = 'RECV';
export const MAX_QTY = 1_000_000;

/** A whole number of units, 1 .. MAX_QTY. */
export function units(x: unknown, what = 'units'): number {
  const n = typeof x === 'number' ? x : Number(x);
  if (!Number.isInteger(n) || n < 1 || n > MAX_QTY) throw new BadRequestException(`Enter a whole number of ${what}, at least 1.`);
  return n;
}

/** A bin code as printed on its label: upper-case letters, digits and . _ / - ; 1..40 characters. */
export function binCode(x: unknown): string {
  const code = typeof x === 'string' ? x.trim().toUpperCase() : '';
  if (!/^[A-Z0-9][A-Z0-9._/-]{0,39}$/.test(code)) throw new BadRequestException('A bin code uses letters, digits and . _ / - (up to 40 characters).');
  return code;
}

/** What the desk shows for a product, and what is printed on its shelf label. */
export const skuOf = (productId: string): string => `SKU-${productId.slice(0, 6)}`;

let lastMs = 0;
let seq = 0;
/** A time-ordered UUID (v7 layout): sorting ids sorts lines by when they were written, even inside one millisecond. */
export function ledgerId(now = Date.now()): string {
  if (now > lastMs) {
    lastMs = now;
    seq = 0;
  } else {
    seq += 1;
    if (seq > 0xfff) {
      lastMs += 1;
      seq = 0;
    }
  }
  const hex = lastMs.toString(16).padStart(12, '0');
  const rnd = randomBytes(8);
  rnd[0] = (rnd[0] & 0x3f) | 0x80; // variant
  const tail = rnd.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8)}-7${seq.toString(16).padStart(3, '0')}-${tail.slice(0, 4)}-${tail.slice(4)}`;
}

const short = (s: string): string => createHash('sha1').update(s).digest('hex').slice(0, 28);

export interface StockLine {
  productId: string;
  variant: string;
  qty: number;
}

interface Ctx {
  hubId: string;
  actor: Actor;
}

/**
 * The warehouse stock ledger (WS-C): bins in a warehouse, what each bin holds, and one ledger line for every receipt, bin
 * move, cycle count and stock-out. It sits ON TOP of parcel custody and never changes it: parcels still move through
 * `delivery_tasks`; this records where the goods sit in the building while they are there.
 *
 * Rules (each one is enforced here and again by the database where it can):
 *  - Stock never goes below zero. Every decrease is one conditional UPDATE (`qty >= n`), so two people taking the last
 *    units at once cannot both succeed; the table also has `CHECK (qty >= 0)`.
 *  - Every change writes its ledger line in the SAME transaction: there is no stock without its history.
 *  - Lines are never edited or deleted; `warehouse_stock` is the running total of `warehouse_ledger`.
 *  - A parcel can be put away only up to what it carries, and only once it was scanned in at this warehouse.
 *  - A movement with a `clientRef` is recorded once, however often it is sent (double tap, retry).
 *  - Dispatching a parcel stocks out, automatically and never blocking the dispatch, what that order had put away here.
 */
@Injectable()
export class WarehouseStockService implements OnModuleInit {
  private readonly logger = new Logger(WarehouseStockService.name);

  constructor(
    @InjectRepository(WarehouseBin) private readonly bins: Repository<WarehouseBin>,
    @InjectRepository(WarehouseStock) private readonly stock: Repository<WarehouseStock>,
    @InjectRepository(WarehouseLedger) private readonly ledgerRepo: Repository<WarehouseLedger>,
    @InjectRepository(DeliveryTask) private readonly tasks: Repository<DeliveryTask>,
    @InjectRepository(Hub) private readonly hubs: Repository<Hub>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    private readonly products: ProductsService,
    private readonly logistics: LogisticsService,
    private readonly emitter: RealtimeEmitter,
  ) {}

  onModuleInit(): void {
    // Dispatch is detected from the legs model: no hook inside the logistics service.
    this.logistics.registerListener((e) => this.onLogistics(e));
  }

  // ── who may do what ───────────────────────────────────────────────────────────
  /** Staff are always limited to their own warehouse; an admin names one (required for a write, optional for a read). */
  private async scope(actor: Actor, requested: unknown, write: boolean): Promise<string | null> {
    if (actor.role.startsWith('admin')) {
      const id = typeof requested === 'string' && requested ? requested : null;
      if (!id) {
        if (write) throw new BadRequestException('Choose a warehouse first.');
        return null;
      }
      if (!(await this.hubs.exist({ where: { id } }))) throw new NotFoundException('Warehouse not found.');
      return id;
    }
    if (actor.role !== 'warehouse_staff') throw new ForbiddenException('Staff only.');
    if (!actor.hubId) throw new ForbiddenException('Your account is not linked to a warehouse. Ask an administrator.');
    return actor.hubId;
  }

  private allow(actor: Actor, action: DeskAction): void {
    if (actor.role.startsWith('admin')) {
      if (!STOCK_ADMINS.includes(actor.role)) throw new ForbiddenException('Only operations administrators and warehouse staff can change warehouse stock.');
      return;
    }
    if (!tierAllows(actor.role, actor.tier, action)) {
      throw new ForbiddenException(action === 'scan' ? 'Staff only.' : 'Only supervisors and managers can do this.');
    }
  }

  private async ctx(actor: Actor, hubArg: unknown, action: DeskAction): Promise<Ctx> {
    this.allow(actor, action);
    return { actor, hubId: (await this.scope(actor, hubArg, true)) as string };
  }

  // ── plumbing ──────────────────────────────────────────────────────────────────
  private get isMysql(): boolean {
    return this.bins.manager.connection.options.type === 'mysql';
  }

  /**
   * One transaction. MySQL: read-committed, so a total read after our own write sees what others committed, and any number
   * run side by side (the conditional updates below are what keep them correct). SQLite (tests, local dev) has ONE
   * connection that cannot hold two transactions at once, so there they take turns.
   */
  private tx<T>(fn: (m: EntityManager) => Promise<T>): Promise<T> {
    if (this.isMysql) return this.withDeadlockRetry(() => this.bins.manager.transaction('READ COMMITTED', fn));
    const run = this.turn.then(() => this.bins.manager.transaction(fn));
    this.turn = run.then(() => undefined, () => undefined);
    return run;
  }

  private turn: Promise<void> = Promise.resolve();

  /**
   * Two moves in opposite directions between the same two bins can lock the rows in opposite order; MySQL then picks one
   * as the deadlock victim and rolls it back whole. Nothing was written, so it is simply run again (a few times).
   */
  private async withDeadlockRetry<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fn();
      } catch (e) {
        const err = e as { code?: string; errno?: number; driverError?: { code?: string; errno?: number } };
        const code = err.code ?? err.driverError?.code;
        const errno = err.errno ?? err.driverError?.errno;
        const deadlock = code === 'ER_LOCK_DEADLOCK' || errno === 1213 || code === 'ER_LOCK_WAIT_TIMEOUT' || errno === 1205;
        if (!deadlock || attempt >= 4) throw e;
        await new Promise((r) => setTimeout(r, 15 * attempt + Math.floor(Math.random() * 25)));
      }
    }
  }

  private async product(productId: unknown, variant: unknown): Promise<{ productId: string; variant: string; name: string }> {
    const id = typeof productId === 'string' ? productId.trim() : '';
    const p = id ? await this.products.getRaw(id) : null;
    if (!p || p.status === 'removed') throw new NotFoundException('Product not found.');
    const groups = storedVariantGroups(p.variants);
    const label = groups.length ? checkVariant(groups, variant, p.name) : DEFAULT_VARIANT;
    return { productId: p.id, variant: label, name: p.name };
  }

  private async binOf(m: EntityManager, hubId: string, ref: { binId?: unknown; binCode?: unknown }, opts: { create?: boolean; active?: boolean } = {}): Promise<WarehouseBin> {
    const repo = m.getRepository(WarehouseBin);
    let bin: WarehouseBin | null = null;
    if (typeof ref.binId === 'string' && ref.binId) bin = await repo.findOne({ where: { id: ref.binId, hubId } });
    else if (typeof ref.binCode === 'string' && ref.binCode.trim()) bin = await repo.findOne({ where: { hubId, code: binCode(ref.binCode) } });
    else if (opts.create) bin = await this.receivingBin(m, hubId);
    else throw new BadRequestException('Choose a bin.');
    if (!bin) throw new BadRequestException('That bin does not exist in this warehouse. Ask a supervisor to create it.');
    if (opts.active && !bin.active) throw new BadRequestException(`Bin ${bin.code} is switched off. Choose another bin.`);
    return bin;
  }

  /** Every warehouse has a receiving area; it is created on first use. */
  private async receivingBin(m: EntityManager, hubId: string): Promise<WarehouseBin> {
    const repo = m.getRepository(WarehouseBin);
    const found = await repo.findOne({ where: { hubId, code: RECEIVING_BIN } });
    if (found) return found;
    try {
      return await repo.save(repo.create({ hubId, code: RECEIVING_BIN, label: 'Receiving', active: true }));
    } catch {
      return (await repo.findOneOrFail({ where: { hubId, code: RECEIVING_BIN } })); // created by someone a moment ago
    }
  }

  private slotWhere(hubId: string, binId: string, productId: string, variant: string) {
    return { hubId, binId, productId, variant };
  }

  /** Units of one option in one bin. */
  private async inBin(m: EntityManager, hubId: string, binId: string, productId: string, variant: string): Promise<number> {
    return (await m.getRepository(WarehouseStock).findOne({ where: this.slotWhere(hubId, binId, productId, variant) }))?.qty ?? 0;
  }

  /** Units of one option in the whole warehouse. */
  private async onHandOf(m: EntityManager, hubId: string, productId: string, variant: string): Promise<number> {
    const r = await m
      .getRepository(WarehouseStock)
      .createQueryBuilder('s')
      .select('COALESCE(SUM(s.qty), 0)', 'n')
      .where('s.hubId = :hubId AND s.productId = :productId AND s.variant = :variant', { hubId, productId, variant })
      .getRawOne<{ n: string | number }>();
    return Number(r?.n ?? 0);
  }

  /** Put units into a bin: raise the row, or create it (a concurrent creator is retried as a raise). */
  private async addTo(m: EntityManager, hubId: string, binId: string, productId: string, variant: string, n: number): Promise<void> {
    const raise = () =>
      m
        .createQueryBuilder()
        .update(WarehouseStock)
        .set({ qty: () => 'qty + :n' })
        .where('hubId = :hubId AND binId = :binId AND productId = :productId AND variant = :variant', { hubId, binId, productId, variant, n })
        .execute();
    if ((await raise()).affected) return;
    try {
      await m.getRepository(WarehouseStock).insert({ hubId, binId, productId, variant, qty: n });
    } catch {
      if (!(await raise()).affected) throw new BadRequestException('This bin was just updated. Refresh and try again.');
    }
  }

  /** Take units out of a bin, never below zero: one conditional UPDATE decides, whoever asks first wins. */
  private async takeFrom(m: EntityManager, hubId: string, bin: WarehouseBin, productId: string, variant: string, n: number, name: string): Promise<void> {
    const r = await m
      .createQueryBuilder()
      .update(WarehouseStock)
      .set({ qty: () => 'qty - :n' })
      .where('hubId = :hubId AND binId = :binId AND productId = :productId AND variant = :variant AND qty >= :n', { hubId, binId: bin.id, productId, variant, n })
      .execute();
    if (r.affected) return;
    const have = await this.inBin(m, hubId, bin.id, productId, variant);
    const what = variant === DEFAULT_VARIANT ? name : `${name} (${variant})`;
    throw new BadRequestException(have <= 0 ? `Bin ${bin.code} holds no ${what}.` : `Bin ${bin.code} holds only ${have} of ${what}: you cannot take ${n}.`);
  }

  private async write(m: EntityManager, c: Ctx, row: Partial<WarehouseLedger> & { productId: string; variant: string; kind: LedgerKind; reason: LedgerReason; qty: number; delta: number }): Promise<WarehouseLedger> {
    const repo = m.getRepository(WarehouseLedger);
    const onHandAfter = await this.onHandOf(m, c.hubId, row.productId, row.variant);
    return repo.save(
      repo.create({
        id: ledgerId(),
        hubId: c.hubId,
        actorId: c.actor.id,
        actorName: c.actor.name,
        fromBinId: null,
        toBinId: null,
        fromBinCode: null,
        toBinCode: null,
        expectedQty: null,
        countedQty: null,
        taskId: null,
        orderId: null,
        note: null,
        clientRef: null,
        ...row,
        onHandAfter,
      }),
    );
  }

  private cleanNote(x: unknown): string | null {
    const s = typeof x === 'string' ? x.trim() : '';
    if (s.length > 200) throw new BadRequestException('Keep the note under 200 characters.');
    return s || null;
  }

  private cleanRef(x: unknown): string | null {
    if (x === undefined || x === null || x === '') return null;
    const s = typeof x === 'string' ? x.trim() : '';
    if (!s || s.length > 64) throw new BadRequestException('A request reference is at most 64 characters.');
    return s;
  }

  /** The lines already recorded under a reference (a retry of the same request answers with them). */
  private async seen(hubId: string, ref: string | null, count = 1): Promise<WarehouseLedger[] | null> {
    if (!ref) return null;
    const keys = Array.from({ length: count }, (_, i) => (count === 1 ? ref : `${ref}:${i}`));
    const rows = await this.ledgerRepo.find({ where: { clientRef: In(keys) } });
    if (!rows.length) return null;
    if (rows.some((r) => r.hubId !== hubId)) throw new BadRequestException('This request reference was already used.');
    return rows;
  }

  private done(hubId: string, ...productIds: string[]): void {
    const payload = { hubId, productIds };
    this.emitter.toHub(hubId, 'stock:updated', payload);
    this.emitter.toRoles([...ADMIN_ROLES], 'stock:updated', payload);
  }

  // ── bins ──────────────────────────────────────────────────────────────────────
  async createBin(actor: Actor, input: { hubId?: unknown; code?: unknown; label?: unknown }): Promise<WarehouseBin> {
    const c = await this.ctx(actor, input.hubId, 'oversee');
    const code = binCode(input.code);
    const label = typeof input.label === 'string' && input.label.trim() ? input.label.trim().slice(0, 120) : null;
    if (await this.bins.exist({ where: { hubId: c.hubId, code } })) throw new BadRequestException(`Bin ${code} already exists in this warehouse.`);
    try {
      const row = await this.bins.save(this.bins.create({ hubId: c.hubId, code, label, active: true }));
      this.done(c.hubId);
      return row;
    } catch {
      throw new BadRequestException(`Bin ${code} already exists in this warehouse.`);
    }
  }

  async updateBin(actor: Actor, input: { hubId?: unknown; binId?: unknown; label?: unknown; active?: unknown }): Promise<WarehouseBin> {
    const c = await this.ctx(actor, input.hubId, 'oversee');
    const bin = await this.bins.findOne({ where: { id: String(input.binId ?? ''), hubId: c.hubId } });
    if (!bin) throw new NotFoundException('Bin not found.');
    if (typeof input.label === 'string') bin.label = input.label.trim().slice(0, 120) || null;
    if (typeof input.active === 'boolean' && input.active !== bin.active) {
      if (!input.active) {
        if (bin.code === RECEIVING_BIN) throw new BadRequestException('The receiving area cannot be switched off.');
        const held = await this.stock.createQueryBuilder('s').select('COALESCE(SUM(s.qty), 0)', 'n').where('s.binId = :id', { id: bin.id }).getRawOne<{ n: string }>();
        if (Number(held?.n ?? 0) > 0) throw new BadRequestException(`Bin ${bin.code} still holds stock. Move it or count it out first.`);
      }
      bin.active = input.active;
    }
    const saved = await this.bins.save(bin);
    this.done(c.hubId);
    return saved;
  }

  /** The bins of a warehouse with what they hold. */
  async listBins(actor: Actor, input: { hubId?: unknown } = {}): Promise<{ id: string; hubId: string; code: string; label: string | null; active: boolean; units: number; skus: number }[]> {
    const hubId = await this.scope(actor, input.hubId, false);
    const bins = await this.bins.find({ where: hubId ? { hubId } : {}, order: { code: 'ASC' }, take: 2000 });
    if (!bins.length) return [];
    const totals = await this.stock
      .createQueryBuilder('s')
      .select('s.binId', 'binId')
      .addSelect('COALESCE(SUM(s.qty), 0)', 'units')
      .addSelect('COUNT(*)', 'skus')
      .where('s.binId IN (:...ids) AND s.qty > 0', { ids: bins.map((b) => b.id) })
      .groupBy('s.binId')
      .getRawMany<{ binId: string; units: string; skus: string }>();
    const by = new Map(totals.map((t) => [t.binId, t]));
    return bins.map((b) => ({ id: b.id, hubId: b.hubId, code: b.code, label: b.label, active: b.active, units: Number(by.get(b.id)?.units ?? 0), skus: Number(by.get(b.id)?.skus ?? 0) }));
  }

  // ── receive ───────────────────────────────────────────────────────────────────
  /** A manual receipt: units arrive with no parcel (a delivery note, a supplier drop, a return handed in). */
  async receive(
    actor: Actor,
    input: { hubId?: unknown; productId?: unknown; variant?: unknown; qty?: unknown; binId?: unknown; binCode?: unknown; reason?: unknown; note?: unknown; clientRef?: unknown },
  ): Promise<WarehouseLedger> {
    const c = await this.ctx(actor, input.hubId, 'scan');
    const ref = this.cleanRef(input.clientRef);
    const prior = await this.seen(c.hubId, ref);
    if (prior) return prior[0];
    const n = units(input.qty);
    const reason = (input.reason === undefined || input.reason === null || input.reason === '' ? 'manual_receipt' : String(input.reason)) as LedgerReason;
    if (!RECEIVE_REASONS.includes(reason)) throw new BadRequestException(`Reason must be one of: ${RECEIVE_REASONS.join(', ')}.`);
    const p = await this.product(input.productId, input.variant);
    const note = this.cleanNote(input.note);
    const row = await this.tx(async (m) => {
      const bin = await this.binOf(m, c.hubId, input, { create: true, active: true });
      await this.addTo(m, c.hubId, bin.id, p.productId, p.variant, n);
      return this.write(m, c, { productId: p.productId, variant: p.variant, kind: 'receive', reason, qty: n, delta: n, toBinId: bin.id, toBinCode: bin.code, note, clientRef: ref });
    }).catch((e) => this.retried(e, c.hubId, ref));
    this.done(c.hubId, p.productId);
    return Array.isArray(row) ? row[0] : row;
  }

  /** A duplicate reference lost the race: answer with the line that won; anything else is the real error. */
  private async retried(e: unknown, hubId: string, ref: string | null, count = 1): Promise<WarehouseLedger[]> {
    if (e instanceof BadRequestException || e instanceof ForbiddenException || e instanceof NotFoundException) throw e;
    const prior = await this.seen(hubId, ref, count);
    if (prior) return prior;
    throw e;
  }

  /**
   * What a parcel carries and how much of it was already put away: lines matched to products, merged per product option.
   * `canReceive` is true once the parcel was scanned in at this warehouse (the custody model's own rule).
   */
  async parcel(actor: Actor, input: { hubId?: unknown; taskId?: unknown }): Promise<{
    taskId: string;
    orderReference: string;
    kind: string;
    status: string;
    atHub: boolean;
    canReceive: boolean;
    lines: { productId: string; variant: string; sku: string; name: string; nameFr: string; qty: number; stocked: number; remaining: number }[];
  }> {
    const hubId = await this.scope(actor, input.hubId, false);
    const task = await this.tasks.findOne({ where: { id: String(input.taskId ?? '') } });
    if (!task) throw new NotFoundException('Parcel not found.');
    const at = task.toHubId ?? null;
    if (hubId && at !== hubId) throw new BadRequestException('This parcel is not at your warehouse.');
    const lines = await this.cargo(task);
    const done = await this.stockedOf(task.id, at ?? hubId ?? '');
    const names = await this.products.names(lines.map((l) => l.productId));
    return {
      taskId: task.id,
      orderReference: task.orderReference,
      kind: task.kind,
      status: task.status,
      atHub: !!at && isHubBound(task.kind),
      canReceive: !!at && isHubBound(task.kind) && task.status === 'delivered' && lines.length > 0,
      lines: lines.map((l) => {
        const stocked = done.get(`${l.productId}|${l.variant}`) ?? 0;
        return { productId: l.productId, variant: l.variant, sku: skuOf(l.productId), name: names.get(l.productId)?.name ?? l.name, nameFr: names.get(l.productId)?.nameFr ?? l.name, qty: l.qty, stocked, remaining: Math.max(0, l.qty - stocked) };
      }),
    };
  }

  /** The parcel's cargo lines that point at a product, merged per product option. */
  private async cargo(task: DeliveryTask): Promise<{ productId: string; variant: string; name: string; qty: number }[]> {
    let raw: unknown[] = [];
    try {
      const v = task.itemsJson ? (JSON.parse(task.itemsJson) as unknown) : [];
      raw = Array.isArray(v) ? v : [];
    } catch {
      raw = [];
    }
    const merged = new Map<string, { productId: string; variant: string; name: string; qty: number }>();
    for (const x of raw) {
      const l = x as { productId?: unknown; variant?: unknown; name?: unknown; qty?: unknown };
      const qty = Number(l.qty);
      if (typeof l.productId !== 'string' || !l.productId || !Number.isInteger(qty) || qty < 1) continue;
      const variant = typeof l.variant === 'string' && l.variant.trim() ? l.variant.trim() : DEFAULT_VARIANT;
      const key = `${l.productId}|${variant}`;
      const cur = merged.get(key);
      if (cur) cur.qty += qty;
      else merged.set(key, { productId: l.productId, variant, name: typeof l.name === 'string' ? l.name : 'Product', qty });
    }
    return [...merged.values()];
  }

  /** Units of each option already put away from this parcel. */
  private async stockedOf(taskId: string, hubId: string, m?: EntityManager): Promise<Map<string, number>> {
    const rows = await (m ?? this.ledgerRepo.manager)
      .getRepository(WarehouseLedger)
      .createQueryBuilder('l')
      .select('l.productId', 'productId')
      .addSelect('l.variant', 'variant')
      .addSelect('COALESCE(SUM(l.qty), 0)', 'n')
      .where("l.taskId = :taskId AND l.hubId = :hubId AND l.kind = 'receive'", { taskId, hubId })
      .groupBy('l.productId')
      .addGroupBy('l.variant')
      .getRawMany<{ productId: string; variant: string; n: string }>();
    return new Map(rows.map((r) => [`${r.productId}|${r.variant}`, Number(r.n)]));
  }

  /**
   * Put a scanned-in parcel away: the whole of what it still carries, or the `lines` given (never more than remains).
   * One transaction: all lines or none.
   */
  async receiveParcel(
    actor: Actor,
    input: { hubId?: unknown; taskId?: unknown; binId?: unknown; binCode?: unknown; lines?: unknown; note?: unknown; clientRef?: unknown },
  ): Promise<{ taskId: string; lines: WarehouseLedger[] }> {
    const c = await this.ctx(actor, input.hubId, 'scan');
    const task = await this.tasks.findOne({ where: { id: String(input.taskId ?? '') } });
    if (!task) throw new NotFoundException('Parcel not found.');
    if (!isHubBound(task.kind) || task.toHubId !== c.hubId) throw new BadRequestException('This parcel is not at your warehouse.');
    if (task.status !== 'delivered') throw new BadRequestException('Scan the parcel in before putting it away.');
    const ref = this.cleanRef(input.clientRef);
    const cargo = await this.cargo(task);
    if (!cargo.length) throw new BadRequestException('This parcel has no lines that match a product, so it cannot be put away here. Use a manual receipt.');
    // What to put away: the lines asked for, else everything that remains.
    const want = new Map<string, number>();
    if (Array.isArray(input.lines) && input.lines.length) {
      for (const x of input.lines as { productId?: unknown; variant?: unknown; qty?: unknown }[]) {
        const variant = typeof x?.variant === 'string' && x.variant.trim() ? x.variant.trim() : DEFAULT_VARIANT;
        const key = `${String(x?.productId ?? '')}|${variant}`;
        if (!cargo.some((l) => `${l.productId}|${l.variant}` === key)) throw new BadRequestException('One of those lines is not on this parcel.');
        want.set(key, (want.get(key) ?? 0) + units(x?.qty));
      }
    }
    const prior = await this.seen(c.hubId, ref, Math.max(1, want.size || cargo.length));
    if (prior) return { taskId: task.id, lines: prior };
    const note = this.cleanNote(input.note);

    const result = await this.tx(async (m) => {
      const bin = await this.binOf(m, c.hubId, input, { create: true, active: true });
      const done = await this.stockedOf(task.id, c.hubId, m);
      const out: WarehouseLedger[] = [];
      let i = 0;
      for (const l of cargo) {
        const key = `${l.productId}|${l.variant}`;
        const remaining = l.qty - (done.get(key) ?? 0);
        const n = want.size ? (want.get(key) ?? 0) : remaining;
        if (n <= 0) continue;
        if (n > remaining) throw new BadRequestException(remaining <= 0 ? `${l.name} from this parcel is already in stock.` : `This parcel carries ${remaining} more of ${l.name}: you cannot put away ${n}.`);
        await this.addTo(m, c.hubId, bin.id, l.productId, l.variant, n);
        out.push(
          await this.write(m, c, {
            productId: l.productId,
            variant: l.variant,
            kind: 'receive',
            reason: 'parcel',
            qty: n,
            delta: n,
            toBinId: bin.id,
            toBinCode: bin.code,
            taskId: task.id,
            orderId: task.orderId,
            note,
            clientRef: ref ? (want.size || cargo.length) > 1 ? `${ref}:${i}` : ref : null,
          }),
        );
        i += 1;
      }
      if (!out.length) throw new BadRequestException('Everything on this parcel is already in stock.');
      return out;
    }).catch((e) => this.retried(e, c.hubId, ref, Math.max(1, want.size || cargo.length)));
    this.done(c.hubId, ...result.map((r) => r.productId));
    return { taskId: task.id, lines: result };
  }

  // ── move ──────────────────────────────────────────────────────────────────────
  async move(
    actor: Actor,
    input: { hubId?: unknown; productId?: unknown; variant?: unknown; qty?: unknown; fromBinId?: unknown; toBinId?: unknown; fromBinCode?: unknown; toBinCode?: unknown; note?: unknown; clientRef?: unknown },
  ): Promise<WarehouseLedger> {
    const c = await this.ctx(actor, input.hubId, 'scan');
    const ref = this.cleanRef(input.clientRef);
    const prior = await this.seen(c.hubId, ref);
    if (prior) return prior[0];
    const n = units(input.qty);
    const p = await this.product(input.productId, input.variant);
    const note = this.cleanNote(input.note);
    const row = await this.tx(async (m) => {
      const from = await this.binOf(m, c.hubId, { binId: input.fromBinId, binCode: input.fromBinCode });
      const to = await this.binOf(m, c.hubId, { binId: input.toBinId, binCode: input.toBinCode }, { active: true });
      if (from.id === to.id) throw new BadRequestException('Choose a different bin to move the stock to.');
      // Always touch the two rows in the same order (lower bin id first), whichever way the move goes, so two moves in
      // opposite directions between the same bins queue up instead of locking each other out.
      const take = () => this.takeFrom(m, c.hubId, from, p.productId, p.variant, n, p.name);
      const add = () => this.addTo(m, c.hubId, to.id, p.productId, p.variant, n);
      if (from.id < to.id) {
        await take();
        await add();
      } else {
        await add();
        await take();
      }
      return this.write(m, c, { productId: p.productId, variant: p.variant, kind: 'move', reason: 'relocation', qty: n, delta: 0, fromBinId: from.id, fromBinCode: from.code, toBinId: to.id, toBinCode: to.code, note, clientRef: ref });
    }).catch((e) => this.retried(e, c.hubId, ref));
    this.done(c.hubId, p.productId);
    return Array.isArray(row) ? row[0] : row;
  }

  // ── stock out ─────────────────────────────────────────────────────────────────
  /** Units leave the warehouse by hand (damaged, lost, a sample, handed back to the seller). Dispatch has its own, automatic path. */
  async stockOut(
    actor: Actor,
    input: { hubId?: unknown; productId?: unknown; variant?: unknown; qty?: unknown; binId?: unknown; binCode?: unknown; reason?: unknown; note?: unknown; orderId?: unknown; clientRef?: unknown },
  ): Promise<WarehouseLedger> {
    const c = await this.ctx(actor, input.hubId, 'scan');
    const ref = this.cleanRef(input.clientRef);
    const prior = await this.seen(c.hubId, ref);
    if (prior) return prior[0];
    const n = units(input.qty);
    const reason = String(input.reason ?? '') as LedgerReason;
    if (!OUT_REASONS.includes(reason)) throw new BadRequestException(`Reason must be one of: ${OUT_REASONS.join(', ')}.`);
    const note = this.cleanNote(input.note);
    if (reason === 'other' && !note) throw new BadRequestException('Say why the stock is leaving in the note.');
    const p = await this.product(input.productId, input.variant);
    const row = await this.tx(async (m) => {
      const bin = await this.binOf(m, c.hubId, input);
      await this.takeFrom(m, c.hubId, bin, p.productId, p.variant, n, p.name);
      return this.write(m, c, { productId: p.productId, variant: p.variant, kind: 'stock_out', reason, qty: n, delta: -n, fromBinId: bin.id, fromBinCode: bin.code, note, clientRef: ref });
    }).catch((e) => this.retried(e, c.hubId, ref));
    this.done(c.hubId, p.productId);
    return Array.isArray(row) ? row[0] : row;
  }

  // ── cycle count ───────────────────────────────────────────────────────────────
  /**
   * Count a bin: for each line the system's number becomes the counted number and the difference is the variance, one
   * ledger line each (a count with no difference is still a line: it proves the bin was checked). `expected` is what the
   * counter saw on screen; if the bin changed since, the count is refused instead of overwriting someone's movement.
   * Needs a supervisor or a manager: it changes stock with no source document.
   */
  async count(
    actor: Actor,
    input: { hubId?: unknown; binId?: unknown; binCode?: unknown; lines?: unknown; note?: unknown; clientRef?: unknown },
  ): Promise<{ binId: string; binCode: string; lines: { productId: string; variant: string; expected: number; counted: number; variance: number; ledgerId: string }[]; totalVariance: number }> {
    const c = await this.ctx(actor, input.hubId, 'oversee');
    if (!Array.isArray(input.lines) || !input.lines.length || input.lines.length > 200) throw new BadRequestException('Count between 1 and 200 lines.');
    const ref = this.cleanRef(input.clientRef);
    const note = this.cleanNote(input.note);
    const lines: { productId: string; variant: string; name: string; counted: number; expected: number | null }[] = [];
    const seenKeys = new Set<string>();
    for (const x of input.lines as { productId?: unknown; variant?: unknown; counted?: unknown; expected?: unknown }[]) {
      const p = await this.product(x?.productId, x?.variant);
      const counted = typeof x?.counted === 'number' ? x.counted : Number(x?.counted);
      if (x?.counted === '' || x?.counted === null || x?.counted === undefined || !Number.isInteger(counted) || counted < 0 || counted > MAX_QTY) {
        throw new BadRequestException(`Enter the counted number of ${p.name} (0 or more).`);
      }
      const key = `${p.productId}|${p.variant}`;
      if (seenKeys.has(key)) throw new BadRequestException(`${p.name} is on the sheet twice.`);
      seenKeys.add(key);
      const expected = x?.expected === undefined || x?.expected === null ? null : Number(x.expected);
      if (expected !== null && (!Number.isInteger(expected) || expected < 0)) throw new BadRequestException('The expected number is invalid.');
      lines.push({ productId: p.productId, variant: p.variant, name: p.name, counted, expected });
    }
    const prior = await this.seen(c.hubId, ref, lines.length);
    if (prior) {
      const bin = await this.bins.findOne({ where: { id: prior[0].toBinId ?? '' } });
      return this.countView(bin?.id ?? '', bin?.code ?? '', prior);
    }

    const result = await this.tx(async (m) => {
      const bin = await this.binOf(m, c.hubId, input);
      const out: WarehouseLedger[] = [];
      let i = 0;
      for (const l of lines) {
        const current = await this.inBin(m, c.hubId, bin.id, l.productId, l.variant);
        if (l.expected !== null && l.expected !== current) {
          throw new BadRequestException(`${l.name} in bin ${bin.code} changed while you were counting (now ${current}). Refresh and count again.`);
        }
        // Compare-and-set: the row becomes `counted` only if it still holds `current`.
        const slot = await m.getRepository(WarehouseStock).findOne({ where: this.slotWhere(c.hubId, bin.id, l.productId, l.variant) });
        if (!slot) {
          if (l.counted > 0) {
            try {
              await m.getRepository(WarehouseStock).insert({ hubId: c.hubId, binId: bin.id, productId: l.productId, variant: l.variant, qty: l.counted });
            } catch {
              throw new BadRequestException(`${l.name} in bin ${bin.code} was just updated. Refresh and count again.`);
            }
          }
        } else {
          const r = await m
            .createQueryBuilder()
            .update(WarehouseStock)
            .set({ qty: l.counted })
            .where('hubId = :hubId AND binId = :binId AND productId = :productId AND variant = :variant AND qty = :current', { hubId: c.hubId, binId: bin.id, productId: l.productId, variant: l.variant, current })
            .execute();
          if (!r.affected) throw new BadRequestException(`${l.name} in bin ${bin.code} was just updated. Refresh and count again.`);
        }
        out.push(
          await this.write(m, c, {
            productId: l.productId,
            variant: l.variant,
            kind: 'count',
            reason: 'cycle_count',
            qty: l.counted,
            delta: l.counted - current,
            toBinId: bin.id,
            toBinCode: bin.code,
            expectedQty: current,
            countedQty: l.counted,
            note,
            clientRef: ref ? (lines.length > 1 ? `${ref}:${i}` : ref) : null,
          }),
        );
        i += 1;
      }
      const variance = out.reduce((s, r) => s + r.delta, 0);
      if (variance !== 0) {
        await m.getRepository(AuditLog).save(
          m.getRepository(AuditLog).create({
            actor: c.actor.name,
            role: c.actor.role,
            action: 'stock.count',
            entity: 'hub',
            entityId: c.hubId,
            detail: `Bin ${bin.code}: ${out.length} line(s) counted, variance ${variance > 0 ? '+' : ''}${variance}${note ? ` (${note})` : ''}`,
          }),
        );
      }
      return { bin, out };
    }).catch(async (e) => {
      const rows = await this.retried(e, c.hubId, ref, lines.length);
      const bin = await this.bins.findOne({ where: { id: rows[0].toBinId ?? '' } });
      return { bin: bin as WarehouseBin, out: rows };
    });
    this.done(c.hubId, ...lines.map((l) => l.productId));
    return this.countView(result.bin.id, result.bin.code, result.out);
  }

  private countView(binId: string, code: string, rows: WarehouseLedger[]) {
    return {
      binId,
      binCode: code,
      lines: rows.map((r) => ({ productId: r.productId, variant: r.variant, expected: r.expectedQty ?? 0, counted: r.countedQty ?? 0, variance: r.delta, ledgerId: r.id })),
      totalVariance: rows.reduce((s, r) => s + r.delta, 0),
    };
  }

  // ── dispatch (automatic stock-out) ───────────────────────────────────────────
  private async onLogistics(e: LogisticsEvent): Promise<void> {
    if (e.type !== 'picked_up') return;
    await this.dispatched(e.task);
  }

  /**
   * A parcel left this warehouse with a rider (or on a run): stock out what the ORDER had put away here and has not left
   * yet. A delivery takes everything the order has here; a transfer or return leg takes the products it carries. It
   * takes only what is on the shelves (it never goes below zero) and it can never block or fail the dispatch: a
   * warehouse that does not track stock simply has nothing to take. Once per task.
   */
  async dispatched(task: DeliveryTask): Promise<WarehouseLedger[]> {
    try {
      const hubId = task.fromHubId;
      if (!hubId || !task.orderId || !['delivery', 'transfer', 'return_transfer', 'return_to_seller', 'replacement_delivery'].includes(task.kind)) return [];
      if (await this.ledgerRepo.exist({ where: { taskId: task.id, kind: 'stock_out', reason: 'dispatch' } })) return [];
      const net = await this.ledgerRepo
        .createQueryBuilder('l')
        .select('l.productId', 'productId')
        .addSelect('l.variant', 'variant')
        .addSelect('COALESCE(SUM(l.delta), 0)', 'n')
        .where('l.hubId = :hubId AND l.orderId = :orderId', { hubId, orderId: task.orderId })
        .groupBy('l.productId')
        .addGroupBy('l.variant')
        .getRawMany<{ productId: string; variant: string; n: string }>();
      let wanted = net.map((r) => ({ productId: r.productId, variant: r.variant, left: Number(r.n) })).filter((r) => r.left > 0);
      if (!['delivery', 'replacement_delivery'].includes(task.kind)) {
        const carried = new Set((await this.cargo(task)).map((l) => l.productId));
        if (carried.size) wanted = wanted.filter((r) => carried.has(r.productId));
      }
      if (!wanted.length) return [];
      const c: Ctx = { hubId, actor: { id: task.riderId ?? 'system', role: 'system', name: 'Dispatch', hubId } };
      const names = await this.products.names(wanted.map((w) => w.productId));
      const written = await this.tx(async (m) => {
        const out: WarehouseLedger[] = [];
        for (const w of wanted) {
          const shelves = await m.getRepository(WarehouseStock).find({ where: { hubId, productId: w.productId, variant: w.variant }, order: { qty: 'DESC', id: 'ASC' } });
          let left = w.left;
          for (const s of shelves) {
            if (left <= 0) break;
            const take = Math.min(left, s.qty);
            if (take <= 0) continue;
            const bin = await m.getRepository(WarehouseBin).findOneOrFail({ where: { id: s.binId } });
            await this.takeFrom(m, hubId, bin, w.productId, w.variant, take, names.get(w.productId)?.name ?? 'product');
            out.push(
              await this.write(m, c, {
                productId: w.productId,
                variant: w.variant,
                kind: 'stock_out',
                reason: 'dispatch',
                qty: take,
                delta: -take,
                fromBinId: bin.id,
                fromBinCode: bin.code,
                taskId: task.id,
                orderId: task.orderId,
                note: `${task.orderReference} ${task.kind}`,
                clientRef: `dsp:${short(`${task.id}|${w.productId}|${w.variant}|${bin.id}`)}`,
              }),
            );
            left -= take;
          }
        }
        return out;
      });
      if (written.length) this.done(hubId, ...new Set(written.map((r) => r.productId)));
      return written;
    } catch (err) {
      // Custody comes first: a stock problem never fails a dispatch.
      this.logger.warn(`stock-out for ${task.id} failed: ${(err as Error).message}`);
      return [];
    }
  }

  // ── reads ─────────────────────────────────────────────────────────────────────
  /** Find products by name, SKU label or id (for the receive form), and a bin by its code (for a scanned bin label). */
  async lookup(actor: Actor, input: { hubId?: unknown; code?: unknown }): Promise<{
    bin: { id: string; code: string; label: string | null; active: boolean } | null;
    products: { productId: string; sku: string; name: string; nameFr: string; variants: string[] }[];
  }> {
    const hubId = await this.scope(actor, input.hubId, false);
    const raw = typeof input.code === 'string' ? input.code.trim() : '';
    if (!raw) return { bin: null, products: [] };
    if (raw.length > 80) throw new BadRequestException('That code is too long.');
    let bin: WarehouseBin | null = null;
    if (hubId && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$/.test(raw)) bin = await this.bins.findOne({ where: { hubId, code: raw.toUpperCase() } });
    const needle = raw.replace(/^sku-?/i, '').toLowerCase().replace(/[%_\\]/g, '');
    const rows = await this.searchProducts(raw, needle, 12);
    const names = await this.products.names(rows.map((p) => p.id));
    return {
      bin: bin ? { id: bin.id, code: bin.code, label: bin.label, active: bin.active } : null,
      products: rows.map((p) => ({
        productId: p.id,
        sku: skuOf(p.id),
        name: names.get(p.id)?.name ?? p.name,
        nameFr: names.get(p.id)?.nameFr ?? p.name,
        variants: storedVariantGroups(p.variants).length ? this.variantLabels(p.variants) : [DEFAULT_VARIANT],
      })),
    };
  }

  /** Live or draft products whose name contains the text, or whose id starts with the SKU label's six characters. */
  private async searchProducts(raw: string, idPrefix: string, limit: number): Promise<Product[]> {
    const text = raw.replace(/[%_\\]/g, ''); // wildcards typed by the user are dropped, not interpreted
    if (!text.trim()) return [];
    const like = `%${text}%`;
    const qb = this.productRepo.createQueryBuilder('p').where("p.status != 'removed'");
    if (idPrefix.length >= 4) qb.andWhere('(p.name LIKE :like OR p.id LIKE :prefix)', { like, prefix: `${idPrefix}%` });
    else qb.andWhere('p.name LIKE :like', { like });
    return qb.orderBy('p.name', 'ASC').take(limit).getMany();
  }

  private variantLabels(raw: string | null): string[] {
    const groups = storedVariantGroups(raw);
    let combos: { name: string; value: string }[][] = [[]];
    for (const g of groups) combos = combos.flatMap((c) => g.options.map((o) => [...c, { name: g.name, value: o }]));
    return combos.slice(0, 200).map((c) => c.map((p) => `${p.name}: ${p.value}`).join(' · '));
  }

  /** On hand by product option, with the bins it sits in. A staff member sees their warehouse; an admin one or all. */
  async onHand(
    actor: Actor,
    input: { hubId?: unknown; search?: unknown; binId?: unknown; productId?: unknown; limit?: unknown; offset?: unknown },
  ): Promise<{
    total: number;
    units: number;
    rows: { hubId: string; productId: string; variant: string; sku: string; name: string; nameFr: string; onHand: number; bins: { binId: string; code: string; qty: number }[] }[];
  }> {
    const hubId = await this.scope(actor, input.hubId, false);
    const { take, skip } = pageOf(input, { def: 100, max: 500 });
    const qb = this.stock.createQueryBuilder('s').where('s.qty > 0');
    if (hubId) qb.andWhere('s.hubId = :hubId', { hubId });
    if (typeof input.binId === 'string' && input.binId) qb.andWhere('s.binId = :binId', { binId: input.binId });
    if (typeof input.productId === 'string' && input.productId) qb.andWhere('s.productId = :pid', { pid: input.productId });
    const search = typeof input.search === 'string' ? input.search.trim() : '';
    if (search) {
      const ids = (await this.searchProducts(search, search.replace(/^sku-?/i, '').toLowerCase().replace(/[%_\\]/g, ''), 200)).map((p) => p.id);
      if (!ids.length) return { total: 0, units: 0, rows: [] };
      qb.andWhere('s.productId IN (:...ids)', { ids });
    }
    const groups = await qb
      .clone()
      .select('s.hubId', 'hubId')
      .addSelect('s.productId', 'productId')
      .addSelect('s.variant', 'variant')
      .addSelect('SUM(s.qty)', 'n')
      .groupBy('s.hubId')
      .addGroupBy('s.productId')
      .addGroupBy('s.variant')
      .orderBy('s.productId', 'ASC')
      .addOrderBy('s.variant', 'ASC')
      .addOrderBy('s.hubId', 'ASC')
      .getRawMany<{ hubId: string; productId: string; variant: string; n: string }>();
    const page = groups.slice(skip, skip + take);
    const names = await this.products.names(page.map((g) => g.productId));
    const slots = page.length ? await this.stock.find({ where: { productId: In(page.map((g) => g.productId)), ...(hubId ? { hubId } : {}) } }) : [];
    const binRows = slots.length ? await this.bins.find({ where: { id: In([...new Set(slots.map((s) => s.binId))]) } }) : [];
    const code = new Map(binRows.map((b) => [b.id, b.code]));
    return {
      total: groups.length,
      units: groups.reduce((s, g) => s + Number(g.n), 0),
      rows: page.map((g) => ({
        hubId: g.hubId,
        productId: g.productId,
        variant: g.variant,
        sku: skuOf(g.productId),
        name: names.get(g.productId)?.name ?? 'Product',
        nameFr: names.get(g.productId)?.nameFr ?? 'Produit',
        onHand: Number(g.n),
        bins: slots
          .filter((s) => s.hubId === g.hubId && s.productId === g.productId && s.variant === g.variant && s.qty > 0)
          .map((s) => ({ binId: s.binId, code: code.get(s.binId) ?? '?', qty: s.qty }))
          .sort((a, b) => a.code.localeCompare(b.code)),
      })),
    };
  }

  /** The ledger, newest first: one SKU, one bin, one order, or everything in the warehouse. */
  async history(
    actor: Actor,
    input: { hubId?: unknown; productId?: unknown; variant?: unknown; binId?: unknown; kind?: unknown; orderId?: unknown; limit?: unknown; offset?: unknown },
  ): Promise<(WarehouseLedger & { sku: string; name: string; nameFr: string })[]> {
    const hubId = await this.scope(actor, input.hubId, false);
    const { take, skip } = pageOf(input, { def: 100, max: 500 });
    const qb = this.ledgerRepo.createQueryBuilder('l');
    if (hubId) qb.andWhere('l.hubId = :hubId', { hubId });
    if (typeof input.productId === 'string' && input.productId) qb.andWhere('l.productId = :pid', { pid: input.productId });
    if (typeof input.variant === 'string' && input.variant) qb.andWhere('l.variant = :variant', { variant: input.variant });
    if (typeof input.binId === 'string' && input.binId) qb.andWhere('(l.fromBinId = :bin OR l.toBinId = :bin)', { bin: input.binId });
    if (typeof input.kind === 'string' && input.kind) qb.andWhere('l.kind = :kind', { kind: input.kind });
    if (typeof input.orderId === 'string' && input.orderId) qb.andWhere('l.orderId = :orderId', { orderId: input.orderId });
    const rows = await qb.orderBy('l.createdAt', 'DESC').addOrderBy('l.id', 'DESC').take(take).skip(skip).getMany();
    const names = await this.products.names(rows.map((r) => r.productId));
    return rows.map((r) => Object.assign(r, { sku: skuOf(r.productId), name: names.get(r.productId)?.name ?? 'Product', nameFr: names.get(r.productId)?.nameFr ?? 'Produit' }));
  }
}
