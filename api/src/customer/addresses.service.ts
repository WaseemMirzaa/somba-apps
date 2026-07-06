import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Address } from '../entities/address.entity';
import { AddressDto } from './dto';

@Injectable()
export class AddressesService {
  constructor(@InjectRepository(Address) private readonly addresses: Repository<Address>) {}

  list(userId: string) {
    return this.addresses.find({
      where: { user: { id: userId } },
      order: { isDefault: 'DESC', createdAt: 'ASC' },
    });
  }

  private async clearDefaults(userId: string) {
    await this.addresses.update({ user: { id: userId }, isDefault: true }, { isDefault: false });
  }

  async create(userId: string, dto: AddressDto) {
    const count = await this.addresses.count({ where: { user: { id: userId } } });
    const makeDefault = dto.isDefault || count === 0;
    if (makeDefault) await this.clearDefaults(userId);
    const row = this.addresses.create({
      user: { id: userId } as any,
      label: dto.label,
      name: dto.name,
      phone: dto.phone,
      line: dto.line,
      city: dto.city ?? 'Kinshasa',
      zone: dto.zone ?? 'Gombe',
      isDefault: makeDefault,
      lat: dto.lat ?? -4.325,
      lng: dto.lng ?? 15.322,
    });
    return this.addresses.save(row);
  }

  private async own(userId: string, id: string) {
    const row = await this.addresses.findOne({ where: { id, user: { id: userId } } });
    if (!row) throw new NotFoundException('Address not found');
    return row;
  }

  async update(userId: string, id: string, dto: AddressDto) {
    const row = await this.own(userId, id);
    if (dto.isDefault) await this.clearDefaults(userId);
    Object.assign(row, {
      label: dto.label ?? row.label,
      name: dto.name ?? row.name,
      phone: dto.phone ?? row.phone,
      line: dto.line ?? row.line,
      city: dto.city ?? row.city,
      zone: dto.zone ?? row.zone,
      isDefault: dto.isDefault ?? row.isDefault,
      lat: dto.lat ?? row.lat,
      lng: dto.lng ?? row.lng,
    });
    return this.addresses.save(row);
  }

  async remove(userId: string, id: string) {
    const row = await this.own(userId, id);
    await this.addresses.remove(row);
    return { ok: true };
  }
}
