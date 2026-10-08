import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { num, optStr, str } from '../common/validate';
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
    if (user.role.startsWith('admin')) {
      return this.campaigns.find({ order: { createdAt: 'DESC' }, take: 200 });
    }
    return [];
  }

  /** Does this campaign belong to the seller account? */
  private async owns(user: { id: string }, campaign: Campaign): Promise<boolean> {
    const seller = await this.sellers.findOne({ where: { userId: user.id } });
    return campaign.sellerId === user.id || (!!seller && campaign.sellerId === seller.id);
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
        ...CampaignsService.clean(input, false),
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

  /** Validated, whitelisted campaign fields. */
  private static clean(input: Record<string, unknown>, partial: boolean) {
    const out: Record<string, unknown> = {};
    const has = (k: string) => input[k] !== undefined;
    if (!partial || has('name')) out.name = str(input.name, 'Campaign name', { max: 150 });
    if (has('nameFr')) out.nameFr = optStr(input.nameFr, 'French name', 150);
    if (!partial || has('discount')) out.discount = num(input.discount ?? 0, 'Discount', { min: 0, max: 90 });
    if (!partial || has('productCount')) out.productCount = num(input.productCount ?? 0, 'Products', { min: 0, max: 100000, int: true });
    if (!partial || has('budgetUsd')) out.budgetUsd = num(input.budgetUsd ?? 0, 'Budget', { min: 0, max: 1_000_000 });
    if (has('startDate')) out.startDate = optStr(input.startDate, 'Start date', 40);
    if (has('endDate')) out.endDate = optStr(input.endDate, 'End date', 40);
    return out;
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

  /** Sellers may edit their OWN campaign until it is approved; admins any. */
  async update(
    user: { id: string; role: string },
    id: string,
    patch: Record<string, unknown>,
  ): Promise<Campaign> {
    const campaign = await this.campaigns.findOne({ where: { id } });
    if (!campaign) throw new NotFoundException('Campaign not found.');
    const admin = user.role.startsWith('admin');
    if (!admin) {
      if (!(await this.owns(user, campaign))) throw new NotFoundException('Campaign not found.');
      if (!['draft', 'pending', 'rejected'].includes(campaign.status)) {
        throw new BadRequestException('An approved campaign can no longer be edited. Ask marketing to change it.');
      }
    }
    Object.assign(campaign, CampaignsService.clean(patch ?? {}, true));
    if (!admin) campaign.status = 'pending'; // an edit needs re-approval
    const saved = await this.campaigns.save(campaign);
    this.emitter.toRoles([...ADMIN_ROLES, 'admin_marketing'], 'campaign:updated', saved);
    return saved;
  }
}
