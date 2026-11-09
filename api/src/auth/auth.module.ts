import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog, RefreshToken, Setting, User, VerificationToken } from '../database/entities';
import { StaffTwoFaPolicy } from './staff-twofa';
import { VerificationService } from './verification.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AccountDeletionService } from './account-deletion.service';
import { AuthService } from './auth.service';
import { TwoFaService } from './twofa.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { JwtStrategy } from './jwt.strategy';
import { SessionsService } from './sessions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([VerificationToken, Setting, User, RefreshToken, AuditLog]),
    UsersModule,
    NotificationsModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        signOptions: {
          expiresIn: config.get<string>('jwt.accessTtl') as unknown as number,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AccountDeletionService, JwtStrategy, VerificationService, TwoFaService, StaffTwoFaPolicy, SessionsService],
  exports: [AuthService, VerificationService, TwoFaService, StaffTwoFaPolicy, SessionsService],
})
export class AuthModule {}
