import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import {
  Address,
  Category,
  DeliveryTask,
  Dispute,
  Notification,
  Order,
  OrderItem,
  Payment,
  Payout,
  Product,
  Seller,
  User,
  WalletTransaction,
} from './entities';

const ENTITIES = [
  User,
  Seller,
  Product,
  Order,
  OrderItem,
  Notification,
  DeliveryTask,
  WalletTransaction,
  Payment,
  Payout,
  Dispute,
  Category,
  Address,
];

/**
 * TypeORM wiring. `DB_TYPE=sqlite` (default) runs anywhere with a local file;
 * `DB_TYPE=mysql` targets the production MySQL server from CONFIG.md. Both are
 * driven entirely by env — no code change to switch.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => {
        const db = config.get<{
          type: 'sqlite' | 'mysql';
          database: string;
          host: string;
          dbPort: number;
          username: string;
          password: string;
          mysqlDatabase: string;
          synchronize: boolean;
        }>('db')!;

        if (db.type === 'mysql') {
          return {
            type: 'mysql',
            host: db.host,
            port: db.dbPort,
            username: db.username,
            password: db.password,
            database: db.mysqlDatabase,
            entities: ENTITIES,
            synchronize: db.synchronize,
            charset: 'utf8mb4',
          };
        }
        return {
          type: 'better-sqlite3',
          database: db.database,
          entities: ENTITIES,
          synchronize: db.synchronize,
        };
      },
    }),
    TypeOrmModule.forFeature(ENTITIES),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
