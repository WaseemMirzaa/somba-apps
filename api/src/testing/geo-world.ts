import { DataSource } from 'typeorm';
import { GeoArea, Hub, HubCoverage, HubLane, Seller, User } from '../database/entities';
import { CoverageService } from '../geo/coverage.service';
import { GeoService } from '../geo/geo.service';
import { buildAreaRows, loadDrc, loadGoogleNames } from '../geo/geo-data';
import { LanesService } from '../logistics/lanes.service';
import { RoutingService } from '../logistics/routing.service';
import { SettingsService } from '../content/settings.service';

/**
 * Test support (jest only, not built): the real DRC geography on an in-memory database, with the geo, coverage, lanes and
 * routing services wired the way the app wires them.
 */
export async function geoWorld(ds: DataSource, opts: { emitter?: unknown; settings?: () => Record<string, string> } = {}) {
  const emitter = (opts.emitter ?? { toRoles: () => undefined, toUser: () => undefined, toHub: () => undefined, broadcast: () => undefined }) as never;
  const areas = ds.getRepository(GeoArea);
  const rows = buildAreaRows(loadDrc(), loadGoogleNames());
  for (let i = 0; i < rows.length; i += 50) await areas.insert(rows.slice(i, i + 50).map((r) => ({ ...r, active: true }) as never));

  const geo = new GeoService(areas, ds.getRepository(HubCoverage), ds.getRepository(Hub), ds.getRepository('Address') as never, ds.getRepository(Seller), ds.getRepository('Order') as never, emitter);
  const coverage = new CoverageService(ds.getRepository(Hub), ds.getRepository(HubCoverage), ds.getRepository(Seller), geo, emitter);
  const lanes = new LanesService(ds.getRepository(HubLane), ds.getRepository(Hub), emitter);
  const settingsSvc = { all: async () => (opts.settings ? opts.settings() : {}), get: async (k: string) => (opts.settings ? (opts.settings()[k] ?? null) : null) } as unknown as SettingsService;
  const routing = new RoutingService(ds.getRepository(Hub), ds.getRepository(User), ds.getRepository(Seller), settingsSvc, geo, lanes);

  /** An area by its code (`CD-KN-GOM`). */
  const area = async (code: string): Promise<GeoArea> => {
    const a = await geo.getByCode(code);
    if (!a) throw new Error(`no area ${code}`);
    return a;
  };
  return { geo, coverage, lanes, routing, area, settings: settingsSvc };
}
