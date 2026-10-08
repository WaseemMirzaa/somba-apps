import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import { ENTITIES } from './entities';

/**
 * Standalone TypeORM DataSource for the migration CLI (separate from the Nest
 * runtime wiring). Production uses migrations instead of `synchronize`:
 *
 *   npm run migration:generate -- src/database/migrations/Init   # first time
 *   npm run migration:run                                        # apply
 *   npm run migration:revert                                     # roll back
 *
 * Reads the same env as the app. Point it at the real (MySQL) prod database so
 * generated migrations use the production dialect.
 */
const type = (process.env.DB_TYPE as 'sqlite' | 'mysql') ?? 'sqlite';

const options: DataSourceOptions =
  type === 'mysql'
    ? {
        type: 'mysql',
        host: process.env.DB_HOST ?? 'localhost',
        port: parseInt(process.env.DB_PORT ?? '3306', 10),
        username: process.env.DB_USERNAME ?? 'root',
        password: process.env.DB_PASSWORD ?? '',
        database: process.env.DB_DATABASE ?? 'somba',
        charset: 'utf8mb4',
        entities: ENTITIES,
        migrations: [__dirname + '/migrations/*.{ts,js}'],
        synchronize: false,
      }
    : {
        type: 'better-sqlite3',
        database: process.env.DB_SQLITE_FILE ?? 'somba.dev.sqlite',
        entities: ENTITIES,
        migrations: [__dirname + '/migrations/*.{ts,js}'],
        synchronize: false,
      };

// The TypeORM CLI requires exactly ONE exported DataSource instance.
export default new DataSource(options);
