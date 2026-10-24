import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Broadcast, User } from '../database/entities';
import {
  ADMIN_ROLES,
  NotificationsService,
} from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { str } from '../common/validate';
import { TranslationService } from '../translation/translation.service';
import type { TranslationStatus } from '../translation/translation.service';
import { planWrite, sourceHash } from '../translation/translatable';
import { otherLocale } from '../translation/translator.provider';

/** A broadcast as admins receive it: title and body in both languages. */
export type ServedBroadcast = Broadcast & { titleFr: string; bodyFr: string; machineTranslated: string[]; translationStatus: TranslationStatus };

/** Translate a broadcast for the recipients' phones within this long; slower means the source text goes out. */
const SEND_TRANSLATION_TIMEOUT_MS = 5000;

@Injectable()
export class BroadcastsService {
  constructor(
    @InjectRepository(Broadcast) private readonly repo: Repository<Broadcast>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly notifications: NotificationsService,
    private readonly emitter: RealtimeEmitter,
    private readonly translations: TranslationService,
  ) {}

  async present(rows: Broadcast[]): Promise<ServedBroadcast[]> {
    const texts = await this.translations.present('broadcast', rows);
    return rows.map((r) => {
      const t = texts.get(r.id)!;
      return Object.assign(Object.create(Object.getPrototypeOf(r)), r, {
        title: t.texts.title ?? r.title,
        titleFr: t.texts.titleFr ?? r.title,
        body: t.texts.body ?? r.body,
        bodyFr: t.texts.bodyFr ?? r.body,
        machineTranslated: t.machineTranslated,
        translationStatus: t.translationStatus,
      }) as ServedBroadcast;
    });
  }

  async list(): Promise<ServedBroadcast[]> {
    return this.present(await this.repo.find({ order: { createdAt: 'DESC' }, take: 100 }));
  }

  /**
   * Send a marketing broadcast to an audience role (or all customers). Written in English, French or both: the
   * missing language is translated right now (5 s at most; the source text goes out when that fails), and the
   * French version is handed to notifications so French phones get French pushes.
   */
  async send(
    sentBy: string,
    data: { title?: string; body?: string; titleFr?: string; bodyFr?: string; audience?: string; sourceLang?: string },
  ): Promise<ServedBroadcast> {
    const word = (k: 'title' | 'body' | 'titleFr' | 'bodyFr', label: string, max: number) =>
      data[k] === undefined || data[k] === null || data[k] === '' ? null : str(data[k], label, { max });
    const input = {
      title: { en: word('title', 'Title', 200), fr: word('titleFr', 'French title', 200) },
      body: { en: word('body', 'Body', 2000), fr: word('bodyFr', 'French body', 2000) },
    };
    const plan = planWrite({ type: 'broadcast', create: true, state: null, input, clientSourceLang: data.sourceLang, missingTitle: 'Enter a title in English or French.' });
    const source = plan.sourceLang;
    const other = otherLocale(source);
    const title = plan.base.title ?? '';
    const body = plan.base.body ?? '';
    if (!body && !input.body.en && !input.body.fr) throw new Error('Enter a message in English or French.');

    // The other language: the author's own, else translated now.
    const authored = { title: plan.authors.find((a) => a.field === 'title')?.value ?? null, body: plan.authors.find((a) => a.field === 'body')?.value ?? null };
    const wanted = [authored.title ? null : title, authored.body ? null : body].map((t) => t ?? '');
    let translated: string[] | null = null;
    if (wanted.some((t) => t)) {
      const out = await this.translations.translateNow(wanted.filter((t) => t), source, other, SEND_TRANSLATION_TIMEOUT_MS);
      if (out) {
        let k = 0;
        translated = wanted.map((t) => (t ? out[k++] : ''));
      }
    }
    const otherTitle = authored.title ?? translated?.[0] ?? null;
    const otherBody = authored.body ?? translated?.[1] ?? null;
    // The French version goes to notifications only when it is real (written in French, authored or translated);
    // otherwise French phones get the source text through the usual patterns, like any English-only notice.
    const fr = source === 'fr' ? { title, body } : otherTitle || otherBody ? { title: otherTitle ?? title, body: otherBody ?? body } : undefined;
    const en = { title: source === 'en' ? title : (otherTitle ?? title), body: source === 'en' ? body : (otherBody ?? body) };

    const audience = data.audience ?? 'customer';
    const recipients =
      audience === 'all'
        ? await this.users.count()
        : await this.users.count({
            where: { role: audience as never },
          });
    const broadcast = await this.repo.manager.transaction(async (m) => {
      const row = await m.save(m.create(Broadcast, { title, body, sourceLang: source, audience, sentBy, recipients }));
      await this.translations.applyPlan(m, 'broadcast', row.id, plan, { title, body });
      return row;
    });
    // What the machine just produced is stored as a machine row; what it could not is queued for later.
    const made = [
      !authored.title && translated?.[0] ? { field: 'title', value: translated[0], src: title } : null,
      !authored.body && translated?.[1] ? { field: 'body', value: translated[1], src: body } : null,
    ].filter((x): x is { field: string; value: string; src: string } => !!x);
    for (const r of made) {
      await this.translations.writeMachine('broadcast', broadcast.id, { field: r.field, locale: other, value: r.value, sourceLang: source, sourceHash: sourceHash(source, r.src) });
    }
    if (!translated) await this.translations.enqueue('broadcast', broadcast.id);

    // Push a notification into the audience room. Phones show the title/body in the recipient's language.
    await this.notifications.toRole(audience === 'all' ? 'customer' : audience, {
      title: en.title,
      body: en.body,
      type: 'marketing',
      fr,
    });
    const served = (await this.present([broadcast]))[0];
    this.emitter.toRoles(ADMIN_ROLES, 'broadcast:created', served);
    return served;
  }
}
