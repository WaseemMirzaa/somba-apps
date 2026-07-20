import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CmsBlock } from '../database/entities';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ADMIN_ROLES } from '../notifications/notifications.service';

@Injectable()
export class CmsService {
  constructor(
    @InjectRepository(CmsBlock) private readonly blocks: Repository<CmsBlock>,
    private readonly emitter: RealtimeEmitter,
  ) {}

  list(): Promise<CmsBlock[]> {
    return this.blocks.find();
  }

  async upsert(data: Partial<CmsBlock> & { key: string }): Promise<CmsBlock> {
    const existing = await this.blocks.findOne({ where: { key: data.key } });
    const block = await this.blocks.save(
      existing ? this.blocks.merge(existing, data) : this.blocks.create(data),
    );
    this.emitter.toRoles(['customer', ...ADMIN_ROLES], 'cms:updated', block);
    return block;
  }
}
