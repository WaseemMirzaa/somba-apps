import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../database/entities';
import { num, optStr, str } from '../common/validate';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ADMIN_ROLES } from '../notifications/notifications.service';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category) private readonly repo: Repository<Category>,
    private readonly emitter: RealtimeEmitter,
  ) {}

  list(): Promise<Category[]> {
    return this.repo.find({ order: { sortOrder: 'ASC' } });
  }

  private async pushAll(): Promise<Category[]> {
    const cats = await this.list();
    this.emitter.toRoles(['customer', 'guest', ...ADMIN_ROLES], 'categories:updated', cats);
    return cats;
  }

  private static clean(data: Record<string, unknown>, partial: boolean): Partial<Category> {
    const out: Partial<Category> = {};
    if (!partial || data?.name !== undefined) out.name = str(data?.name, 'Name', { max: 100 });
    if (data?.nameFr !== undefined) out.nameFr = optStr(data.nameFr, 'French name', 100);
    if (data?.icon !== undefined) out.icon = optStr(data.icon, 'Icon', 100);
    if (data?.image !== undefined) out.image = optStr(data.image, 'Image', 500);
    if (data?.sortOrder !== undefined) out.sortOrder = num(data.sortOrder, 'Sort order', { min: 0, max: 100000, int: true });
    return out;
  }

  async create(data: Record<string, unknown>): Promise<Category> {
    const cat = await this.repo.save(this.repo.create(CategoriesService.clean(data, false)));
    await this.pushAll();
    return cat;
  }

  async update(id: string, patch: Record<string, unknown>): Promise<Category | null> {
    const clean = CategoriesService.clean(patch, true);
    if (Object.keys(clean).length) await this.repo.update({ id }, clean);
    await this.pushAll();
    return this.repo.findOne({ where: { id } });
  }

  async remove(id: string): Promise<void> {
    await this.repo.delete({ id });
    await this.pushAll();
  }
}
