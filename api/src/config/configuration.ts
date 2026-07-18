/**
 * Central env configuration. Values come from `.env` (see `.env.example`).
 * Nothing secret is hard-coded — dev defaults exist only so the app boots
 * locally without a `.env`, and are NOT safe for production.
 */
export interface AppConfig {
  port: number;
  corsOrigins: string[];
  jwt: {
    secret: string;
    accessTtl: string;
    refreshSecret: string;
    refreshTtl: string;
  };
  /** 32-byte hex key (64 hex chars) used for AES-256-GCM field encryption. */
  dataEncryptionKey: string;
  db: {
    type: 'sqlite' | 'mysql';
    // sqlite
    database: string;
    // mysql
    host: string;
    dbPort: number;
    username: string;
    password: string;
    mysqlDatabase: string;
    synchronize: boolean;
  };
}

function origins(raw?: string): string[] {
  if (!raw) return ['http://localhost:3000', 'http://localhost:3001'];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export default (): AppConfig => ({
  port: parseInt(process.env.PORT ?? '3001', 10),
  corsOrigins: origins(process.env.CORS_ORIGINS),
  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-insecure-jwt-secret-change-me',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshSecret:
      process.env.JWT_REFRESH_SECRET ?? 'dev-insecure-refresh-secret-change-me',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
  },
  // 64 hex chars = 32 bytes. Dev default is deterministic on purpose so the
  // app boots; override in `.env` with `openssl rand -hex 32`.
  dataEncryptionKey:
    process.env.DATA_ENCRYPTION_KEY ??
    '0000000000000000000000000000000000000000000000000000000000000000',
  db: {
    type: (process.env.DB_TYPE as 'sqlite' | 'mysql') ?? 'sqlite',
    database: process.env.DB_SQLITE_FILE ?? 'somba.dev.sqlite',
    host: process.env.DB_HOST ?? 'localhost',
    dbPort: parseInt(process.env.DB_PORT ?? '3306', 10),
    username: process.env.DB_USERNAME ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    mysqlDatabase: process.env.DB_DATABASE ?? 'somba',
    // Auto-sync schema in dev; in prod use migrations instead.
    synchronize: (process.env.DB_SYNCHRONIZE ?? 'true') === 'true',
  },
});
