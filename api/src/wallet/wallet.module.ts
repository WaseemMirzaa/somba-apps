import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User, WalletTransaction } from '../database/entities';
import { WalletService } from './wallet.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, WalletTransaction])],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
