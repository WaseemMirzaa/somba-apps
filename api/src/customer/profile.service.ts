import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { UpdateProfileDto } from './dto';

@Injectable()
export class ProfileService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  private shape(u: User) {
    return { id: u.id, email: u.email, name: u.name, phone: u.phone, role: u.role };
  }

  async get(userId: string) {
    const u = await this.users.findOne({ where: { id: userId } });
    if (!u) throw new NotFoundException('User not found');
    return this.shape(u);
  }

  async update(userId: string, dto: UpdateProfileDto) {
    const u = await this.users.findOne({ where: { id: userId } });
    if (!u) throw new NotFoundException('User not found');
    if (dto.name !== undefined) u.name = dto.name;
    if (dto.phone !== undefined) u.phone = dto.phone;
    return this.shape(await this.users.save(u));
  }
}
