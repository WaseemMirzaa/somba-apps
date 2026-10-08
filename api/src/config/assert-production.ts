import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

/** Values that only exist so the app boots locally — never safe in production. */
const DEV_DEFAULTS = {
  jwtSecret: 'dev-insecure-jwt-secret-change-me',
  jwtRefreshSecret: 'dev-insecure-refresh-secret-change-me',
  dataEncryptionKey:
    '0000000000000000000000000000000000000000000000000000000000000000',
};

/**
 * Fail-fast in production: refuse to boot if any secret is missing or still set
 * to its insecure dev default. Prevents shipping forgeable JWTs or a worthless
 * (all-zero) encryption key. No-op outside production.
 */
export function assertProductionConfig(config: ConfigService): void {
  if ((process.env.NODE_ENV ?? 'development') !== 'production') return;

  const logger = new Logger('Config');
  const problems: string[] = [];

  const jwtSecret = config.get<string>('jwt.secret');
  const jwtRefresh = config.get<string>('jwt.refreshSecret');
  const encKey = config.get<string>('dataEncryptionKey');
  const dbType = config.get<string>('db.type');
  const synchronize = config.get<boolean>('db.synchronize');

  if (!jwtSecret || jwtSecret === DEV_DEFAULTS.jwtSecret) {
    problems.push('JWT_SECRET is missing or set to the insecure dev default.');
  }
  if (!jwtRefresh || jwtRefresh === DEV_DEFAULTS.jwtRefreshSecret) {
    problems.push(
      'JWT_REFRESH_SECRET is missing or set to the insecure dev default.',
    );
  }
  if (!encKey || encKey === DEV_DEFAULTS.dataEncryptionKey) {
    problems.push(
      'DATA_ENCRYPTION_KEY is missing or all-zero. Generate one: openssl rand -hex 32',
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(encKey ?? '')) {
    problems.push('DATA_ENCRYPTION_KEY must be 64 hex chars (32 bytes).');
  }
  if (dbType === 'sqlite') {
    problems.push(
      'DB_TYPE=sqlite is not supported in production. Set DB_TYPE=mysql.',
    );
  }
  if (synchronize) {
    problems.push(
      'DB_SYNCHRONIZE=true is unsafe in production (auto-alters schema). Use migrations.',
    );
  }

  if (problems.length) {
    for (const p of problems) logger.error(p);
    throw new Error(
      `Refusing to start: ${problems.length} insecure production config problem(s). ` +
        'Set the required secrets and disable schema auto-sync before deploying.',
    );
  }
  // Non-fatal: the app runs without these, but the features that need them don't.
  if (!process.env.SMTP_HOST) {
    logger.warn('SMTP_HOST not set — password-reset and email-verification emails will NOT be delivered.');
  }
  if (!process.env.TWILIO_ACCOUNT_SID) {
    logger.warn('TWILIO_* not set — phone OTP codes will NOT be delivered by SMS.');
  }
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    logger.warn('Firebase not configured — push notifications disabled (in-app realtime still works).');
  }
  logger.log('Production config validated ✓');
}
