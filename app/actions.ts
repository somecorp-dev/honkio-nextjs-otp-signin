'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { clientIp } from '../lib/clientIp';
import { allowTestModeSignIn, appName, fromNumber, sessionSecret } from '../lib/config';
import type { SignInState } from '../lib/formState';
import { honkio } from '../lib/honkio';
import { checkVerification, startVerification } from '../lib/otp';
import { toE164 } from '../lib/phone';
import { RateLimiter, takePhone } from '../lib/rateLimit';
import {
  PENDING_TTL_SECONDS,
  SESSION_TTL_SECONDS,
  cookieOptions,
  expiredCookie,
  openPending,
  pendingCookie,
  sealPending,
  sealSession,
  sessionCookie,
} from '../lib/session';

// Code request limits, on top of HonkIO's one code per number a minute. See
// lib/rateLimit.ts.
//   5 per visitor IP every 15 minutes.
//   3 per phone number from one IP every 15 minutes: enough for a typo and a
//     retry, and a stranger asking for codes to your number uses up only
//     their own three, not yours.
//   10 per phone number an hour from all IPs: the backstop. Someone rotating
//     IPs can text one number at most 10 codes an hour, and lock its owner
//     out for an hour at most.
const ipLimiter = new RateLimiter(5, 15 * 60 * 1000);
const phoneLimits = {
  perPhoneAndIp: new RateLimiter(3, 15 * 60 * 1000),
  perPhone: new RateLimiter(10, 60 * 60 * 1000),
};
const TOO_MANY = 'Too many code requests. Please wait a few minutes and try again.';

async function sendCode(form: FormData): Promise<SignInState> {
  const typed = String(form.get('phone') ?? '');
  const phone = toE164(typed);
  if (!phone) return { step: 'phone', phone: typed, error: 'Enter a 10-digit Canadian mobile number.' };

  // No trustworthy IP (see lib/clientIp.ts): skip the per-IP limit; the per-number ones still hold.
  const ip = clientIp(await headers());
  if ((ip && !ipLimiter.take(ip)) || !takePhone(phoneLimits, phone, ip)) {
    return { step: 'phone', phone: typed, error: TOO_MANY };
  }

  const result = await startVerification(honkio(), {
    to: phone,
    from: fromNumber(),
    appName: appName(),
    allowTestMode: allowTestModeSignIn(),
  });
  if (!result.ok) return { step: 'phone', phone: typed, error: result.message };

  const store = await cookies();
  store.set(
    pendingCookie(),
    await sealPending({ verificationId: result.verificationId, phone: result.phone, testCode: result.testCode }, sessionSecret()),
    cookieOptions(PENDING_TTL_SECONDS),
  );
  return { step: 'code', phone: result.phone, testCode: result.testCode };
}

async function checkCode(form: FormData): Promise<SignInState> {
  const store = await cookies();
  const pending = await openPending(store.get(pendingCookie())?.value, sessionSecret());
  if (!pending) return { step: 'phone', error: 'Your code request timed out. Please ask for a new code.' };

  const result = await checkVerification(honkio(), pending.verificationId, String(form.get('code') ?? ''), {
    allowTestMode: allowTestModeSignIn(),
  });
  if (!result.ok) {
    if (result.restart) {
      store.delete(expiredCookie(pendingCookie()));
      return { step: 'phone', phone: pending.phone, error: result.message };
    }
    return { step: 'code', phone: pending.phone, testCode: pending.testCode, error: result.message };
  }

  store.delete(expiredCookie(pendingCookie()));
  store.set(sessionCookie(), await sealSession({ phone: result.phone }, sessionSecret()), cookieOptions(SESSION_TTL_SECONDS));
  redirect('/account');
}

async function startOver(): Promise<SignInState> {
  (await cookies()).delete(expiredCookie(pendingCookie()));
  return { step: 'phone' };
}

/** The sign-in form's one action. Its buttons say which step they are. */
export async function signIn(_prev: SignInState, form: FormData): Promise<SignInState> {
  switch (form.get('intent')) {
    case 'check':
      return checkCode(form);
    case 'restart':
      return startOver();
    default:
      return sendCode(form);
  }
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(expiredCookie(sessionCookie()));
  redirect('/');
}
