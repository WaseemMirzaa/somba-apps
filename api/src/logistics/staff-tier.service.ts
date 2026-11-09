import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../database/entities';
import { DeskAction, isDeskAdmin, tierAllows } from './tiers';

/**
 * Tier check for gateways that do not load the caller's warehouse row themselves (after-sale, disputes). Admins pass;
 * warehouse staff by the tier in the database (it can change while they are connected); everyone else never.
 */
@Injectable()
export class StaffTierService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  /** The warehouse a staff member belongs to, as the database holds it now (null for admins and for staff not linked to one). */
  async hubOf(user: { id: string; role: string }): Promise<string | null> {
    if (user.role !== 'warehouse_staff') return null;
    const row = await this.users.findOne({ where: { id: user.id }, select: ['id', 'hubId'] });
    return row?.hubId ?? null;
  }

  async allows(user: { id: string; role: string }, action: DeskAction): Promise<boolean> {
    if (isDeskAdmin(user.role)) return true;
    if (user.role !== 'warehouse_staff') return false;
    const row = await this.users.findOne({ where: { id: user.id }, select: ['id', 'warehouseTier'] });
    return tierAllows(user.role, row?.warehouseTier, action);
  }
}
