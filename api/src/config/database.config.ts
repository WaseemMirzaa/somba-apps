import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { ALL_ENTITIES } from '../entities';

/** MySQL (TypeORM) options, env-driven. Uses schema sync in non-production. */
export function databaseConfig(config: ConfigService): TypeOrmModuleOptions {
  const isProd = config.get('NODE_ENV') === 'production';
  return {
    type: 'mysql',
    host: config.get<string>('DB_HOST', 'localhost'),
    port: parseInt(config.get<string>('DB_PORT', '3306'), 10),
    username: config.get<string>('DB_USERNAME', 'root'),
    password: config.get<string>('DB_PASSWORD', ''),
    database: config.get<string>('DB_DATABASE', 'somba'),
    entities: ALL_ENTITIES,
    synchronize: config.get('DB_SYNCHRONIZE', 'true') === 'true' && !isProd,
    charset: 'utf8mb4',
    timezone: 'Z',
    autoLoadEntities: true,
  };
}
