import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
} from 'fs';
import { join } from 'path';
import { sha256 } from './demo-common';

export interface ManifestImage {
  file: string;
  uuid: string;
  kind: string;
  bytes: number;
  sha256: string;
  credit: Record<string, string>;
}

/** `deploy/demo/images` from the repository root (works from `src` under ts-node and from `dist`). */
export const IMAGES_DIR =
  process.env.DEMO_IMAGES_DIR ??
  join(__dirname, '..', '..', '..', '..', 'deploy', 'demo', 'images');

export function loadManifest(dir = IMAGES_DIR): ManifestImage[] {
  const path = join(dir, 'manifest.json');
  if (!existsSync(path))
    throw new Error(`The picture manifest is missing: ${path}`);
  return (JSON.parse(readFileSync(path, 'utf8')) as { images: ManifestImage[] })
    .images;
}

/**
 * Where the pictures live on this server and the address the apps use for them: exactly what `POST /api/v1/uploads`
 * answers (`<PUBLIC_API_URL>/uploads/<uuid>.<ext>`), so the apps read a seeded picture like any uploaded one.
 */
export function uploadTarget(): { dir: string; base: string } {
  const base = (process.env.PUBLIC_API_URL ?? '').replace(/\/$/, '');
  if (!base)
    throw new Error(
      'PUBLIC_API_URL is not set (it is in api/.env on a server): the pictures need the address the apps load them from.',
    );
  return {
    dir: process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads'),
    base,
  };
}

export class DemoImages {
  private readonly byFile: Map<string, ManifestImage>;
  readonly base: string;
  readonly dir: string;

  constructor(
    readonly manifest = loadManifest(),
    target = uploadTarget(),
    private readonly sourceDir = IMAGES_DIR,
  ) {
    this.byFile = new Map(manifest.map((m) => [m.file, m]));
    this.base = target.base;
    this.dir = target.dir;
  }

  private entry(file: string): ManifestImage {
    const e = this.byFile.get(file);
    if (!e) throw new Error(`Picture ${file} is not in the manifest.`);
    return e;
  }

  /** The address of a picture (also the value stored in `products.images`, `sellers.logoUrl`, a review's photos...). */
  url(file: string): string {
    return `${this.base}/uploads/${this.entry(file).uuid}.jpg`;
  }

  /** The files of a product, cover first. */
  productFiles(sku: string, count: number): string[] {
    return Array.from({ length: count }, (_, i) => `${sku}-${i + 1}.jpg`);
  }

  productUrls(sku: string, count: number): string[] {
    return this.productFiles(sku, count).map((f) => this.url(f));
  }

  /** Copy every picture to `<UPLOAD_DIR>/<uuid>.jpg`. A file already there with the same content is left alone. Returns how many were written. */
  install(): { written: number; present: number } {
    mkdirSync(this.dir, { recursive: true });
    let written = 0;
    let present = 0;
    for (const m of this.manifest) {
      const src = join(this.sourceDir, m.file);
      if (!existsSync(src))
        throw new Error(`Picture file missing from the repository: ${src}`);
      const bytes = readFileSync(src);
      if (sha256(bytes) !== m.sha256)
        throw new Error(
          `Picture ${m.file} does not match its manifest checksum (was it edited? run build-assets.py).`,
        );
      const dst = join(this.dir, `${m.uuid}.jpg`);
      if (existsSync(dst) && sha256(readFileSync(dst)) === m.sha256) {
        present++;
        continue;
      }
      copyFileSync(src, dst);
      written++;
    }
    return { written, present };
  }
}

/** Remove the demo's picture files from an uploads folder. Only the fixed names of the manifest are touched. */
export function removeImageFiles(
  dir: string,
  manifest = loadManifest(),
): { removed: number; count: number } {
  let removed = 0;
  for (const m of manifest) {
    const p = join(dir, `${m.uuid}.jpg`);
    if (existsSync(p)) {
      unlinkSync(p);
      removed++;
    }
  }
  return { removed, count: manifest.length };
}

/** The uuid-named files of the manifest (for the removal count and for tests). */
export const manifestNames = (manifest = loadManifest()) =>
  manifest.map((m) => `${m.uuid}.jpg`);
