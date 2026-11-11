import { DataSource } from 'typeorm';
import { SellerTeamMember, User } from '../entities';
import { UsersService } from '../../users/users.service';
import { currentDemoEmail, isDemoEmail, DEMO_DOMAIN } from './demo-common';

/**
 * Before the rename to KOMORIKO the demo accounts lived on `@demo.sombateka.test`. A server that was already seeded
 * keeps ONE set of accounts: at the start of `seed:demo` every such user (and every pending team invitation) is moved
 * to `@demo.komoriko.test`, local part unchanged, so the seed finds them and does not add a second copy.
 *
 * The address is encrypted at rest and `emailHash` is a sha256 of it, so this cannot be one raw SQL UPDATE: each row is
 * updated through the repository (which encrypts) in one transaction. It works the same on MySQL and SQLite.
 * An account whose new address is already taken is left as it is and reported.
 */
export async function renameLegacyDemoEmails(
  ds: DataSource,
): Promise<{ renamed: number; invitations: number; skipped: string[] }> {
  const skipped: string[] = [];
  let renamed = 0;
  let invitations = 0;
  await ds.transaction(async (m) => {
    const users = (
      await m.getRepository(User).find({ select: { id: true, email: true } })
    ).filter((u) => isDemoEmail(u.email) && !u.email.toLowerCase().endsWith(`@${DEMO_DOMAIN}`));
    const taken = new Set(
      (await m.getRepository(User).find({ select: { id: true, emailHash: true } })).map(
        (u) => u.emailHash,
      ),
    );
    for (const u of users) {
      const email = currentDemoEmail(u.email);
      const emailHash = UsersService.emailHash(email);
      if (taken.has(emailHash)) {
        skipped.push(u.email);
        continue;
      }
      await m.getRepository(User).update({ id: u.id }, { email, emailHash });
      taken.add(emailHash);
      renamed++;
    }
    const team = (
      await m.getRepository(SellerTeamMember).find({ select: { id: true, sellerId: true, email: true } })
    ).filter((t) => isDemoEmail(t.email) && !t.email.toLowerCase().endsWith(`@${DEMO_DOMAIN}`));
    for (const t of team) {
      const email = currentDemoEmail(t.email);
      const dup = await m
        .getRepository(SellerTeamMember)
        .count({ where: { sellerId: t.sellerId, emailHash: UsersService.emailHash(email) } });
      if (dup) continue;
      await m
        .getRepository(SellerTeamMember)
        .update({ id: t.id }, { email, emailHash: UsersService.emailHash(email) });
      invitations++;
    }
  });
  return { renamed, invitations, skipped };
}
