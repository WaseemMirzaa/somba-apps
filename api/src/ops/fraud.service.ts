import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FraudAlert } from '../database/entities';
import type { FraudStatus } from '../database/entities/fraud-alert.entity';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ADMIN_ROLES } from '../notifications/notifications.service';

@Injectable()
export class FraudService {
  constructor(
    @InjectRepository(FraudAlert) private readonly repo: Repository<FraudAlert>,
    private readonly emitter: RealtimeEmitter,
  ) {}

  list(): Promise<FraudAlert[]> {
    return this.repo.find({ order: { createdAt: 'DESC' }, take: 200 });
  }

  /** Raise a COD-risk alert when a large COD order is placed. */
  async flagCodRisk(
    customer: string,
    orderId: string,
    amountUsd: number,
    capUsd: number,
  ): Promise<FraudAlert | null> {
    if (amountUsd <= capUsd) return null;
    const alert = await this.repo.save(
      this.repo.create({
        type: 'cod_risk',
        severity: amountUsd > capUsd * 2 ? 'high' : 'medium',
        customer,
        orderId,
        score: Math.min(99, Math.round((amountUsd / capUsd) * 40)),
        status: 'open',
      }),
    );
    this.emitter.toRoles(ADMIN_ROLES, 'fraud:created', alert);
    return alert;
  }

  async setStatus(id: string, status: FraudStatus): Promise<FraudAlert | null> {
    await this.repo.update({ id }, { status });
    const alert = await this.repo.findOne({ where: { id } });
    if (alert) this.emitter.toRoles(ADMIN_ROLES, 'fraud:updated', alert);
    return alert;
  }
}
