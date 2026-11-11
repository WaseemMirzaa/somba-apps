import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, LessThanOrEqual, QueryFailedError } from 'typeorm';
import type { EntityManager, Repository } from 'typeorm';
import {
  Broadcast,
  Campaign,
  Category,
  CmsBlock,
  ConversationMessage,
  Dispute,
  DisputeMessage,
  Exchange,
  FlashSale,
  Product,
  ProductQuestion,
  Replacement,
  Review,
  Seller,
  SupportMessage,
  SupportTicket,
  Translation,
  TranslationJob,
  User,
} from '../database/entities';
import type { TranslationEntityType } from '../database/entities';
import { storedVariantGroups } from '../common/variants/variants';
import type { VariantGroup } from '../common/variants/variants';
import { shouldTranslate } from './never-translate';
import {
  applyVariantStrings,
  composeText,
  composeVariants,
  frName,
  planWork,
  sourceHash,
  specsOf,
  variantStrings,
} from './translatable';
import type { RowLite, WorkItem, WritePlan } from './translatable';
import { LOCALES, TRANSLATOR, isLocale, otherLocale } from './translator.provider';
import type { Locale, TranslatorProvider } from './translator.provider';

/** Backoff between attempts: 1 m, 5 m, 30 m, 2 h, 12 h; the 6th failure ends the job. */
export const BACKOFF_MINUTES = [1, 5, 30, 120, 720];
export const MAX_ATTEMPTS = 6;
/** Looking up translations never builds an IN list longer than this. */
export const LOOKUP_CHUNK = 500;
/** Estimated Google price, USD per million characters. */
export const USD_PER_MILLION_CHARS = 20;

/**
 * Both languages of one stored text, served next to the text itself (docs/contracts/stored-text-i18n.md).
 * `sourceLang`: the language the author wrote in (translator-detected), null when unknown. `en` / `fr`: the text in that
 * language (the original for the source language, the machine translation for the other); a key exists only when the
 * value exists and is not stale.
 */
export interface TextI18n {
  sourceLang: string | null;
  en?: string;
  fr?: string;
}

/** What {@link TranslationService.translateForSave} learned about a text before it is stored. */
export interface SaveTranslation {
  sourceLang: string;
  /** The text in every other platform language (never the source language itself). */
  others: Partial<Record<Locale, string>>;
  /** sourceHash(sourceLang, trimmed text): the same hash `translateStored` and `i18nFor` check. */
  sourceHash: string;
}

export type TranslationStatus = 'done' | 'pending' | 'failed' | 'off';

/** Records whose own columns hold authored text with a `sourceLang`. */
const BASE_ENTITIES = {
  product: Product,
  category: Category,
  seller: Seller,
  campaign: Campaign,
  flash_sale: FlashSale,
  cms_block: CmsBlock,
  broadcast: Broadcast,
} as const;
export const JOB_TYPES = Object.keys(BASE_ENTITIES) as (keyof typeof BASE_ENTITIES)[];
const isJobType = (t: string): t is keyof typeof BASE_ENTITIES => t in BASE_ENTITIES;

/**
 * What `translate:text` accepts, and where the stored text lives. Only ids of these records ever reach a translator (C-I5).
 * `private: true`: the text is read by named people only (a conversation, a ticket, a request); `translateStored` refuses
 * it unless the OWNING service already checked who is asking and passed `{ private: true }`.
 */
export const STORED_KINDS = {
  review: { entity: Review, column: 'text', field: 'text' },
  review_reply: { entity: Review, column: 'sellerReply', field: 'reply' },
  question: { entity: ProductQuestion, column: 'question', field: 'text' },
  answer: { entity: ProductQuestion, column: 'answer', field: 'text' },
  /** A chat message: private to the two sides of its conversation, so only `ChatService.translate` may ask for it. */
  chat_message: { entity: ConversationMessage, column: 'text', field: 'text', private: true },
  /** A support ticket's subject (entityId = the ticket id). Private to the ticket's owner and the support agents (`SupportService.translate`). */
  support_ticket: { entity: SupportTicket, column: 'subject', field: 'subject', private: true },
  /** A message of a support ticket (entityId = the message id). Same readers as the ticket. */
  support_message: { entity: SupportMessage, column: 'text', field: 'text', private: true },
  /** A message in a dispute or return thread. Private to the customer, the seller(s) on the order and the returns/disputes desk (`DisputesService.translate`). */
  dispute_message: { entity: DisputeMessage, column: 'text', field: 'text', private: true },
  /** What the customer wrote when opening a dispute or return (entityId = the dispute id). */
  dispute_reason: { entity: Dispute, column: 'reason', field: 'reason', private: true },
  /** The seller's reason when they accepted or rejected a return (`sellerReason`). */
  dispute_reply: { entity: Dispute, column: 'sellerReason', field: 'reply', private: true },
  /** How the request was closed, when the words are an agent's own (stock phrases have their own French). */
  dispute_resolution: { entity: Dispute, column: 'resolution', field: 'resolution', private: true },
  /** An exchange's customer reason / seller reason (`ExchangesService.translate`). */
  exchange_reason: { entity: Exchange, column: 'reason', field: 'reason', private: true },
  exchange_reply: { entity: Exchange, column: 'sellerReason', field: 'reply', private: true },
  /** A replacement's customer reason / seller reason (`ReplacementsService.translate`). */
  replacement_reason: { entity: Replacement, column: 'reason', field: 'reason', private: true },
  replacement_reply: { entity: Replacement, column: 'sellerReason', field: 'reply', private: true },
} as const;
export type StoredKind = keyof typeof STORED_KINDS;
export const isStoredKind = (k: unknown): k is StoredKind => typeof k === 'string' && k in STORED_KINDS;

/** A served-ready view of one record's translatable text (see {@link TranslationService.present}). */
export interface Presented {
  /** name / nameFr / description / descriptionFr … (served field names). */
  texts: Record<string, string | null>;
  /** Option labels in both languages, index-aligned with the canonical `variants` (only for records with variants). */
  variantLabels: { en: VariantGroup[]; fr: VariantGroup[] } | null;
  /** Served field names whose value came from a machine: name, nameFr, description, descriptionFr, variantLabels.en, variantLabels.fr. */
  machineTranslated: string[];
  translationStatus: TranslationStatus;
}

export const chunk = <T>(xs: T[], n = LOOKUP_CHUNK): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};

const isDuplicate = (e: unknown) => e instanceof QueryFailedError && /duplicate|unique constraint/i.test((e as Error).message);
const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);
const nextUtcMidnight = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));

/** One running job. `dirty`: a save arrived meanwhile (run once more). `hold`: an inline save is waiting for it and publishes the record itself. */
interface Flight {
  dirty: boolean;
  done: Promise<boolean>;
  hold: boolean;
  /** The job wrote translations while `hold` was set: its republish was left to the waiting save. */
  held: boolean;
  /** An earlier pass of this run wrote rows (its republish waits for the final pass). */
  wrote: boolean;
}

/** `TRANSLATE_SAVE_TIMEOUT_MS` (default 4000), read on every call: the longest a save waits for a translator. */
export const saveTimeoutMs = (): number => {
  const raw = Number(process.env.TRANSLATE_SAVE_TIMEOUT_MS ?? 4000);
  return Number.isFinite(raw) && raw > 0 ? raw : 4000;
};

class BudgetExceeded extends Error {
  constructor() {
    super('Daily translation budget used up.');
  }
}

/**
 * The translation engine (plan §2.4): composes served text from a record's own columns plus `translations`
 * rows, writes author rows, and runs the job queue that asks a {@link TranslatorProvider} for what is missing.
 * A save never waits for, or fails because of, a translator.
 */
@Injectable()
export class TranslationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Translation');
  private sweeper: ReturnType<typeof setInterval> | null = null;
  private readonly republishers = new Map<string, (id: string) => Promise<void>>();
  private readonly inflight = new Map<string, Flight>();
  /** Strings already translated in this process ("Black", "XL"…): one call each. */
  private readonly terms = new Map<string, string>();
  private usage = { day: '', chars: 0 };
  /** Off while a script drains the queue without a socket server. */
  republish = true;
  /** Run a job right after it is queued (setImmediate). Tests switch it off and call runJob themselves. */
  autoRun = true;
  readonly charLimit: number;

  constructor(
    @InjectRepository(Translation) private readonly rows: Repository<Translation>,
    @InjectRepository(TranslationJob) private readonly jobs: Repository<TranslationJob>,
    @Inject(TRANSLATOR) private readonly provider: TranslatorProvider,
    private readonly ds: DataSource,
  ) {
    this.charLimit = Number(process.env.TRANSLATE_DAILY_CHAR_LIMIT ?? 300_000);
  }

  get enabled(): boolean {
    return this.provider.enabled;
  }

  get providerName(): string {
    return this.provider.name;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────────────────

  onModuleInit(): void {
    const every = Number(process.env.TRANSLATE_SWEEP_MS ?? 60_000);
    if (every > 0 && this.enabled) {
      this.sweeper = setInterval(() => void this.sweep().catch((e) => this.logger.warn(`sweep failed: ${(e as Error).message}`)), every);
      this.sweeper.unref();
    }
    this.logger.log(`Translation provider: ${this.provider.name}`);
  }

  onModuleDestroy(): void {
    if (this.sweeper) clearInterval(this.sweeper);
  }

  /** The owner of a record type tells us how to re-emit it after a machine finished (same rooms as its own updates). */
  registerRepublisher(type: TranslationEntityType, fn: (id: string) => Promise<void>): void {
    this.republishers.set(type, fn);
  }

  // ── Reading ─────────────────────────────────────────────────────────────────────────────

  /** All translation rows of the given records, grouped by record id. Chunked so an IN list never exceeds 500 ids. */
  async rowsFor(type: TranslationEntityType, ids: string[], manager?: EntityManager): Promise<Map<string, Translation[]>> {
    const out = new Map<string, Translation[]>();
    const repo = manager ? manager.getRepository(Translation) : this.rows;
    for (const part of chunk([...new Set(ids)])) {
      for (const r of await repo.find({ where: { entityType: type, entityId: In(part) } })) {
        const list = out.get(r.entityId);
        if (list) list.push(r);
        else out.set(r.entityId, [r]);
      }
    }
    return out;
  }

  async jobsFor(type: TranslationEntityType, ids: string[]): Promise<Map<string, TranslationJob>> {
    const out = new Map<string, TranslationJob>();
    for (const part of chunk([...new Set(ids)])) {
      for (const j of await this.jobs.find({ where: { entityType: type, entityId: In(part) } })) out.set(j.entityId, j);
    }
    return out;
  }

  /**
   * Compose the served text of records: for every translatable field `x` the pair `x` / `xFr`, `variantLabels`
   * for option groups, which served fields a machine produced, and where the translation stands.
   */
  async present(type: TranslationEntityType, entities: { id: string; sourceLang: string }[]): Promise<Map<string, Presented>> {
    const out = new Map<string, Presented>();
    if (!entities.length) return out;
    const ids = entities.map((e) => e.id);
    const [rows, jobs] = await Promise.all([this.rowsFor(type, ids), this.enabled ? this.jobsFor(type, ids) : Promise.resolve(new Map<string, TranslationJob>())]);
    for (const row of entities) {
      const e = row as { id: string; sourceLang: string } & Record<string, unknown>;
      const mine = (rows.get(e.id) ?? []) as RowLite[];
      const texts: Record<string, string | null> = {};
      const machine: string[] = [];
      let variantLabels: Presented['variantLabels'] = null;
      let missing = false;
      for (const [field, spec] of Object.entries(specsOf(type))) {
        const ofField = mine.filter((r) => r.field === field);
        if (spec.json) {
          const v = composeVariants(e.sourceLang, e[spec.column] as string | null, ofField);
          variantLabels = { en: v.en, fr: v.fr };
          if (v.machine.en) machine.push('variantLabels.en');
          if (v.machine.fr) machine.push('variantLabels.fr');
          missing ||= v.missing;
        } else {
          const c = composeText(e.sourceLang, e[spec.column] as string | null, ofField);
          texts[field] = c.en;
          texts[frName(field)] = c.fr;
          if (c.machine.en) machine.push(field);
          if (c.machine.fr) machine.push(frName(field));
          missing ||= c.missing;
        }
      }
      const job = jobs.get(e.id);
      const translationStatus: TranslationStatus = !this.enabled ? 'off' : job?.status === 'failed' ? 'failed' : job?.status === 'pending' || missing ? 'pending' : 'done';
      out.set(e.id, { texts, variantLabels, machineTranslated: machine, translationStatus });
    }
    return out;
  }

  // ── Writing (authors) ───────────────────────────────────────────────────────────────────

  /**
   * Apply the translation side of a planned save: author rows are upserted, cleared rows deleted. Call it in the
   * same transaction as the base-row update. `sourceTexts` (field -> the source text AFTER the save) lets each
   * author row remember what it was written against.
   */
  async applyPlan(
    manager: EntityManager,
    type: TranslationEntityType,
    id: string,
    plan: WritePlan,
    sourceTexts: Record<string, string | null>,
  ): Promise<void> {
    const repo = manager.getRepository(Translation);
    for (const d of plan.deletes) await repo.delete({ entityType: type, entityId: id, field: d.field, locale: d.locale });
    for (const a of plan.authors) {
      const src = sourceTexts[a.field];
      const fields = {
        value: a.value,
        origin: 'author' as const,
        sourceLang: plan.sourceLang,
        sourceHash: src ? sourceHash(plan.sourceLang, src) : null,
      };
      const existing = await repo.findOne({ where: { entityType: type, entityId: id, field: a.field, locale: a.locale } });
      if (existing) await repo.update({ id: existing.id }, fields);
      else await repo.insert(repo.create({ entityType: type, entityId: id, field: a.field, locale: a.locale, ...fields }));
    }
  }

  /** Delete a record's translations (the record itself was deleted). */
  async forget(type: TranslationEntityType, id: string): Promise<void> {
    await this.rows.delete({ entityType: type, entityId: id });
    await this.jobs.delete({ entityType: type, entityId: id });
  }

  /** The seller asked for a fresh machine translation: drop the machine rows (never an author's) and queue the record. */
  async retranslate(type: TranslationEntityType, id: string): Promise<void> {
    await this.rows.delete({ entityType: type, entityId: id, origin: 'machine' });
    await this.enqueue(type, id);
  }

  /**
   * Write one machine translation. NEVER overwrites an author or snapshot row (C-I6): an existing machine row is
   * updated in place, and a row that someone else inserted first is left alone.
   */
  async writeMachine(
    type: TranslationEntityType,
    id: string,
    row: { field: string; locale: string; value: string; sourceLang: string; sourceHash: string },
  ): Promise<boolean> {
    // C-I6
    const key = { entityType: type, entityId: id, field: row.field, locale: row.locale };
    const upd = await this.rows.update(
      { ...key, origin: 'machine' },
      { value: row.value, sourceLang: row.sourceLang, sourceHash: row.sourceHash },
    );
    if (upd.affected) return true;
    try {
      await this.rows.insert(this.rows.create({ ...key, value: row.value, origin: 'machine', sourceLang: row.sourceLang, sourceHash: row.sourceHash }));
      return true;
    } catch (e) {
      if (isDuplicate(e)) return false; // an author (or another worker) wrote it first
      throw e;
    }
  }

  /** Store text a person wrote for a record that has no base-column twin (a broadcast's French notification). */
  async saveAuthor(type: TranslationEntityType, id: string, rows: { field: string; locale: string; value: string }[]): Promise<void> {
    if (!rows.length) return;
    await this.rows.insert(rows.map((r) => this.rows.create({ entityType: type, entityId: id, origin: 'author', sourceLang: null, sourceHash: null, ...r })));
  }

  /** Insert snapshot rows (order lines) with the caller's manager so they commit with the order. */
  async snapshot(manager: EntityManager, rows: { entityId: string; field: string; locale: string; value: string }[]): Promise<void> {
    if (!rows.length) return;
    const repo = manager.getRepository(Translation);
    await repo.insert(rows.map((r) => repo.create({ entityType: 'order_item', origin: 'snapshot', sourceLang: null, sourceHash: null, ...r })));
  }

  // ── Queue ───────────────────────────────────────────────────────────────────────────────

  /**
   * Queue a record for translation and run it NOW, waiting for it (bounded): a save of authored platform content (product,
   * category, store, campaign, flash sale, CMS block) calls this before it publishes, so the first `product:created` /
   * `…:updated` already carries both languages. With `autoRun` on and translation enabled, the job runs inline and the call
   * returns when it finishes or after `TRANSLATE_SAVE_TIMEOUT_MS` (default 4000, read now), whichever is first. On timeout
   * the job keeps running in the background (and republishes the record when it finishes); a failure stays queued for the
   * 60 s sweeper. Never throws because of a translator. `wait: false`: only queue it (run a moment later, setImmediate).
   * No-op when translation is off. With `autoRun` off (tests) the job is only queued.
   */
  async enqueue(type: TranslationEntityType, id: string, opts: { wait?: boolean } = {}): Promise<void> {
    if (!this.enabled || !isJobType(type)) return;
    const existing = await this.jobs.findOne({ where: { entityType: type, entityId: id } });
    if (existing) {
      await this.jobs.update({ id: existing.id }, { status: 'pending', attempts: 0, nextAttemptAt: new Date(), lastError: null });
    } else {
      try {
        await this.jobs.insert(this.jobs.create({ entityType: type, entityId: id, status: 'pending', attempts: 0, nextAttemptAt: new Date(), lastError: null }));
      } catch (e) {
        if (!isDuplicate(e)) throw e;
        await this.jobs.update({ entityType: type, entityId: id }, { status: 'pending', attempts: 0, nextAttemptAt: new Date(), lastError: null });
      }
    }
    await this.kick(type, id, opts.wait !== false);
  }

  private async kick(type: TranslationEntityType, id: string, wait: boolean): Promise<void> {
    if (!this.autoRun) return;
    const flight = this.inflight.get(`${type}:${id}`);
    if (flight) {
      flight.dirty = true; // text changed while a run is in progress: run once more when it finishes
      if (wait) await this.waitFor(type, id, flight);
      return;
    }
    if (!wait) {
      setImmediate(() => void this.runJob(type, id).catch((e) => this.logger.warn(`job ${type}:${id} crashed: ${(e as Error).message}`)));
      return;
    }
    const running = this.runJob(type, id);
    running.catch((e) => this.logger.warn(`job ${type}:${id} crashed: ${(e as Error).message}`));
    const started = this.inflight.get(`${type}:${id}`);
    if (started) await this.waitFor(type, id, started);
  }

  /** Wait for a running job, at most {@link saveTimeoutMs}. While waiting, the job does not republish: the waiting save publishes. */
  private async waitFor(type: TranslationEntityType, id: string, flight: Flight): Promise<void> {
    flight.hold = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    try {
      await Promise.race([
        flight.done.catch(() => undefined),
        new Promise<void>((resolve) => {
          timer = setTimeout(() => {
            timedOut = true;
            resolve();
          }, saveTimeoutMs());
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    if (!timedOut) return;
    // Too slow: the save goes ahead without the other language; the job carries on and republishes when it is done.
    flight.hold = false;
    if (flight.held) {
      flight.held = false;
      await this.republishNow(type, id);
    }
  }

  private async republishNow(type: TranslationEntityType, id: string): Promise<void> {
    const fn = this.republishers.get(type);
    if (fn) await fn(id).catch((e) => this.logger.warn(`republish ${type}:${id} failed: ${(e as Error).message}`));
  }

  /** Retry due jobs (pending, backoff elapsed). Called every 60 s. */
  async sweep(limit = 25): Promise<number> {
    if (!this.enabled) return 0;
    if ((await this.usedToday()) >= this.charLimit) return 0;
    const due = await this.jobs.find({
      where: { status: 'pending', nextAttemptAt: LessThanOrEqual(new Date()) },
      order: { updatedAt: 'ASC' },
      take: limit,
    });
    let n = 0;
    for (const j of due) {
      if (await this.runJob(j.entityType as TranslationEntityType, j.entityId)) n++;
    }
    return n;
  }

  /** Run pending jobs until none is left, ignoring backoff (the backfill script). Returns how many finished. */
  async drain(onProgress?: (done: number, left: number) => void): Promise<number> {
    let done = 0;
    for (;;) {
      const batch = await this.jobs.find({ where: { status: 'pending' }, order: { updatedAt: 'ASC' }, take: 20 });
      if (!batch.length) return done;
      let progressed = false;
      for (const j of batch) {
        await this.jobs.update({ id: j.id }, { nextAttemptAt: new Date() });
        if (await this.runJob(j.entityType as TranslationEntityType, j.entityId)) {
          done++;
          progressed = true;
        }
      }
      onProgress?.(done, await this.jobs.count({ where: { status: 'pending' } }));
      if (!progressed) return done; // budget used up or provider failing: leave the rest to the sweeper
    }
  }

  /** Process one record. Returns true when the job finished (done), false when it was deferred, failed or already running. */
  async runJob(type: TranslationEntityType, id: string): Promise<boolean> {
    const key = `${type}:${id}`;
    const running = this.inflight.get(key);
    if (running) {
      running.dirty = true;
      return false;
    }
    const flight: Flight = { dirty: false, done: Promise.resolve(false), hold: false, held: false, wrote: false };
    this.inflight.set(key, flight);
    flight.done = (async () => {
      try {
        let finished = false;
        do {
          flight.dirty = false;
          finished = await this.runOnce(type, id);
        } while (flight.dirty && finished);
        return finished;
      } finally {
        this.inflight.delete(key);
      }
    })();
    return flight.done;
  }

  private async runOnce(type: TranslationEntityType, id: string): Promise<boolean> {
    const job = await this.jobs.findOne({ where: { entityType: type, entityId: id } });
    if (!job || job.status !== 'pending') return false;
    if (!this.enabled || !isJobType(type)) return false;
    try {
      const entity = (await this.ds.getRepository(BASE_ENTITIES[type]).findOne({ where: { id } as never })) as unknown as ({ id: string; sourceLang: string } & Record<string, unknown>) | null;
      if (!entity) {
        await this.jobs.delete({ id: job.id });
        return true;
      }
      const wrote = await this.translateRecord(type, entity);
      // A save that arrives while this runs sets `dirty` (see runJob): the job stays pending (not claimed) and runs once more
      // on the new text, so the translation that is kept is never the one of the text before the edit.
      const again = this.inflight.get(`${type}:${id}`);
      if (again?.dirty) {
        again.wrote ||= wrote;
        return true;
      }
      const claim = await this.jobs
        .createQueryBuilder()
        .update(TranslationJob)
        .set({ status: 'done', lastError: null, nextAttemptAt: null })
        .where("id = :id AND status = 'pending'", { id: job.id })
        .execute();
      if ((wrote || this.inflight.get(`${type}:${id}`)?.wrote) && this.republish) {
        const flight = this.inflight.get(`${type}:${id}`);
        // A save is waiting for this job and publishes the record itself (with both languages): no second event.
        if (flight?.hold) flight.held = true;
        else await this.republishNow(type, id);
      }
      return !!claim.affected;
    } catch (e) {
      if (e instanceof BudgetExceeded) {
        // Stay pending, without counting an attempt, until the budget resets.
        await this.jobs.update({ id: job.id }, { nextAttemptAt: nextUtcMidnight() });
        this.logger.warn(`${type}:${id} waits for tomorrow's translation budget`);
        return false;
      }
      const attempts = job.attempts + 1;
      const failed = attempts >= MAX_ATTEMPTS;
      await this.jobs.update(
        { id: job.id },
        {
          attempts,
          status: failed ? 'failed' : 'pending',
          lastError: String((e as Error).message ?? e).slice(0, 300),
          nextAttemptAt: failed ? null : new Date(Date.now() + BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length) - 1] * 60_000),
        },
      );
      this.logger.warn(`${type}:${id} translation attempt ${attempts} failed: ${(e as Error).message}`);
      if (failed && this.republish) {
        const fn = this.republishers.get(type);
        if (fn) await fn(id).catch(() => undefined); // let clients show "failed — retry"
      }
      return false;
    }
  }

  /** Translate everything a record is missing. Returns true when at least one row was written or removed. */
  private async translateRecord(type: TranslationEntityType, entity: { id: string; sourceLang: string } & Record<string, unknown>): Promise<boolean> {
    const existing = ((await this.rowsFor(type, [entity.id])).get(entity.id) ?? []) as RowLite[];
    const { items, obsolete } = planWork(type, entity, existing);
    let changed = false;
    for (const o of obsolete) {
      await this.rows.delete({ entityType: type, entityId: entity.id, field: o.field, locale: o.locale, origin: 'machine' });
      changed = true;
    }
    if (!items.length) return changed;

    // 1. Reuse any identical source already translated (same hash + target language): no call at all.
    const reuse = new Map<string, string>(); // `${hash}|${to}` -> value
    for (const to of ['en', 'fr'] as Locale[]) {
      const hashes = [...new Set(items.filter((i) => i.to === to).map((i) => i.hash))];
      if (!hashes.length) continue;
      for (const part of chunk(hashes)) {
        for (const r of await this.rows.find({ where: { sourceHash: In(part), locale: to } })) {
          if (r.entityType === type && r.entityId === entity.id) continue;
          reuse.set(`${r.sourceHash}|${to}`, r.value);
        }
      }
    }
    const todo: WorkItem[] = [];
    for (const it of items) {
      const hit = reuse.get(`${it.hash}|${it.to}`);
      if (hit !== undefined) {
        changed = (await this.writeMachine(type, entity.id, { field: it.field, locale: it.to, value: hit, sourceLang: it.from, sourceHash: it.hash })) || changed;
      } else todo.push(it);
    }
    if (!todo.length) return changed;

    // 2. One batched call per language pair, over every string of the record.
    const pairs = new Map<string, WorkItem[]>();
    for (const it of todo) pairs.set(`${it.from}>${it.to}`, [...(pairs.get(`${it.from}>${it.to}`) ?? []), it]);
    for (const [pair, group] of pairs) {
      const [from, to] = pair.split('>') as [Locale, Locale];
      const strings = new Set<string>();
      for (const it of group) {
        if (it.kind === 'text') strings.add(it.text);
        else for (const s of variantStrings(storedVariantGroups(it.text))) strings.add(s);
      }
      const known = new Map<string, string>();
      const fresh: string[] = [];
      for (const s of strings) {
        const t = this.terms.get(`${from}>${to}|${s}`);
        if (t !== undefined) known.set(s, t);
        else fresh.push(s);
      }
      if (fresh.length) {
        const chars = fresh.reduce((n, s) => n + s.length, 0);
        this.reserve(chars);
        const out = await this.provider.translate(fresh, from, to).catch((e) => {
          this.usage.chars = Math.max(0, this.usage.chars - chars); // a failed call is not billed: do not count it
          throw e;
        });
        if (out.length !== fresh.length) throw new Error('The translator returned a different number of texts.');
        fresh.forEach((s, i) => {
          known.set(s, out[i]);
          if (this.terms.size > 5000) this.terms.clear();
          this.terms.set(`${from}>${to}|${s}`, out[i]);
        });
      }
      for (const it of group) {
        const value = it.kind === 'text' ? known.get(it.text)! : JSON.stringify(applyVariantStrings(storedVariantGroups(it.text), known));
        changed = (await this.writeMachine(type, entity.id, { field: it.field, locale: it.to, value, sourceLang: it.from, sourceHash: it.hash })) || changed;
      }
    }
    return changed;
  }

  // ── Translate first, then store (reviews, replies, questions, answers, chat) ───────────

  /**
   * Translate a person's text BEFORE it is stored, so both languages are saved together. Never throws: returns null
   * when translation is off, the text has no language to translate, today's budget would be crossed, the language is
   * undetermined, the provider fails, or it takes longer than `TRANSLATE_SAVE_TIMEOUT_MS` (default 4000, read now). The
   * caller then stores the text untranslated and `translate:text` stays the fallback.
   *
   * One `detect` call (into `hint`'s other language, else French) recognises the source; the text is translated again
   * only for a locale that detect did not already cover (a text in neither English nor French, or already in the first target).
   */
  async translateForSave(text: string | null | undefined, hint?: string | null): Promise<SaveTranslation | null> {
    try {
      if (!this.enabled) return null;
      const t = String(text ?? '').trim();
      if (!shouldTranslate(t)) return null;
      const timeoutMs = saveTimeoutMs();
      const work = this.detectAndTranslate(t, hint);
      work.catch(() => undefined); // a slow provider that fails after the timeout must not become an unhandled rejection
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([work, new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), timeoutMs)))]);
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      this.logger.warn(`translate before save skipped: ${(e as Error).message}`);
      return null;
    }
  }

  private async detectAndTranslate(t: string, hint?: string | null): Promise<SaveTranslation | null> {
    await this.usedToday();
    this.reserve(t.length);
    const firstTarget: Locale = isLocale(hint) ? otherLocale(hint) : 'fr';
    const [det] = await this.provider.detect([t], firstTarget);
    const sourceLang = String(det?.sourceLang ?? 'und').toLowerCase().split('-')[0];
    if (!det || !sourceLang || sourceLang === 'und') return null;
    const others: Partial<Record<Locale, string>> = {};
    for (const locale of LOCALES) {
      if (locale === sourceLang) continue;
      if (locale === firstTarget) {
        others[locale] = det.text;
        continue;
      }
      this.reserve(t.length);
      [others[locale]] = await this.provider.translate([t], sourceLang, locale);
    }
    for (const locale of LOCALES) {
      const v = others[locale];
      if (typeof v !== 'string' || !v.trim()) delete others[locale];
    }
    return { sourceLang, others, sourceHash: sourceHash(sourceLang, t) };
  }

  /**
   * Write what {@link translateForSave} found as machine rows of the saved record. A failure is logged and swallowed:
   * the save has happened and must not fail because of a translator. Machine rows of the same field for a language the
   * new text no longer needs (an edit that switched the source language) are removed.
   */
  async saveTranslated(kind: StoredKind, id: string, saved: SaveTranslation | null | undefined): Promise<void> {
    if (!saved || !isStoredKind(kind) || !id) return;
    const { field } = STORED_KINDS[kind];
    try {
      for (const locale of LOCALES) {
        const value = saved.others[locale];
        if (typeof value !== 'string' || !value) continue;
        await this.writeMachine(kind, id, { field, locale, value, sourceLang: saved.sourceLang, sourceHash: saved.sourceHash });
      }
      const stale = LOCALES.filter((l) => !saved.others[l]);
      if (stale.length) await this.rows.delete({ entityType: kind, entityId: id, field, origin: 'machine', locale: In([...stale]) } as never);
    } catch (e) {
      this.logger.warn(`could not store translations of ${kind} ${id}: ${(e as Error).message}`);
    }
  }

  /**
   * Both languages of stored texts, ready to serve: ONE chunked query for all the ids (no N+1). A record with no
   * usable (current) row gets no entry: its field is then absent from the payload and clients use `translate:text`.
   */
  async i18nFor(kind: StoredKind, items: { id: string; text: string | null | undefined }[]): Promise<Map<string, TextI18n>> {
    const out = new Map<string, TextI18n>();
    if (!isStoredKind(kind)) return out;
    const withText = items.filter((i) => i.id && typeof i.text === 'string' && i.text.trim());
    if (!withText.length) return out;
    const { field } = STORED_KINDS[kind];
    let rows: Map<string, Translation[]>;
    try {
      rows = await this.rowsFor(kind, withText.map((i) => i.id));
    } catch (e) {
      this.logger.warn(`could not read translations of ${kind}: ${(e as Error).message}`);
      return out;
    }
    for (const { id, text } of withText) {
      const original = text as string;
      const trimmed = original.trim();
      const live = (rows.get(id) ?? []).filter(
        (r) => r.field === field && isLocale(r.locale) && !!r.sourceLang && !!r.value && r.sourceHash === sourceHash(r.sourceLang, trimmed),
      );
      if (!live.length) continue;
      const sourceLang = live[0].sourceLang as string;
      const view: TextI18n = { sourceLang };
      for (const r of live) if (r.sourceLang === sourceLang) view[r.locale as Locale] = r.value;
      if (isLocale(sourceLang) && view[sourceLang] === undefined) view[sourceLang] = original;
      out.set(id, view);
    }
    return out;
  }

  /**
   * {@link translateForSave} with the sender's language as the hint: the account's `users.locale` (one primary-key read,
   * made only when translation is on). A person writing in their own language then costs one provider call. Never throws.
   */
  async translateForSender(text: string | null | undefined, userId?: string | null): Promise<SaveTranslation | null> {
    if (!this.enabled) return null;
    let hint: string | undefined;
    if (userId) {
      try {
        hint = (await this.ds.getRepository(User).findOne({ where: { id: userId }, select: { id: true, locale: true } }))?.locale ?? undefined;
      } catch {
        hint = undefined;
      }
    }
    return this.translateForSave(text, hint);
  }

  /** {@link i18nFor} for a single record: its both-language view, or undefined. */
  async i18nOne(kind: StoredKind, id: string, text: string | null | undefined): Promise<TextI18n | undefined> {
    return (await this.i18nFor(kind, [{ id, text }])).get(id);
  }

  // ── Budget ──────────────────────────────────────────────────────────────────────────────

  /** Characters sent to the translator today (UTC): this process's count, seeded from today's machine rows after a restart. */
  async usedToday(): Promise<number> {
    const today = utcDay();
    if (this.usage.day !== today) {
      const len = this.ds.options.type === 'mysql' ? 'CHAR_LENGTH' : 'LENGTH';
      const row = await this.rows
        .createQueryBuilder('t')
        .select(`COALESCE(SUM(${len}(t.value)), 0)`, 'n')
        .where("t.origin = 'machine' AND t.updatedAt >= :from", { from: new Date(`${today}T00:00:00.000Z`) })
        .getRawOne<{ n: string }>();
      this.usage = { day: today, chars: Number(row?.n ?? 0) };
    }
    return this.usage.chars;
  }

  /** Count characters about to be sent; throws {@link BudgetExceeded} when today's limit would be crossed. */
  private reserve(chars: number): void {
    const today = utcDay();
    if (this.usage.day !== today) this.usage = { day: today, chars: 0 };
    if (this.usage.chars + chars > this.charLimit) throw new BudgetExceeded();
    this.usage.chars += chars;
    this.logger.debug(`translated ${chars} chars (${this.usage.chars}/${this.charLimit} today)`);
  }

  // ── Synchronous use (broadcasts) and on-demand text ─────────────────────────────────────

  /**
   * Translate right now, giving up after `timeoutMs`. Returns null when translation is off, over budget, failed or
   * too slow: callers fall back to the source text. Texts with no language to translate are copied as-is.
   */
  async translateNow(texts: string[], from: Locale, to: Locale, timeoutMs = 5000): Promise<string[] | null> {
    if (!this.enabled) return null;
    const need = texts.map((t) => shouldTranslate(t));
    const send = texts.filter((_, i) => need[i]);
    if (!send.length) return texts;
    try {
      await this.usedToday();
      this.reserve(send.reduce((n, s) => n + s.length, 0));
      let timer: ReturnType<typeof setTimeout> | undefined;
      const out = await Promise.race([
        this.provider.translate(send, from, to),
        new Promise<never>((_, rej) => (timer = setTimeout(() => rej(new Error('translation timed out')), timeoutMs))),
      ]).finally(() => clearTimeout(timer));
      let k = 0;
      return texts.map((t, i) => (need[i] ? out[k++] : t));
    } catch (e) {
      this.logger.warn(`synchronous translation skipped: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * `translate:text`: a stored review / reply / question / answer in the other language, cached as a translation
   * row. Takes a record id ONLY (C-I5): free text never reaches the translator, so a leaked client key cannot run
   * up the bill. A made-up (or hidden) id gets the same answer.
   */
  async translateStored(
    kind: unknown,
    id: unknown,
    target: unknown,
    opts: { staff?: boolean; private?: boolean } = {},
  ): Promise<{ text: string; sourceLang: string; same: boolean }> {
    const nothing = 'Nothing to translate.';
    if (!isStoredKind(kind) || typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error(nothing); // C-I5
    // Private text: the owning service (chat, support, disputes, exchanges, replacements) checks who may read it first.
    if ((STORED_KINDS[kind] as { private?: boolean }).private && !opts.private) throw new Error(nothing);
    if (!isLocale(target)) throw new Error('Choose English or French.');
    const spec = STORED_KINDS[kind];
    const rec = (await this.ds.getRepository(spec.entity as never).findOne({ where: { id } as never })) as unknown as Record<string, unknown> | null;
    if (!rec) throw new Error(nothing);
    if (spec.entity === Review && rec.status === 'hidden' && !opts.staff) throw new Error(nothing);
    const text = String(rec[spec.column] ?? '').trim();
    if (!text) throw new Error(nothing);

    const cached = await this.rows.findOne({ where: { entityType: kind, entityId: id, field: spec.field, locale: target } });
    if (cached && cached.sourceLang && cached.sourceHash === sourceHash(cached.sourceLang, text)) {
      return { text: cached.value, sourceLang: cached.sourceLang, same: cached.sourceLang === target };
    }
    // Written at save: the other language's row proves what language the text is in, so no second detect call is needed.
    const sibling = await this.rows.find({ where: { entityType: kind, entityId: id, field: spec.field } });
    const known = sibling.find((r) => r.sourceLang === target && r.sourceHash === sourceHash(target, text));
    if (known) return { text, sourceLang: target, same: true };
    const unavailable = 'Translation is not available right now. Try again later.';
    if (!this.enabled) throw new Error(unavailable);
    try {
      await this.usedToday();
      this.reserve(text.length);
    } catch {
      throw new Error(unavailable);
    }
    let det;
    try {
      [det] = await this.provider.detect([text], target);
    } catch (e) {
      this.logger.warn(`translate:text failed: ${(e as Error).message}`);
      throw new Error(unavailable);
    }
    const same = det.sourceLang === target;
    const value = same ? text : det.text;
    await this.writeOnDemand(kind, id, spec.field, target, value, det.sourceLang, sourceHash(det.sourceLang, text));
    return { text: value, sourceLang: det.sourceLang, same };
  }

  private async writeOnDemand(kind: StoredKind, id: string, field: string, locale: string, value: string, sourceLang: string, hash: string): Promise<void> {
    // The cache row is always a machine row, replaced when the source text changed (a reply that was edited).
    await this.writeMachine(kind, id, { field, locale, value, sourceLang, sourceHash: hash });
  }

  // ── Admin: status, retry, backfill ──────────────────────────────────────────────────────

  async status() {
    const counts = await this.jobs
      .createQueryBuilder('j')
      .select('j.status', 'status')
      .addSelect('COUNT(*)', 'n')
      .groupBy('j.status')
      .getRawMany<{ status: string; n: string }>();
    const n = (s: string) => Number(counts.find((c) => c.status === s)?.n ?? 0);
    const failedJobs = await this.jobs.find({ where: { status: 'failed' }, order: { updatedAt: 'DESC' }, take: 50 });
    return {
      provider: this.provider.name,
      enabled: this.enabled,
      pending: n('pending'),
      done: n('done'),
      failed: n('failed'),
      charsToday: await this.usedToday(),
      charLimit: this.charLimit,
      failedJobs: failedJobs.map((j) => ({ entityType: j.entityType, entityId: j.entityId, attempts: j.attempts, lastError: j.lastError })),
    };
  }

  /** Re-queue one record, or (with no arguments) every failed job. */
  async retry(input: { entityType?: unknown; entityId?: unknown } = {}): Promise<{ queued: number }> {
    if (input.entityType !== undefined || input.entityId !== undefined) {
      const type = String(input.entityType ?? '');
      const id = String(input.entityId ?? '');
      if (!isJobType(type) || !id) throw new Error('Choose a record to retry.');
      await this.enqueue(type, id, { wait: false });
      return { queued: 1 };
    }
    const failed = await this.jobs.find({ where: { status: 'failed' }, take: 500 });
    for (const j of failed) await this.enqueue(j.entityType as TranslationEntityType, j.entityId, { wait: false });
    return { queued: failed.length };
  }

  /**
   * Find every record missing a language and (unless `dryRun`) queue it. Returns what a machine would translate:
   * records, strings, characters and the estimated cost.
   */
  async backfill(opts: { dryRun?: boolean } = {}) {
    const perType: Record<string, { records: number; items: number; chars: number }> = {};
    let records = 0;
    let items = 0;
    let chars = 0;
    for (const type of JOB_TYPES) {
      const stat = { records: 0, items: 0, chars: 0 };
      const repo = this.ds.getRepository(BASE_ENTITIES[type]);
      for (let skip = 0; ; skip += 200) {
        const batch = (await repo.find({ order: { id: 'ASC' } as never, take: 200, skip })) as unknown as ({ id: string; sourceLang: string } & Record<string, unknown>)[];
        if (!batch.length) break;
        const rows = await this.rowsFor(type, batch.map((b) => b.id));
        for (const e of batch) {
          const { items: work } = planWork(type, e, (rows.get(e.id) ?? []) as RowLite[]);
          if (!work.length) continue;
          stat.records++;
          stat.items += work.length;
          stat.chars += work.reduce((n, w) => n + w.chars, 0);
          if (!opts.dryRun) await this.queueQuietly(type, e.id);
        }
        if (batch.length < 200) break;
      }
      perType[type] = stat;
      records += stat.records;
      items += stat.items;
      chars += stat.chars;
    }
    return { perType, records, items, chars, estimatedUsd: Number(((chars / 1_000_000) * USD_PER_MILLION_CHARS).toFixed(4)) };
  }

  /** Queue without running (the backfill script drains afterwards). */
  private async queueQuietly(type: TranslationEntityType, id: string): Promise<void> {
    const existing = await this.jobs.findOne({ where: { entityType: type, entityId: id } });
    const fields = { status: 'pending' as const, attempts: 0, nextAttemptAt: new Date(), lastError: null };
    if (existing) await this.jobs.update({ id: existing.id }, fields);
    else await this.jobs.insert(this.jobs.create({ entityType: type, entityId: id, ...fields }));
  }
}
