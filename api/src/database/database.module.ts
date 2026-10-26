import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ENTITIES } from './entities';
import { MYSQL_UTC_OPTIONS } from './mysql-utc';
import { serializeSqliteTransactions } from './sqlite-transactions';

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
      // SQLite has one shared connection: let transactions queue instead of colliding (no-op on MySQL).
      dataSourceFactory: async (options) => serializeSqliteTransactions(new DataSource(options!)),
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

        // In production, apply pending migrations on boot (safe) instead of
        // auto-syncing the schema (destructive). Toggle with DB_MIGRATIONS_RUN.
        const migrations = [__dirname + '/migrations/*.{ts,js}'];
        const migrationsRun =
          (process.env.DB_MIGRATIONS_RUN ??
            (process.env.NODE_ENV === 'production' ? 'true' : 'false')) ===
          'true';

        if (db.type === 'mysql') {
          return {
            type: 'mysql',
            host: db.host,
            port: db.dbPort,
            username: db.username,
            password: db.password,
            database: db.mysqlDatabase,
            entities: ENTITIES,
            migrations,
            migrationsRun,
            synchronize: db.synchronize,
            charset: 'utf8mb4',
            ...MYSQL_UTC_OPTIONS,
          };
        }
        return {
          type: 'better-sqlite3',
          database: db.database,
          entities: ENTITIES,
          migrations,
          migrationsRun,
          synchronize: db.synchronize,
        };
      },
    }),
    TypeOrmModule.forFeature(ENTITIES),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
