/* eslint-disable no-console */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { User } from './entities';
import { UsersService } from '../users/users.service';

/**
 * Manage the admin account(s) on a live database — SAFE to run on production, read commands change nothing.
 * Unlike `bootstrap-prod.ts` (creates the first admin only if none exists), this touches an EXISTING admin
 * row: list them, change one's email, or remove one so `bootstrap:prod` can create a fresh replacement.
 *
 *   node dist/database/manage-admin.js list
 *   node dist/database/manage-admin.js update-email CURRENT@old.com NEW@new.com
 *   node dist/database/manage-admin.js remove ADMIN@email.com            (dry run: shows who would be removed)
 *   node dist/database/manage-admin.js remove ADMIN@email.com --yes      (actually removes)
 *
 * After `remove`, run bootstrap:prod again with a new ADMIN_EMAIL/ADMIN_PASSWORD to create a fresh admin.
 * This never touches a non-admin account, even if you pass its email by mistake.
 */
async function run() {
  const [cmd, a, b] = process.argv.slice(2);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const ds = app.get(DataSource);
  const users = ds.getRepository(User);

  const findAdminByEmail = async (email: string) => {
    const hash = UsersService.emailHash(email);
    const u = await users.findOne({ where: { emailHash: hash } });
    if (!u) throw new Error(`No account with that email.`);
    if (u.role !== 'admin') throw new Error(`That account is role "${u.role}", not admin — refusing to touch it.`);
    return u;
  };

  try {
    switch (cmd) {
      case 'list': {
        const admins = await users.find({ where: { role: 'admin' } });
        if (admins.length === 0) { console.log('No admin accounts exist.'); break; }
        for (const u of admins) console.log(`${u.email}  ·  ${u.name}  ·  id ${u.id}  ·  created ${u.createdAt?.toISOString?.() ?? ''}`);
        break;
      }
      case 'update-email': {
        const currentEmail = a?.trim().toLowerCase();
        const newEmail = b?.trim().toLowerCase();
        if (!currentEmail || !newEmail) throw new Error('usage: update-email CURRENT@old.com NEW@new.com');
        const admin = await findAdminByEmail(currentEmail);
        const newHash = UsersService.emailHash(newEmail);
        const clash = await users.findOne({ where: { emailHash: newHash } });
        if (clash) throw new Error(`${newEmail} is already used by another account.`);
        admin.email = newEmail;
        admin.emailHash = newHash;
        await users.save(admin);
        console.log(`✓ ${currentEmail} → ${newEmail} (admin "${admin.name}", id ${admin.id})`);
        break;
      }
      case 'remove': {
        const email = a?.trim().toLowerCase();
        const confirmed = process.argv.includes('--yes');
        if (!email) throw new Error('usage: remove ADMIN@email.com [--yes]');
        const admin = await findAdminByEmail(email);
        if (!confirmed) {
          console.log(`Dry run — would remove admin "${admin.name}" <${admin.email}> (id ${admin.id}).`);
          console.log(`Re-run with --yes to actually remove it. Afterwards, run bootstrap:prod with a new ADMIN_EMAIL/ADMIN_PASSWORD to create a replacement.`);
          break;
        }
        await users.remove(admin);
        console.log(`✓ removed admin "${admin.name}" <${email}>.`);
        console.log(`Run bootstrap:prod with a new ADMIN_EMAIL and ADMIN_PASSWORD to create a replacement.`);
        break;
      }
      default:
        console.log('usage: manage-admin.js <list | update-email CURRENT NEW | remove EMAIL [--yes]>');
        process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

run().catch((e) => {
  console.error('manage-admin failed:', (e as Error).message);
  process.exit(1);
});
