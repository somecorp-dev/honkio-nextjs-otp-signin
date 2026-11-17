/**
 * A small fixed-window limiter kept in memory. It stops one visitor, or one
 * phone number, from getting code after code, which costs you a text each time.
 *
 * It lives in one server process, so on serverless hosting each instance
 * counts on its own. For production, back it with a shared store (Redis,
 * your database) or put a CAPTCHA on the form. HonkIO adds its own guards on
 * top: one code per number a minute, Canadian numbers only, and a pause on
 * live codes when traffic looks like SMS pumping.
 */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Counts one attempt for key. False when the key is over its limit. */
  take(key: string): boolean {
    const t = this.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= t) {
      this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
      this.prune(t);
      return true;
    }
    if (entry.count >= this.limit) return false;
    entry.count += 1;
    return true;
  }

  private prune(t: number) {
    if (this.hits.size < 10_000) return;
    for (const [key, entry] of this.hits) if (entry.resetAt <= t) this.hits.delete(key);
  }
}

/**
 * Limits on texting one phone number. Counting the number together with the
 * visitor's IP means a stranger asking for texts to your number can't use up
 * your own allowance; the per-number ceiling, set higher, is the backstop
 * against someone who rotates IPs.
 */
export interface PhoneLimits {
  perPhoneAndIp: RateLimiter;
  perPhone: RateLimiter;
}

/**
 * Counts one text to phone, asked for from ip, and says whether it may go
 * ahead. With no trustworthy IP (see lib/clientIp.ts), every such visitor
 * shares one bucket per number. Stops at the first limit it is over, so a
 * refused request doesn't count against the per-number ceiling.
 */
export function takePhone(limits: PhoneLimits, phone: string, ip: string | null | undefined): boolean {
  return limits.perPhoneAndIp.take(`${phone} ${ip || 'unknown'}`) && limits.perPhone.take(phone);
}
