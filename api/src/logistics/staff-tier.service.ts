import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../database/entities';
import { DeskAction, tierAllows } from './tiers';

/**
 * Tier check for gateways that do not load the caller's warehouse row themselves (after-sale, disputes). Admins pass;
 * warehouse staff by the tier in the database (it can change while they are connected); everyone else never.
 */
@Injectable()
export class StaffTierService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  async allows(user: { id: string; role: string }, action: DeskAction): Promise<boolean> {
    if (user.role.startsWith('admin')) return true;
    if (user.role !== 'warehouse_staff') return false;
    const row = await this.users.findOne({ where: { id: user.id }, select: ['id', 'warehouseTier'] });
    return tierAllows(user.role, row?.warehouseTier, action);
  }
}
