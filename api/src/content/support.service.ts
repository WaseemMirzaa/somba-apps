import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupportTicket } from '../database/entities';
import type { TicketStatus } from '../database/entities';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import {
  ADMIN_ROLES,
  NotificationsService,
} from '../notifications/notifications.service';

interface Msg {
  from: string;
  role: string;
  text: string;
  at: string;
}

@Injectable()
export class SupportService {
  constructor(
    @InjectRepository(SupportTicket)
    private readonly tickets: Repository<SupportTicket>,
    private readonly notifications: NotificationsService,
    private readonly emitter: RealtimeEmitter,
  ) {}

  list(user: { id: string; role: string }): Promise<SupportTicket[]> {
    // Only admins see everyone's tickets; every other role sees its own.
    if (!user.role.startsWith('admin')) {
      return this.tickets.find({
        where: { userId: user.id },
        order: { updatedAt: 'DESC' },
      });
    }
    return this.tickets.find({ order: { updatedAt: 'DESC' }, take: 200 });
  }

  get(id: string): Promise<SupportTicket | null> {
    return this.tickets.findOne({ where: { id } });
  }

  async open(
    user: { id: string; name: string },
    input: { subject: string; category?: string; message: string; orderId?: string },
  ): Promise<SupportTicket> {
    if (!input?.subject?.trim() || !input?.message?.trim()) {
      throw new BadRequestException('Subject and message are required.');
    }
    input = { ...input, subject: input.subject.trim().slice(0, 200), message: input.message.trim().slice(0, 4000) };
    const msg: Msg = {
      from: user.name,
      role: 'customer',
      text: input.message,
      at: new Date().toISOString(),
    };
    const ticket = await this.tickets.save(
      this.tickets.create({
        reference: `TKT-${Date.now().toString().slice(-8)}`,
        userId: user.id,
        userName: user.name,
        subject: input.subject,
        category: input.category ?? 'general',
        orderId: input.orderId ?? null,
        status: 'open',
        messages: JSON.stringify([msg]),
      }),
    );
    this.emitter.toUser(user.id, 'support:updated', ticket);
    this.emitter.toRole('admin_support', 'support:updated', ticket);
    await this.notifications.toRole('admin_support', {
      title: 'New support ticket',
      body: `${ticket.reference} · ${input.subject}`,
      type: 'support',
      entityId: ticket.id,
    });
    return ticket;
  }

  async reply(
    id: string,
    from: { id: string; name: string; role: string },
    text: string,
  ): Promise<SupportTicket> {
    const ticket = await this.tickets.findOne({ where: { id } });
    // Same answer for "missing" and "not yours" so ids can't be probed.
    if (!ticket || (!from.role.startsWith('admin') && ticket.userId !== from.id)) {
      throw new NotFoundException('Ticket not found.');
    }
    if (!text?.trim()) throw new BadRequestException('Write a message first.');
    text = text.trim().slice(0, 4000);
    const msgs: Msg[] = JSON.parse(ticket.messages || '[]');
    msgs.push({ from: from.name, role: from.role, text, at: new Date().toISOString() });
    ticket.messages = JSON.stringify(msgs);
    ticket.status = from.role.startsWith('admin') ? 'pending' : 'open';
    const saved = await this.tickets.save(ticket);
    this.emitter.toUser(saved.userId, 'support:updated', saved);
    this.emitter.toRoles(ADMIN_ROLES, 'support:updated', saved);
    if (from.role.startsWith('admin')) {
      await this.notifications.toUser(saved.userId, {
        title: 'Support reply',
        body: `${saved.reference}: ${text.slice(0, 60)}`,
        type: 'support',
        entityId: saved.id,
      });
    }
    return saved;
  }

  async setStatus(id: string, status: TicketStatus): Promise<SupportTicket> {
    const ticket = await this.tickets.findOne({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found.');
    ticket.status = status;
    const saved = await this.tickets.save(ticket);
    this.emitter.toUser(saved.userId, 'support:updated', saved);
    this.emitter.toRoles(ADMIN_ROLES, 'support:updated', saved);
    return saved;
  }
}
