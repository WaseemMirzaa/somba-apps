import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Dispute } from '../entities/dispute.entity';
import { DisputeStatus } from '../common/enums';
import { AuthUser } from '../common/decorators';
import { round2 } from '../common/util';
import { AuditService } from './audit.service';
import { ResolveDisputeDto } from './dto';

@Injectable()
export class DisputesService {
  constructor(
    @InjectRepository(Dispute) private readonly disputes: Repository<Dispute>,
    private readonly audit: AuditService,
  ) {}

  list(opts: { status?: DisputeStatus }) {
    const qb = this.disputes.createQueryBuilder('d').orderBy('d.createdAt', 'DESC');
    if (opts.status) qb.andWhere('d.status = :status', { status: opts.status });
    return qb.getMany();
  }

  async get(id: string) {
    const dispute = await this.disputes.findOne({ where: { id } });
    if (!dispute) throw new NotFoundException('Dispute not found');
    return dispute;
  }

  async resolve(id: string, dto: ResolveDisputeDto, user: AuthUser) {
    const dispute = await this.get(id);
    dispute.status = DisputeStatus.RESOLVED;
    dispute.resolution = dto.resolution;
    if (dto.amountUsd !== undefined) dispute.amountUsd = round2(dto.amountUsd);
    const saved = await this.disputes.save(dispute);
    await this.audit.log(user, 'dispute.resolve', 'Dispute', id, dto.resolution);
    return saved;
  }

  async reject(id: string, reason: string, user: AuthUser) {
    const dispute = await this.get(id);
    dispute.status = DisputeStatus.REJECTED;
    dispute.resolution = reason;
    const saved = await this.disputes.save(dispute);
    await this.audit.log(user, 'dispute.reject', 'Dispute', id, reason);
    return saved;
  }
}
