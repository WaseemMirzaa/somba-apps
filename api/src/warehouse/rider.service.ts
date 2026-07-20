import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeliveryTask } from '../database/entities';

const PER_DELIVERY_USD = 2.5;

@Injectable()
export class RiderService {
  constructor(
    @InjectRepository(DeliveryTask)
    private readonly tasks: Repository<DeliveryTask>,
  ) {}

  /** Earnings + shift summary for a rider. */
  async earnings(riderId: string) {
    const mine = await this.tasks.find({ where: { riderId } });
    const delivered = mine.filter((t) => t.status === 'delivered');
    const codCollected = delivered.reduce((s, t) => s + t.codAmountUsd, 0);
    const active = mine.filter(
      (t) => t.status !== 'delivered' && t.status !== 'failed',
    ).length;
    return {
      totalTasks: mine.length,
      delivered: delivered.length,
      active,
      codCollectedUsd: Number(codCollected.toFixed(2)),
      earningsUsd: Number((delivered.length * PER_DELIVERY_USD).toFixed(2)),
    };
  }
}
