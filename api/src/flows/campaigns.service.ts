import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Campaign, Seller } from '../database/entities';
import type { CampaignStatus } from '../database/entities';
import {
  ADMIN_ROLES,
  NotificationsService,
} from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';

/** Marketing campaigns: sellers propose, marketing/admins approve. */
@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Campaign) private readonly campaigns: Repository<Campaign>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    private readonly notifications: NotificationsService,
    private readonly emitter: RealtimeEmitter,
  ) {}

  /** Seller sees their own campaigns; ops/admin see everything. */
  async list(user: { id: string; role: string }): Promise<Campaign[]> {
    if (user.role === 'seller') {
      const seller = await this.sellers.findOne({ where: { userId: user.id } });
      const sellerId = seller?.id ?? user.id;
      return this.campaigns.find({
        where: [{ sellerId }, { sellerId: user.id }],
        order: { createdAt: 'DESC' },
      });
    }
    return this.campaigns.find({ order: { createdAt: 'DESC' }, take: 200 });
  }

  async create(
    user: { id: string; name: string },
    input: {
      name: string;
      nameFr?: string;
      discount?: number;
      productCount?: number;
      budgetUsd?: number;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<Campaign> {
    const seller = await this.sellers.findOne({ where: { userId: user.id } });
    const campaign = await this.campaigns.save(
      this.campaigns.create({
        reference: `CMP-${Date.now().toString().slice(-8)}`,
        sellerId: seller?.id ?? user.id,
        sellerName: seller?.name ?? user.name,
        name: input.name,
        nameFr: input.nameFr ?? null,
        discount: input.discount ?? 0,
        productCount: input.productCount ?? 0,
        budgetUsd: input.budgetUsd ?? 0,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        status: 'pending',
      }),
    );
    this.emitter.toRoles(
      [...ADMIN_ROLES, 'admin_marketing'],
      'campaign:updated',
      campaign,
    );
    if (seller?.userId) this.emitter.toUser(seller.userId, 'campaign:updated', campaign);
    await this.notifications.toRole('admin_marketing', {
      title: 'New campaign request',
      body: `${campaign.name} · ${campaign.discount}% off`,
      type: 'campaign',
      entityId: campaign.id,
    });
    return campaign;
  }

  async setStatus(id: string, status: CampaignStatus): Promise<Campaign> {
    const campaign = await this.campaigns.findOne({ where: { id } });
    if (!campaign) throw new NotFoundException('Campaign not found.');
    campaign.status = status;
    const saved = await this.campaigns.save(campaign);
    this.emitter.toRoles(
      [...ADMIN_ROLES, 'admin_marketing'],
      'campaign:updated',
      saved,
    );
    if (saved.sellerId) {
      const seller = await this.sellers.findOne({ where: { id: saved.sellerId } });
      if (seller?.userId) {
        this.emitter.toUser(seller.userId, 'campaign:updated', saved);
        await this.notifications.toUser(seller.userId, {
          title: `Campaign ${status}`,
          body: `"${saved.name}" is now ${status}.`,
          type: 'campaign',
          entityId: saved.id,
        });
      }
    }
    return saved;
  }

  async update(
    id: string,
    patch: Partial<Pick<Campaign, 'name' | 'discount' | 'budgetUsd' | 'startDate' | 'endDate' | 'productCount'>>,
  ): Promise<Campaign> {
    const campaign = await this.campaigns.findOne({ where: { id } });
    if (!campaign) throw new NotFoundException('Campaign not found.');
    Object.assign(campaign, patch);
    const saved = await this.campaigns.save(campaign);
    this.emitter.toRoles([...ADMIN_ROLES, 'admin_marketing'], 'campaign:updated', saved);
    return saved;
  }
}
