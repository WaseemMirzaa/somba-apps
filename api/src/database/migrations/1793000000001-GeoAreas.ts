import { MigrationInterface, QueryRunner } from 'typeorm';
import { randomUUID } from 'crypto';
import { decryptField } from '../../common/crypto/field-crypto';
import { parseShipping } from '../../geo/address-input';
import { AreaIndex } from '../../geo/area-index';
import { locate } from '../../geo/area-resolve';
import { SeedArea, buildAreaRows, loadDrc, loadGoogleNames } from '../../geo/geo-data';
import type { GeoArea } from '../entities/geo-area.entity';

/**
 * Warehouses by area (docs/WAREHOUSE-AREAS-USE-CASE.md, docs/contracts/areas.md):
 *  - `geo_areas`: the DRC geography (26 provinces, 38 cities, Kinshasa's 4 districts and 24 communes) from
 *    `src/database/geo/drc.json` + Google's spellings from `google-names.json`;
 *  - `hub_coverage`: which warehouse covers which area (one owner per area);
 *  - `hubs.areaId`, `addresses.areaId`, `sellers.pickupAreaId`, `orders.destinationAreaId`.
 *
 * Data: existing warehouses get the area of their city (and the commune their pin falls in); addresses, stores and old
 * orders are matched by their commune / city text, then their pin (nearest commune centroid inside the matched city), and
 * their text columns are rewritten with Google's spellings; every warehouse that has no coverage covers its city area when
 * no other warehouse owns it; stores get the warehouse covering their pickup area as `originHubId`.
 * Nothing in progress changes: orders keep their recorded warehouses. Fully reversible (the data this adds goes with the
 * tables and columns).
 */
export class GeoAreas1793000000001 implements MigrationInterface {
  name = 'GeoAreas1793000000001';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE \`geo_areas\` (\`id\` varchar(36) NOT NULL, \`code\` varchar(64) NOT NULL, \`level\` varchar(12) NOT NULL, \`name\` varchar(150) NOT NULL, \`nameEn\` varchar(150) NULL, \`googleName\` varchar(150) NOT NULL, \`googleNameEn\` varchar(150) NOT NULL, \`aliases\` text NULL, \`parentId\` varchar(36) NULL, \`path\` varchar(255) NOT NULL, \`depth\` int NOT NULL DEFAULT '0', \`lat\` double NULL, \`lng\` double NULL, \`active\` tinyint NOT NULL DEFAULT 1, \`meta\` text NULL, \`sortOrder\` int NOT NULL DEFAULT '0', \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_geo_areas_path\` (\`path\`), INDEX \`IDX_geo_areas_parentId\` (\`parentId\`), UNIQUE INDEX \`IDX_geo_areas_code\` (\`code\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await q.query(
      `CREATE TABLE \`hub_coverage\` (\`id\` varchar(36) NOT NULL, \`hubId\` varchar(36) NOT NULL, \`areaId\` varchar(36) NOT NULL, \`feeOverrideUsd\` float NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_hub_coverage_hubId\` (\`hubId\`), UNIQUE INDEX \`IDX_hub_coverage_areaId\` (\`areaId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await q.query(`ALTER TABLE \`sellers\` ADD \`pickupAreaId\` varchar(36) NULL`);
    await q.query(`ALTER TABLE \`orders\` ADD \`destinationAreaId\` varchar(36) NULL`);
    await q.query(`ALTER TABLE \`addresses\` ADD \`areaId\` varchar(36) NULL`);
    await q.query(`ALTER TABLE \`hubs\` ADD \`areaId\` varchar(36) NULL`);
    await q.query(`CREATE INDEX \`IDX_sellers_pickupAreaId\` ON \`sellers\` (\`pickupAreaId\`)`);
    await q.query(`CREATE INDEX \`IDX_orders_destinationAreaId\` ON \`orders\` (\`destinationAreaId\`)`);
    await q.query(`CREATE INDEX \`IDX_addresses_areaId\` ON \`addresses\` (\`areaId\`)`);
    await q.query(`CREATE INDEX \`IDX_hubs_areaId\` ON \`hubs\` (\`areaId\`)`);

    // ── the geography ──────────────────────────────────────────────────────────
    const rows = buildAreaRows(loadDrc(), loadGoogleNames());
    for (let i = 0; i < rows.length; i += 40) {
      const chunk = rows.slice(i, i + 40);
      await q.query(
        `INSERT INTO \`geo_areas\` (\`id\`, \`code\`, \`level\`, \`name\`, \`nameEn\`, \`googleName\`, \`googleNameEn\`, \`aliases\`, \`parentId\`, \`path\`, \`depth\`, \`lat\`, \`lng\`, \`active\`, \`meta\`, \`sortOrder\`) VALUES ${chunk.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)').join(',')}`,
        chunk.flatMap((r) => [r.id, r.code, r.level, r.name, r.nameEn, r.googleName, r.googleNameEn, JSON.stringify(r.aliases), r.parentId, r.path, r.depth, r.lat, r.lng, r.meta ? JSON.stringify(r.meta) : null, r.sortOrder]),
      );
    }
    const ix = new AreaIndex(rows.map((r) => ({ ...r, active: true }) as unknown as GeoArea));

    // ── warehouses: the area of their city (the commune under their pin when there is one) ────────
    const hubs: { id: string; name: string; city: string | null; address: string | null; lat: number | null; lng: number | null; active: number }[] = await q.query(
      `SELECT \`id\`, \`name\`, \`city\`, \`address\`, \`lat\`, \`lng\`, \`active\` FROM \`hubs\` ORDER BY \`active\` DESC, \`name\` ASC`,
    );
    const hubArea = new Map<string, string>();
    for (const h of hubs) {
      const area = locate(ix, { text: { city: h.city }, free: [h.address, h.city].filter(Boolean).join(', '), pin: h.lat !== null && h.lng !== null ? { lat: h.lat, lng: h.lng } : null });
      if (area) {
        hubArea.set(h.id, area.id);
        await q.query(`UPDATE \`hubs\` SET \`areaId\` = ? WHERE \`id\` = ?`, [area.id, h.id]);
      }
    }

    // ── stores: the area of their pickup address / pin ────────────────────────────────────────────
    const sellerArea = new Map<string, string>();
    const sellers: { id: string; pickupAddress: string | null; pickupLat: number | null; pickupLng: number | null }[] = await q.query(
      `SELECT \`id\`, \`pickupAddress\`, \`pickupLat\`, \`pickupLng\` FROM \`sellers\``,
    );
    for (const s of sellers) {
      const area = locate(ix, { free: decryptField(s.pickupAddress), pin: s.pickupLat !== null && s.pickupLng !== null ? { lat: s.pickupLat, lng: s.pickupLng } : null });
      if (area) {
        sellerArea.set(s.id, area.id);
        await q.query(`UPDATE \`sellers\` SET \`pickupAreaId\` = ? WHERE \`id\` = ?`, [area.id, s.id]);
      }
    }

    // ── customers' addresses: by commune / city text, then by pin; text rewritten with Google's spellings ──
    const names = (areaId: string) => {
      const chain = ix.chain(areaId);
      const at = (level: string) => chain.find((a) => a.level === level)?.googleName ?? null;
      return { commune: at('commune'), city: at('city'), region: at('province'), country: at('country') };
    };
    let lastId = '';
    for (;;) {
      const batch: { id: string; city: string | null; commune: string | null; region: string | null; geo: string | null }[] = await q.query(
        `SELECT \`id\`, \`city\`, \`commune\`, \`region\`, \`geo\` FROM \`addresses\` WHERE \`id\` > ? ORDER BY \`id\` ASC LIMIT 500`,
        [lastId],
      );
      if (!batch.length) break;
      for (const a of batch) {
        lastId = a.id;
        let pin: { lat: number; lng: number } | null = null;
        try {
          const g = JSON.parse(decryptField(a.geo) ?? 'null');
          if (g && Number.isFinite(g.lat) && Number.isFinite(g.lng)) pin = { lat: g.lat, lng: g.lng };
        } catch {
          pin = null;
        }
        const area = locate(ix, { text: { commune: a.commune, city: a.city, province: a.region }, pin });
        if (!area) continue;
        const n = names(area.id);
        await q.query(`UPDATE \`addresses\` SET \`areaId\` = ?, \`commune\` = COALESCE(?, \`commune\`), \`city\` = COALESCE(?, \`city\`), \`region\` = COALESCE(?, \`region\`), \`country\` = COALESCE(?, \`country\`) WHERE \`id\` = ?`, [area.id, n.commune, n.city, n.region, n.country, a.id]);
      }
    }

    // ── recent orders: the area they were delivered to (history, analytics) ───────────────────────────
    lastId = '';
    let seen = 0;
    while (seen < 20000) {
      const batch: { id: string; shippingAddress: string | null }[] = await q.query(
        `SELECT \`id\`, \`shippingAddress\` FROM \`orders\` WHERE \`id\` > ? AND \`destinationAreaId\` IS NULL ORDER BY \`id\` ASC LIMIT 500`,
        [lastId],
      );
      if (!batch.length) break;
      for (const o of batch) {
        lastId = o.id;
        seen++;
        const f = parseShipping(decryptField(o.shippingAddress));
        const area = locate(ix, { text: { commune: f.commune, city: f.city, province: f.region }, pin: f.point });
        if (area) await q.query(`UPDATE \`orders\` SET \`destinationAreaId\` = ? WHERE \`id\` = ?`, [area.id, o.id]);
      }
    }

    // ── coverage: a warehouse with none covers its city, unless another warehouse owns it ─────────────
    const owned = new Set<string>();
    const covered = new Map<string, string>(); // areaId -> hubId (active hubs only)
    for (const h of hubs) {
      const areaId = hubArea.get(h.id);
      if (!areaId) continue;
      const city = ix.ancestorAt(areaId, 'city') ?? ix.get(areaId);
      if (!city || owned.has(city.id)) continue;
      owned.add(city.id);
      await q.query(`INSERT INTO \`hub_coverage\` (\`id\`, \`hubId\`, \`areaId\`) VALUES (?, ?, ?)`, [randomUUID(), h.id, city.id]);
      if (h.active) covered.set(city.id, h.id);
    }

    // ── stores: the warehouse that covers the pickup area ────────────────────────────────────────────
    for (const s of sellers) {
      const areaId = sellerArea.get(s.id);
      let origin: string | null = null;
      if (areaId) {
        const chain = ix.chain(areaId);
        for (let i = chain.length - 1; i >= 0 && !origin; i--) origin = covered.get(chain[i].id) ?? null;
      }
      await q.query(`UPDATE \`sellers\` SET \`originHubId\` = ? WHERE \`id\` = ?`, [origin, s.id]);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX \`IDX_hubs_areaId\` ON \`hubs\``);
    await q.query(`DROP INDEX \`IDX_addresses_areaId\` ON \`addresses\``);
    await q.query(`DROP INDEX \`IDX_orders_destinationAreaId\` ON \`orders\``);
    await q.query(`DROP INDEX \`IDX_sellers_pickupAreaId\` ON \`sellers\``);
    await q.query(`ALTER TABLE \`hubs\` DROP COLUMN \`areaId\``);
    await q.query(`ALTER TABLE \`addresses\` DROP COLUMN \`areaId\``);
    await q.query(`ALTER TABLE \`orders\` DROP COLUMN \`destinationAreaId\``);
    await q.query(`ALTER TABLE \`sellers\` DROP COLUMN \`pickupAreaId\``);
    await q.query(`DROP INDEX \`IDX_hub_coverage_areaId\` ON \`hub_coverage\``);
    await q.query(`DROP INDEX \`IDX_hub_coverage_hubId\` ON \`hub_coverage\``);
    await q.query(`DROP TABLE \`hub_coverage\``);
    await q.query(`DROP INDEX \`IDX_geo_areas_code\` ON \`geo_areas\``);
    await q.query(`DROP INDEX \`IDX_geo_areas_parentId\` ON \`geo_areas\``);
    await q.query(`DROP INDEX \`IDX_geo_areas_path\` ON \`geo_areas\``);
    await q.query(`DROP TABLE \`geo_areas\``);
  }
}
