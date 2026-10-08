import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Address } from '../database/entities';
import { RealtimeEmitter } from '../realtime/realtime-emitter';

/** Only these may be set by the client — never `id`, `userId` or `createdAt`. */
const EDITABLE = [
  'label', 'line1', 'line2', 'city', 'commune', 'region',
  'country', 'postalCode', 'phone', 'zoneId', 'isDefault',
] as const;

function pickEditable(data: Record<string, unknown> | undefined): Partial<Address> {
  const out: Record<string, unknown> = {};
  for (const k of EDITABLE) {
    if (data && data[k] !== undefined) out[k] = data[k];
  }
  return out as Partial<Address>;
}

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
    const clean = pickEditable(data as Record<string, unknown>);
    if (!clean.line1 || !clean.city) {
      throw new BadRequestException('Street address and city are required.');
    }
    if (!clean.label) clean.label = 'Home';
    const count = await this.repo.count({ where: { userId } });
    const address = await this.repo.save(
      this.repo.create({
        ...clean,
        userId,
        isDefault: clean.isDefault ?? count === 0,
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
    const clean = pickEditable(patch as Record<string, unknown>);
    if (Object.keys(clean).length) await this.repo.update({ id, userId }, clean);
    if (clean.isDefault) await this.clearOtherDefaults(userId, id);
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
