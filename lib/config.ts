// Settings are read when a request needs them, not at import time, so
// `next build` works without a .env file.

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set. Copy .env.example to .env.local and fill it in.`);
  return value;
}

export function honkioApiKey(): string {
  return required('HONKIO_API_KEY');
}

export function fromNumber(): string {
  return required('HONKIO_FROM_NUMBER');
}

export function appName(): string {
  return process.env.APP_NAME?.trim() || 'Acme';
}

export function sessionSecret(): Uint8Array {
  const secret = required('SESSION_SECRET');
  if (secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters.');
  // Catches a placeholder or a typed pattern ("aaaa...", "1234567890..."). A
  // random secret has far more: base64 uses 64 characters and hex 16, so the
  // bar sits below what hex reaches.
  if (new Set(secret).size < 12) {
    throw new Error('SESSION_SECRET has too few different characters to be random. Make one with: openssl rand -base64 32');
  }
  return new TextEncoder().encode(secret);
}

/**
 * A test key's codes are always 000000, so a test-mode sign-in proves nothing
 * about who holds the phone. Allowed in development; in production only when
 * ALLOW_TEST_MODE_SIGNIN=true, for a demo.
 */
export function allowTestModeSignIn(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.ALLOW_TEST_MODE_SIGNIN?.trim() === 'true';
}

/**
 * How many proxies in front of the app add to X-Forwarded-For. See
 * lib/clientIp.ts, which never asks on Vercel or Fly.io.
 *
 * Required in production: a bare `next start` fills in X-Forwarded-For only
 * when the request has none, so with nothing in front of the app the visitor
 * writes the entry a default of 1 would trust. In development it defaults to 1.
 */
export function trustedProxyHops(): number {
  const raw = process.env.TRUSTED_PROXY_HOPS?.trim();
  if (!raw) {
    if (process.env.NODE_ENV !== 'production') return 1;
    throw new Error(
      'TRUSTED_PROXY_HOPS is not set. In production, set it to how many proxies in front of the app add to X-Forwarded-For: ' +
        '0 for a bare `next start` with nothing in front, 1 behind one proxy (Railway, Render, nginx).',
    );
  }
  const hops = Number(raw);
  if (!Number.isInteger(hops) || hops < 0 || hops > 10) {
    throw new Error('TRUSTED_PROXY_HOPS must be a whole number from 0 to 10.');
  }
  return hops;
}
