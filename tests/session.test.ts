import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SESSION_TTL_SECONDS,
  cookieOptions,
  expiredCookie,
  openPending,
  openSession,
  pendingCookie,
  sealPending,
  sealSession,
  sessionCookie,
} from '../lib/session';

afterEach(() => vi.unstubAllEnvs());

const secret = new TextEncoder().encode('a-test-secret-that-is-at-least-32-chars');
const otherSecret = new TextEncoder().encode('another-secret-that-is-at-least-32-chars');

describe('session cookies', () => {
  it('round-trips a pending verification', async () => {
    const token = await sealPending({ verificationId: 'ver_1', phone: '+16135550123', testCode: '000000' }, secret);
    expect(await openPending(token, secret)).toEqual({ verificationId: 'ver_1', phone: '+16135550123', testCode: '000000' });
  });

  it('round-trips a live verification, which has no test code', async () => {
    const token = await sealPending({ verificationId: 'ver_2', phone: '+16135550123', testCode: null }, secret);
    expect(await openPending(token, secret)).toEqual({ verificationId: 'ver_2', phone: '+16135550123', testCode: null });
  });

  it('round-trips a session', async () => {
    const token = await sealSession({ phone: '+16135550123' }, secret);
    expect(await openSession(token, secret)).toEqual({ phone: '+16135550123' });
  });

  it('rejects a token signed with another secret', async () => {
    const token = await sealSession({ phone: '+16135550123' }, otherSecret);
    expect(await openSession(token, secret)).toBeNull();
  });

  it('rejects a tampered token', async () => {
    const token = await sealSession({ phone: '+16135550123' }, secret);
    const [header, , signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: '+14165550199', aud: 'session' })).toString('base64url');
    expect(await openSession(`${header}.${forged}.${signature}`, secret)).toBeNull();
  });

  it('does not accept a pending token as a session, or the reverse', async () => {
    const pending = await sealPending({ verificationId: 'ver_1', phone: '+16135550123', testCode: null }, secret);
    const session = await sealSession({ phone: '+16135550123' }, secret);
    expect(await openSession(pending, secret)).toBeNull();
    expect(await openPending(session, secret)).toBeNull();
  });

  it('treats a missing or garbage cookie as signed out', async () => {
    expect(await openSession(undefined, secret)).toBeNull();
    expect(await openSession('not-a-jwt', secret)).toBeNull();
  });
});

describe('cookie settings', () => {
  it('keeps a session for 24 hours', () => {
    expect(SESSION_TTL_SECONDS).toBe(24 * 60 * 60);
  });

  it('uses __Host- names and Secure cookies in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(sessionCookie()).toBe('__Host-session');
    expect(pendingCookie()).toBe('__Host-otp_pending');
    // What __Host- requires: Secure, Path=/ and no Domain.
    expect(cookieOptions(60)).toEqual({ httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 });
    expect(cookieOptions(60)).not.toHaveProperty('domain');
  });

  it('uses plain names without Secure in development, over http://localhost', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(sessionCookie()).toBe('session');
    expect(pendingCookie()).toBe('otp_pending');
    expect(cookieOptions(60).secure).toBe(false);
  });

  it('clears a cookie with the same Secure and Path it was set with, which a __Host- cookie needs', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(expiredCookie(sessionCookie())).toEqual({ name: '__Host-session', httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
  });

  it('expires a session token after 24 hours', async () => {
    const token = await sealSession({ phone: '+16135550123' }, secret);
    const { exp, iat } = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as { exp: number; iat: number };
    expect(exp - iat).toBe(24 * 60 * 60);
  });
});
