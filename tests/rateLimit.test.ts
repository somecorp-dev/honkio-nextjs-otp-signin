import { describe, expect, it } from 'vitest';
import { RateLimiter, takePhone } from '../lib/rateLimit';

describe('RateLimiter', () => {
  it('allows up to the limit in a window, then refuses', () => {
    let now = 0;
    const limiter = new RateLimiter(2, 1000, () => now);
    expect(limiter.take('a')).toBe(true);
    expect(limiter.take('a')).toBe(true);
    expect(limiter.take('a')).toBe(false);
    expect(limiter.take('b')).toBe(true);
  });

  it('starts a fresh window once the old one ends', () => {
    let now = 0;
    const limiter = new RateLimiter(1, 1000, () => now);
    expect(limiter.take('a')).toBe(true);
    expect(limiter.take('a')).toBe(false);
    now = 1000;
    expect(limiter.take('a')).toBe(true);
  });
});

describe('takePhone', () => {
  const limits = () => ({ perPhoneAndIp: new RateLimiter(2, 1000), perPhone: new RateLimiter(3, 1000) });
  const PHONE = '+16135550123';

  it('counts a number per IP, so one IP using up its share leaves the others theirs', () => {
    const l = limits();
    expect(takePhone(l, PHONE, '203.0.113.66')).toBe(true);
    expect(takePhone(l, PHONE, '203.0.113.66')).toBe(true);
    expect(takePhone(l, PHONE, '203.0.113.66')).toBe(false);
    expect(takePhone(l, PHONE, '203.0.113.7')).toBe(true);
  });

  it('caps a number across all IPs, and a refused request does not count toward the cap', () => {
    const l = limits();
    expect(takePhone(l, PHONE, '203.0.113.1')).toBe(true);
    expect(takePhone(l, PHONE, '203.0.113.1')).toBe(true);
    expect(takePhone(l, PHONE, '203.0.113.1')).toBe(false); // per IP, not counted toward the cap
    expect(takePhone(l, PHONE, '203.0.113.2')).toBe(true);
    expect(takePhone(l, PHONE, '203.0.113.3')).toBe(false); // the cap of 3
    expect(takePhone(l, '+16135550199', '203.0.113.3')).toBe(true);
  });

  it('puts every visitor with no trustworthy IP in one bucket per number', () => {
    const l = limits();
    expect(takePhone(l, PHONE, null)).toBe(true);
    expect(takePhone(l, PHONE, undefined)).toBe(true);
    expect(takePhone(l, PHONE, null)).toBe(false);
  });
});
