/**
 * A sliding window per key ("20 messages per minute per account"), in memory: a restart forgives, which is fine for
 * abuse control. Keys whose hits have all expired are dropped once the map grows large.
 */
export class RateWindow {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly spanMs: number,
  ) {}

  /** Records a hit and returns true, or returns false (recording nothing) when `key` is over the limit. */
  take(key: string, now = Date.now()): boolean {
    if (this.hits.size > 10_000) for (const [k, ts] of this.hits) if (!ts.some((t) => now - t < this.spanMs)) this.hits.delete(k);
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.spanMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}
