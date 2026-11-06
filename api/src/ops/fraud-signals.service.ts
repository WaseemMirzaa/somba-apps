import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { In, Repository } from 'typeorm';
import { FraudSignal, Order } from '../database/entities';

/** An order that has not reached the customer yet (and was not cancelled): its address can still matter. */
export const ORDER_IN_FLIGHT = ['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery'] as const;

type Listener = (userId: string) => void | Promise<void>;

/**
 * Writes the small facts the fraud rules count (`fraud_signals`): an address change while an order was still on its
 * way, and a device an account used. It only records; `FraudRulesService` judges. Never throws into the flow that
 * calls it (an address save or a push registration must not fail because of this).
 */
@Injectable()
export class FraudSignalsService {
  private readonly logger = new Logger(FraudSignalsService.name);
  private readonly listeners: Listener[] = [];

  constructor(
    @InjectRepository(FraudSignal) private readonly signals: Repository<FraudSignal>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
  ) {}

  /** Called after every recorded signal with the account it belongs to (the rules re-check that account). */
  onSignal(fn: Listener): void {
    this.listeners.push(fn);
  }

  /** A device (push token) used by this account. Stored as a hash, once per account and device. */
  async noteDevice(userId: string, token: string): Promise<void> {
    try {
      const key = createHash('sha256').update(`device:${token}`).digest('hex').slice(0, 32);
      const seen = await this.signals.findOne({ where: { userId, kind: 'device', key } });
      if (seen) return;
      await this.signals.save(this.signals.create({ userId, kind: 'device', key }));
      await this.tell(userId);
    } catch (e) {
      this.logger.warn(`device signal failed: ${(e as Error).message}`);
    }
  }

  /** The customer changed (or added) a delivery address. Counted only while one of their orders is still on its way. */
  async noteAddressChange(userId: string, addressId: string): Promise<void> {
    try {
      const open = await this.orders.count({ where: { customerId: userId, status: In([...ORDER_IN_FLIGHT]) } });
      if (open === 0) return;
      await this.signals.save(this.signals.create({ userId, kind: 'address_change', key: String(addressId).slice(0, 64) }));
      await this.tell(userId);
    } catch (e) {
      this.logger.warn(`address signal failed: ${(e as Error).message}`);
    }
  }

  private async tell(userId: string): Promise<void> {
    for (const fn of this.listeners) {
      try {
        await fn(userId);
      } catch (e) {
        this.logger.warn(`fraud check failed: ${(e as Error).message}`);
      }
    }
  }
}
