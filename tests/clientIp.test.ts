import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clientIp } from '../lib/clientIp';

const h = (entries: Record<string, string>) => new Headers(entries);

beforeEach(() => {
  // Run as if on a plain host, whatever machine the tests run on.
  vi.stubEnv('VERCEL', '');
  vi.stubEnv('FLY_APP_NAME', '');
  vi.stubEnv('TRUSTED_PROXY_HOPS', '');
});

afterEach(() => vi.unstubAllEnvs());

describe('clientIp', () => {
  it('takes the entry the host proxy appended, not the one the visitor wrote (TRUSTED_PROXY_HOPS defaults to 1 outside production)', () => {
    expect(clientIp(h({ 'x-forwarded-for': '1.2.3.4, 203.0.113.7' }))).toBe('203.0.113.7');
  });

  it('counts TRUSTED_PROXY_HOPS from the right', () => {
    vi.stubEnv('TRUSTED_PROXY_HOPS', '2');
    expect(clientIp(h({ 'x-forwarded-for': '1.2.3.4, 203.0.113.7, 10.0.0.2' }))).toBe('203.0.113.7');
  });

  it('trusts no forwarded address with TRUSTED_PROXY_HOPS=0', () => {
    vi.stubEnv('TRUSTED_PROXY_HOPS', '0');
    expect(clientIp(h({ 'x-forwarded-for': '203.0.113.7' }))).toBeNull();
  });

  it('returns null when there are fewer entries than proxies', () => {
    vi.stubEnv('TRUSTED_PROXY_HOPS', '2');
    expect(clientIp(h({ 'x-forwarded-for': '203.0.113.7' }))).toBeNull();
  });

  it('returns null for a missing header or something that is not an IP', () => {
    expect(clientIp(h({}))).toBeNull();
    expect(clientIp(h({ 'x-forwarded-for': 'unknown' }))).toBeNull();
    expect(clientIp(h({ 'x-forwarded-for': '203.0.113.7, not-an-ip' }))).toBeNull();
  });

  it('reads IPv6 addresses', () => {
    expect(clientIp(h({ 'x-forwarded-for': '2001:db8::1' }))).toBe('2001:db8::1');
  });

  it('ignores platform headers when not running on that platform', () => {
    expect(clientIp(h({ 'x-vercel-forwarded-for': '1.2.3.4', 'fly-client-ip': '1.2.3.4', 'x-forwarded-for': '203.0.113.7' }))).toBe(
      '203.0.113.7',
    );
  });

  it('uses the platform header on Vercel and Fly.io', () => {
    vi.stubEnv('VERCEL', '1');
    expect(clientIp(h({ 'x-vercel-forwarded-for': '203.0.113.7', 'x-forwarded-for': '1.2.3.4' }))).toBe('203.0.113.7');
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('FLY_APP_NAME', 'my-app');
    expect(clientIp(h({ 'fly-client-ip': '203.0.113.8', 'x-forwarded-for': '1.2.3.4' }))).toBe('203.0.113.8');
    expect(clientIp(h({ 'fly-client-ip': 'garbage' }))).toBeNull();
  });

  it('requires TRUSTED_PROXY_HOPS in production, where a bare `next start` lets the visitor write X-Forwarded-For', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => clientIp(h({ 'x-forwarded-for': '203.0.113.7' }))).toThrow(
      /TRUSTED_PROXY_HOPS is not set.*0 for a bare `next start`.*1 behind one proxy/,
    );
    vi.stubEnv('TRUSTED_PROXY_HOPS', '0');
    expect(clientIp(h({ 'x-forwarded-for': '203.0.113.7' }))).toBeNull();
    vi.stubEnv('TRUSTED_PROXY_HOPS', '1');
    expect(clientIp(h({ 'x-forwarded-for': '1.2.3.4, 203.0.113.7' }))).toBe('203.0.113.7');
  });

  it('does not need TRUSTED_PROXY_HOPS in production on Vercel or Fly.io', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL', '1');
    expect(clientIp(h({ 'x-vercel-forwarded-for': '203.0.113.7' }))).toBe('203.0.113.7');
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('FLY_APP_NAME', 'my-app');
    expect(clientIp(h({ 'fly-client-ip': '203.0.113.8' }))).toBe('203.0.113.8');
  });

  it('refuses a TRUSTED_PROXY_HOPS that is not a small whole number', () => {
    vi.stubEnv('TRUSTED_PROXY_HOPS', 'two');
    expect(() => clientIp(h({ 'x-forwarded-for': '203.0.113.7' }))).toThrow(/TRUSTED_PROXY_HOPS/);
  });
});
