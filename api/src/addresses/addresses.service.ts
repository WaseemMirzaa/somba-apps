import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Address } from '../database/entities';
import { RealtimeEmitter } from '../realtime/realtime-emitter';

@Injectable()
export class AddressesService {
  constructor(
    @InjectRepository(Address) private readonly repo: Repository<Address>,
    private readonly emitter: RealtimeEmitter,
  ) {}

  list(userId: string): Promise<Address[]> {
    return this.repo.find({ where: { userId }, order: { createdAt: 'ASC' } });
  }

  async create(userId: string, data: Partial<Address>): Promise<Address> {
    const count = await this.repo.count({ where: { userId } });
    const address = await this.repo.save(
      this.repo.create({
        ...data,
        userId,
        isDefault: data.isDefault ?? count === 0,
      }),
    );
    if (address.isDefault) await this.clearOtherDefaults(userId, address.id);
    await this.push(userId);
    return address;
  }

  async update(
    userId: string,
    id: string,
    patch: Partial<Address>,
  ): Promise<Address | null> {
    await this.repo.update({ id, userId }, patch);
    if (patch.isDefault) await this.clearOtherDefaults(userId, id);
    await this.push(userId);
    return this.repo.findOne({ where: { id, userId } });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.repo.delete({ id, userId });
    await this.push(userId);
  }

  private async clearOtherDefaults(userId: string, keepId: string) {
    await this.repo
      .createQueryBuilder()
      .update(Address)
      .set({ isDefault: false })
      .where('userId = :userId AND id != :keepId', { userId, keepId })
      .execute();
  }

  private async push(userId: string) {
    this.emitter.toUser(userId, 'addresses:updated', await this.list(userId));
  }
}
