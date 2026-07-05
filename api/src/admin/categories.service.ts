import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../entities/category.entity';
import { AuthUser } from '../common/decorators';
import { slugify } from '../common/util';
import { AuditService } from './audit.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category) private readonly categories: Repository<Category>,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.categories.find({ order: { name: 'ASC' } });
  }

  async get(id: string) {
    const category = await this.categories.findOne({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async create(dto: CreateCategoryDto, user: AuthUser) {
    const category = this.categories.create({
      name: dto.name,
      nameFr: dto.nameFr,
      commissionRate: dto.commissionRate,
      imageUrl: dto.imageUrl,
      slug: slugify(dto.name),
    });
    const saved = await this.categories.save(category);
    await this.audit.log(user, 'category.create', 'Category', saved.id, dto.name);
    return saved;
  }

  async update(id: string, dto: UpdateCategoryDto, user: AuthUser) {
    const category = await this.get(id);
    if (dto.name !== undefined) {
      category.name = dto.name;
      category.slug = slugify(dto.name);
    }
    if (dto.nameFr !== undefined) category.nameFr = dto.nameFr;
    if (dto.commissionRate !== undefined) category.commissionRate = dto.commissionRate;
    if (dto.imageUrl !== undefined) category.imageUrl = dto.imageUrl;
    const saved = await this.categories.save(category);
    await this.audit.log(user, 'category.update', 'Category', id, JSON.stringify(dto));
    return saved;
  }

  async remove(id: string, user: AuthUser) {
    const category = await this.get(id);
    await this.categories.remove(category);
    await this.audit.log(user, 'category.delete', 'Category', id);
    return { deleted: true, id };
  }
}
