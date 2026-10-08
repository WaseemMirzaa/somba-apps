import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CmsBlock } from '../database/entities';
import { oneOf, str } from '../common/validate';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ADMIN_ROLES } from '../notifications/notifications.service';

@Injectable()
export class CmsService {
  constructor(
    @InjectRepository(CmsBlock) private readonly blocks: Repository<CmsBlock>,
    private readonly emitter: RealtimeEmitter,
  ) {}

  /** Shoppers only see active blocks; admins see drafts too. */
  list(admin = false): Promise<CmsBlock[]> {
    return admin ? this.blocks.find() : this.blocks.find({ where: { active: true } });
  }

  async upsert(data: Record<string, unknown>): Promise<CmsBlock> {
    const key = str(data?.key, 'Key', { max: 80 });
    const clean: Partial<CmsBlock> = {
      key,
      ...(data.title !== undefined ? { title: str(data.title, 'Title', { max: 200 }) } : {}),
      ...(data.body !== undefined ? { body: str(data.body, 'Body', { min: 0, max: 20000 }) } : {}),
      ...(data.type !== undefined ? { type: oneOf(data.type, ['banner', 'page', 'faq', 'popup', 'notice'] as const, 'Type') } : {}),
      ...(data.active !== undefined ? { active: !!data.active } : {}),
    };
    const existing = await this.blocks.findOne({ where: { key } });
    if (!existing && (clean.title === undefined || clean.body === undefined)) {
      throw new Error('A new block needs a title and a body.');
    }
    const block = await this.blocks.save(existing ? this.blocks.merge(existing, clean) : this.blocks.create(clean));
    this.emitter.toRoles(['customer', ...ADMIN_ROLES], 'cms:updated', block);
    return block;
  }
}
