export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(private max: number, private windowMs: number) {}

  check(key: string): RateLimitResult {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    const history = this.hits.get(key) || [];
    const recent = history.filter((ts) => ts > cutoff);

    if (recent.length >= this.max) {
      const retryAfterMs = recent[0] - cutoff;
      this.hits.set(key, recent);
      return { allowed: false, retryAfterMs };
    }

    recent.push(now);
    this.hits.set(key, recent);
    return { allowed: true };
  }
}
