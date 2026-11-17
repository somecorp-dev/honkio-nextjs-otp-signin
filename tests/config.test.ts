import { afterEach, describe, expect, it, vi } from 'vitest';
import { allowTestModeSignIn, sessionSecret } from '../lib/config';

afterEach(() => vi.unstubAllEnvs());

describe('allowTestModeSignIn', () => {
  it('allows test-mode sign-ins in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ALLOW_TEST_MODE_SIGNIN', '');
    expect(allowTestModeSignIn()).toBe(true);
  });

  it('refuses them in production by default', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ALLOW_TEST_MODE_SIGNIN', '');
    expect(allowTestModeSignIn()).toBe(false);
    vi.stubEnv('ALLOW_TEST_MODE_SIGNIN', 'yes');
    expect(allowTestModeSignIn()).toBe(false);
  });

  it('allows them in production when ALLOW_TEST_MODE_SIGNIN=true, for a demo', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ALLOW_TEST_MODE_SIGNIN', 'true');
    expect(allowTestModeSignIn()).toBe(true);
  });
});

describe('sessionSecret', () => {
  it('accepts a random secret', () => {
    vi.stubEnv('SESSION_SECRET', 'q3Jv8XbN1sPz0mLk7TfR2wYc5HdGeA9uVoBiCx4nKjE=');
    expect(sessionSecret()).toBeInstanceOf(Uint8Array);
    vi.stubEnv('SESSION_SECRET', '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
    expect(sessionSecret()).toBeInstanceOf(Uint8Array);
  });

  it('refuses a missing or short secret', () => {
    vi.stubEnv('SESSION_SECRET', '');
    expect(() => sessionSecret()).toThrow(/SESSION_SECRET is not set/);
    vi.stubEnv('SESSION_SECRET', 'q3Jv8XbN1sPz0mLk');
    expect(() => sessionSecret()).toThrow(/at least 32 characters/);
  });

  it.each([
    ['one repeated character', 'a'.repeat(40)],
    ['a typed pattern', '1234567890'.repeat(4)],
    ['a placeholder', 'changemechangemechangemechangeme'],
  ])('refuses %s', (_what, secret) => {
    vi.stubEnv('SESSION_SECRET', secret);
    expect(() => sessionSecret()).toThrow(/too few different characters/);
  });
});
