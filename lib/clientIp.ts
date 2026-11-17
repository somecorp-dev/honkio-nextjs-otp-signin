import { isIP } from 'node:net';
import { trustedProxyHops } from './config';

/**
 * The visitor's IP address, for the per-IP rate limit, or null when it can't
 * be told. With null, skip the per-IP limit rather than put every visitor in
 * one shared bucket; the per-number limit still applies.
 *
 * A visitor can send any X-Forwarded-For they like, and each proxy adds the
 * address it saw to the end. So the leftmost entry is whatever the visitor
 * wrote, and only the entries your own proxies added can be trusted:
 *
 * 1. On Vercel and Fly.io, the header the platform sets (and overwrites).
 * 2. Elsewhere, the X-Forwarded-For entry TRUSTED_PROXY_HOPS from the right.
 *    With one proxy in front of the app (Railway, Render, nginx), that is
 *    the address your host's proxy saw. With TRUSTED_PROXY_HOPS=0 (nothing
 *    proxies the app), there is no address to trust.
 */
export function clientIp(headers: Pick<Headers, 'get'>): string | null {
  if (process.env.VERCEL) return valid(headers.get('x-vercel-forwarded-for')?.split(',')[0]);
  if (process.env.FLY_APP_NAME) return valid(headers.get('fly-client-ip'));

  const hops = trustedProxyHops();
  if (hops === 0) return null;
  const chain = (headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return valid(chain[chain.length - hops]);
}

function valid(ip: string | undefined | null): string | null {
  const trimmed = ip?.trim();
  return trimmed && isIP(trimmed) ? trimmed : null;
}
