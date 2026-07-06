import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Dispute } from '../entities/dispute.entity';
import { Order } from '../entities/order.entity';
import { User } from '../entities/user.entity';
import { DisputeStatus } from '../common/enums';
import { refCode, round2 } from '../common/util';
import { CreateDisputeDto } from './dto';

/**
 * Customer-facing returns / disputes. Creates the same `Dispute` records the
 * admin console resolves (open → resolved/rejected), scoped to the signed-in
 * customer's email.
 */
@Injectable()
export class DisputesService {
  constructor(
    @InjectRepository(Dispute) private readonly disputes: Repository<Dispute>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async listMine(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.disputes.find({
      where: { customerEmail: user.email },
      order: { createdAt: 'DESC' },
    });
  }

  async create(userId: string, dto: CreateDisputeDto) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    let order: Order | undefined;
    if (dto.orderId) {
      const found = await this.orders.findOne({
        where: { id: dto.orderId, customerEmail: user.email },
      });
      order = found ?? undefined;
    }
    // Attribute to the order's first seller when we have one.
    const seller = order?.items?.[0]?.seller;

    return this.disputes.save(
      this.disputes.create({
        code: refCode('DSP'),
        order,
        seller,
        customerName: user.name,
        customerEmail: user.email,
        reason: dto.reason,
        detail: dto.detail,
        amountUsd: dto.amountUsd !== undefined ? round2(dto.amountUsd) : 0,
        status: DisputeStatus.OPEN,
      }),
    );
  }
}
