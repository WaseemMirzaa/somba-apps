import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../entities/user.entity';
import { Seller } from '../entities/seller.entity';
import { SellerStatus, UserRole } from '../common/enums';
import { slugify } from '../common/util';
import { LoginDto, RegisterCustomerDto, RegisterSellerDto } from './dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    private readonly jwt: JwtService,
  ) {}

  private async sign(user: User): Promise<{ accessToken: string; user: object }> {
    const seller = await this.sellers.findOne({
      where: { user: { id: user.id } },
      relations: { user: true },
    });
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      sellerId: seller?.id,
    };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        sellerId: seller?.id,
      },
    };
  }

  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email: email.toLowerCase() })
      .getOne();
    if (!user || !user.active) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return user;
  }

  async login(dto: LoginDto) {
    const user = await this.validateUser(dto.email, dto.password);
    return this.sign(user);
  }

  async registerCustomer(dto: RegisterCustomerDto) {
    const email = dto.email.toLowerCase();
    const existing = await this.users.findOne({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');

    const user = await this.users.save(
      this.users.create({
        email,
        name: dto.name,
        phone: dto.phone,
        role: UserRole.CUSTOMER,
        passwordHash: await bcrypt.hash(dto.password, 10),
      }),
    );
    return this.sign(user);
  }

  async registerSeller(dto: RegisterSellerDto) {
    const email = dto.email.toLowerCase();
    const existing = await this.users.findOne({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');

    const user = await this.users.save(
      this.users.create({
        email,
        name: dto.name,
        phone: dto.phone,
        role: UserRole.SELLER,
        passwordHash: await bcrypt.hash(dto.password, 10),
      }),
    );

    let slug = slugify(dto.storeName);
    if (await this.sellers.findOne({ where: { slug } })) {
      slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
    }
    await this.sellers.save(
      this.sellers.create({
        user,
        storeName: dto.storeName,
        slug,
        phone: dto.phone,
        city: dto.city,
        status: SellerStatus.PENDING,
      }),
    );

    return this.sign(user);
  }

  async me(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const seller = await this.sellers.findOne({ where: { user: { id: userId } } });
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      sellerId: seller?.id,
      sellerStatus: seller?.status,
    };
  }
}
