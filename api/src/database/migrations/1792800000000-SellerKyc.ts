import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seller KYC + moderation decision reasons: legal name, phone / ID number (encrypted
 * at rest, hence `text`), RCCM, tax number, uploaded documents (JSON array), terms /
 * submission timestamps, the reason of the last moderation decision, and the listings a
 * suspension moved to draft (restored on reinstatement). Every column is nullable, so
 * stores opened before KYC existed stay valid. Fully reversible.
 */
const COLUMNS: [string, string][] = [
  ['legalName', 'varchar(150) NULL'],
  ['phone', 'text NULL'],
  ['idNumber', 'text NULL'],
  ['rccm', 'varchar(60) NULL'],
  ['taxNumber', 'varchar(60) NULL'],
  ['documentUrls', 'text NULL'],
  ['termsAcceptedAt', 'datetime NULL'],
  ['kycSubmittedAt', 'datetime NULL'],
  ['statusReason', 'varchar(500) NULL'],
  ['statusChangedAt', 'datetime NULL'],
  ['suspendedListingIds', 'text NULL'],
];

export class SellerKyc1792800000000 implements MigrationInterface {
  name = 'SellerKyc1792800000000';

  public async up(q: QueryRunner): Promise<void> {
    for (const [col, ddl] of COLUMNS) {
      await q.query(`ALTER TABLE \`sellers\` ADD \`${col}\` ${ddl}`);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const [col] of [...COLUMNS].reverse()) {
      await q.query(`ALTER TABLE \`sellers\` DROP COLUMN \`${col}\``);
    }
  }
}
