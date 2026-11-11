import type { INestApplicationContext } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { GeoArea, Hub, Product, Seller, User } from '../entities';
import type { DemoImages } from './demo-images';

/** What every part of the seed shares. Maps are keyed by the account key (`customer.full`), the store letter (`A`) and the SKU. */
export interface DemoCtx {
  app: INestApplicationContext;
  ds: DataSource;
  images: DemoImages;
  mainHub: Hub;
  demoHub: Hub;
  users: Map<string, User>;
  stores: Map<string, Seller>;
  products: Map<string, Product>;
  created: { created: number; existing: number };
  /** `expressDeliveryEnabled` is on (the demo switches it only with `--with-express`). Express orders are made only then. */
  expressOn: boolean;
  area: (code: string) => Promise<GeoArea>;
}
