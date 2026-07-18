import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { User, UserRole } from '../database/entities';

/** Public-safe projection of a user (never leaks the password hash). */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone: string | null;
  locale: 'en' | 'fr';
  walletBalance: number;
  active: boolean;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
  ) {}

  /** Deterministic lookup key so we can find users without decrypting emails. */
  static emailHash(email: string): string {
    return createHash('sha256')
      .update(email.trim().toLowerCase())
      .digest('hex');
  }

  findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({
      where: { emailHash: UsersService.emailHash(email) },
    });
  }

  async create(data: {
    email: string;
    passwordHash: string;
    name: string;
    role: UserRole;
    phone?: string | null;
    locale?: 'en' | 'fr';
  }): Promise<User> {
    const user = this.repo.create({
      email: data.email,
      emailHash: UsersService.emailHash(data.email),
      passwordHash: data.passwordHash,
      name: data.name,
      role: data.role,
      phone: data.phone ?? null,
      locale: data.locale ?? 'en',
    });
    return this.repo.save(user);
  }

  save(user: User): Promise<User> {
    return this.repo.save(user);
  }

  findByRole(role: UserRole): Promise<User[]> {
    return this.repo.find({ where: { role } });
  }

  static toPublic(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone,
      locale: user.locale,
      walletBalance: user.walletBalance,
      active: user.active,
    };
  }
}
