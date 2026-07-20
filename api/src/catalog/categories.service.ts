import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../database/entities';
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

  async create(data: Partial<Category>): Promise<Category> {
    const cat = await this.repo.save(this.repo.create(data));
    await this.pushAll();
    return cat;
  }

  async update(id: string, patch: Partial<Category>): Promise<Category | null> {
    await this.repo.update({ id }, patch);
    await this.pushAll();
    return this.repo.findOne({ where: { id } });
  }

  async remove(id: string): Promise<void> {
    await this.repo.delete({ id });
    await this.pushAll();
  }
}
