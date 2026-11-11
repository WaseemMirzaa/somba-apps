import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Loads `api/.env` into `process.env` before anything else is imported.
 *
 * Some modules read their folders from the environment at import time (`UPLOAD_DIR`, `PRIVATE_UPLOAD_DIR`). The Nest
 * config module loads `.env` later, so on a server where those variables are only in `.env` (pm2 does not pass them)
 * the API served `<cwd>/uploads` while the files lived in `UPLOAD_DIR`. Variables already set in the environment win.
 */
export function loadEnvFile(file: string, env: NodeJS.ProcessEnv = process.env): void {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    let value = line.slice(eq + 1).trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length >= 2) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '');
    if (env[key] === undefined) env[key] = value;
  }
}

loadEnvFile(join(process.cwd(), '.env'));
