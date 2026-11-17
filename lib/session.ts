import { SignJWT, jwtVerify } from 'jose';

// Two signed cookies, both httpOnly so page scripts never see them:
//   otp_pending: the verification in progress (its id, the number and, in test
//                mode, the code to show), 15 minutes
//   session:     the signed-in phone number, 24 hours
// Signing means a visitor cannot swap in someone else's verification id or
// phone number. Both are signed with SESSION_SECRET, so changing it signs
// everyone out.

export const PENDING_TTL_SECONDS = 15 * 60;
export const SESSION_TTL_SECONDS = 24 * 60 * 60;

const production = () => process.env.NODE_ENV === 'production';

/**
 * In production the names start with __Host-: the browser then keeps the
 * cookie only if it is Secure, has Path=/ and names no Domain, so another
 * site on a sibling subdomain can't set or overwrite it. That needs HTTPS, so
 * development (http://localhost) uses the plain names.
 */
const cookieName = (name: string) => (production() ? `__Host-${name}` : name);
export const pendingCookie = () => cookieName('otp_pending');
export const sessionCookie = () => cookieName('session');

export interface Pending {
  verificationId: string;
  phone: string;
  /** The code that completes a test-mode verification; null on a live one. */
  testCode: string | null;
}

export interface Session {
  phone: string;
}

export async function sealPending(p: Pending, secret: Uint8Array): Promise<string> {
  return new SignJWT({ vid: p.verificationId, phone: p.phone, test: p.testCode })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${PENDING_TTL_SECONDS}s`)
    .setAudience('otp-pending')
    .sign(secret);
}

export async function openPending(token: string | undefined, secret: Uint8Array): Promise<Pending | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { audience: 'otp-pending', algorithms: ['HS256'] });
    if (typeof payload.vid !== 'string' || typeof payload.phone !== 'string') return null;
    return { verificationId: payload.vid, phone: payload.phone, testCode: typeof payload.test === 'string' ? payload.test : null };
  } catch {
    return null;
  }
}

export async function sealSession(s: Session, secret: Uint8Array): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(s.phone)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .setAudience('session')
    .sign(secret);
}

export async function openSession(token: string | undefined, secret: Uint8Array): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { audience: 'session', algorithms: ['HS256'] });
    return typeof payload.sub === 'string' ? { phone: payload.sub } : null;
  } catch {
    return null;
  }
}

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: production(),
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

/**
 * For cookies().delete(). The browser drops a __Host- cookie only when the
 * clearing Set-Cookie is Secure with Path=/ too, so pass the full options.
 */
export function expiredCookie(name: string) {
  return { name, ...cookieOptions(0) };
}
