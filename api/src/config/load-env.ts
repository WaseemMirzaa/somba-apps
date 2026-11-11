import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Loads `api/.env` into `process.env` before anything else is imported.
 *
 * Some modules read their folders from the environment at import time (`UPLOAD_DIR`, `PRIVATE_UPLOAD_DIR`). The Nest
 * config module loads `.env` later, so on a server where those variables are only in `.env` (pm2 does not pass them)
 * the API served `<cwd>/uploads` while the files lived in `UPLOAD_DIR`. Variables already set in the environment win.
 */
const file = join(process.cwd(), '.env');
if (existsSync(file) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(file);
}
