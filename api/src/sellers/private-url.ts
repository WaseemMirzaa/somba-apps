const PRIVATE_PATH = /^\/api\/v1\/private-uploads\/([0-9a-f-]{36})$/;

/** The id inside a private-file URL (`…/api/v1/private-uploads/<id>`), or null for anything else. */
export function privateIdOf(url: string): string | null {
  try {
    return PRIVATE_PATH.exec(new URL(url, 'http://x').pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}
