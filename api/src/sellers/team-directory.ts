import { Global, Injectable, Module } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Seller, SellerTeamMember } from '../database/entities';
import type { TeamRole } from '../database/entities';
import { permissionForNotice, roleAllows } from './seller-permissions';
import type { SellerPermission } from './seller-permissions';

export interface ActiveMember {
  userId: string;
  role: TeamRole;
}

const TTL_MS = 10_000;
/** Every shopper whose event passes by is cached too (as "owns no store"): keep the map from growing without end. */
const MAX_CACHED = 5_000;

/**
 * Who works for a store, answered fast: a few lookups are on the hot path of every push (live events and saved
 * notices addressed to a store owner also reach the staff whose role handles them). Entries live 10 seconds and are
 * dropped on every team change. Depends on repositories only, so any module can use it.
 */
@Injectable()
export class TeamDirectory {
  private readonly byOwner = new Map<string, { at: number; members: ActiveMember[] }>();

  constructor(
    @InjectRepository(SellerTeamMember) private readonly team: Repository<SellerTeamMember>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
  ) {}

  /** Forget cached answers (a member joined, left or changed role). */
  invalidate(): void {
    this.byOwner.clear();
  }

  private prune(): void {
    const now = Date.now();
    for (const [k, v] of this.byOwner) if (now - v.at >= TTL_MS) this.byOwner.delete(k);
    if (this.byOwner.size > MAX_CACHED) this.byOwner.clear();
  }

  /** The active staff of the store owned by this user (empty for anyone who is not a store owner). */
  async membersOfOwner(ownerUserId: string): Promise<ActiveMember[]> {
    const hit = this.byOwner.get(ownerUserId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.members;
    const store = await this.sellers.findOne({ where: { userId: ownerUserId }, select: { id: true } });
    const rows = store ? await this.team.find({ where: { sellerId: store.id, status: 'active' } }) : [];
    const members = rows.filter((r) => !!r.userId).map((r) => ({ userId: r.userId as string, role: r.role }));
    this.byOwner.set(ownerUserId, { at: Date.now(), members });
    if (this.byOwner.size > MAX_CACHED) this.prune();
    return members;
  }

  async membersOfStore(sellerId: string): Promise<ActiveMember[]> {
    const rows = await this.team.find({ where: { sellerId, status: 'active' } });
    return rows.filter((r) => !!r.userId).map((r) => ({ userId: r.userId as string, role: r.role }));
  }

  /** Staff user ids who should also receive a saved notice of this type addressed to the store owner. */
  async recipientsForNotice(ownerUserId: string, noticeType: string | null | undefined): Promise<string[]> {
    const members = await this.membersOfOwner(ownerUserId);
    if (!members.length) return [];
    const permission = permissionForNotice(noticeType);
    return members.filter((m) => roleAllows(m.role, permission)).map((m) => m.userId);
  }

  /** Staff user ids who should also hear a live event addressed to the store owner. */
  async recipientsFor(ownerUserId: string, permission: SellerPermission): Promise<string[]> {
    const members = await this.membersOfOwner(ownerUserId);
    return members.filter((m) => roleAllows(m.role, permission)).map((m) => m.userId);
  }
}

/** Global so NotificationsService and the emitter's mirror can use the directory without importing the seller module. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([SellerTeamMember, Seller])],
  providers: [TeamDirectory],
  exports: [TeamDirectory],
})
export class TeamDirectoryModule {}
