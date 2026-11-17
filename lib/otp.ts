import type { Honkio, HonkioError, Verification } from '@honkio/node';

/** The part of the SDK this file uses, so tests can pass a fake. */
export type VerifyClient = { verify: Pick<Honkio['verify'], 'start' | 'check'> };

export type StartResult =
  /** testCode: the code that completes a test-mode verification; null on a live one. */
  | { ok: true; verificationId: string; phone: string; testCode: string | null }
  | { ok: false; message: string };

export type CheckResult =
  | { ok: true; phone: string }
  /** restart: the verification is over (expired, used up); ask for a new code. */
  | { ok: false; message: string; restart: boolean };

const TRY_LATER = 'We can’t send a code right now. Please try again in a few minutes.';
const UNAVAILABLE = 'Sign-in by text isn’t available right now. Please try again later.';

/**
 * Logs what the site owner needs to fix (a missing balance, a wrong key), so
 * the visitor only sees a general message and the details stay in your logs.
 */
function logForOwner(where: string, error: HonkioError): void {
  console.error(`[honkio] ${where} failed: ${error.name} (${error.statusCode ?? 'no response'}): ${error.message}`);
}

/**
 * A test key's code is always 000000, so with one anyone could sign in as any
 * number. Production refuses that unless ALLOW_TEST_MODE_SIGNIN=true (see
 * allowTestModeSignIn in lib/config.ts); this tells the owner why.
 */
function logTestModeRefused(): void {
  console.error(
    '[honkio] Sign-in refused: HONKIO_API_KEY is a test key (mk_test_), so every code is 000000 and anyone could sign in as any number. ' +
      'Use a live key (mk_live_) in production, or set ALLOW_TEST_MODE_SIGNIN=true for a demo.',
  );
}

/** What to tell a visitor when HonkIO refused to send a code. */
export function startErrorMessage(error: HonkioError): string {
  switch (error.name) {
    case 'RATE_LIMITED':
      // One code per number a minute.
      return 'We just sent a code to this number. Wait a minute before asking for another.';
    case 'NON_CANADIAN_NUMBER':
      return 'Enter a Canadian mobile number.';
    case 'VALIDATION_ERROR':
      return 'That phone number doesn’t look right. Check it and try again.';
    case 'NOT_A_MOBILE_NUMBER':
      return 'That number can’t receive texts. Use a mobile number.';
    case 'RESERVED_DESTINATION':
    case 'UNDELIVERABLE_NUMBER':
      return 'We can’t send a text to that number. Try a different one.';
    case 'OPT_OUT_BLOCKED':
      return 'This number has opted out of our texts. Text START to the number our codes come from, then try again.';
    case 'RECIPIENT_RATE_LIMITED':
    case 'NUMBER_RATE_LIMITED':
    case 'DAILY_LIMIT_REACHED':
    case 'FANOUT_LIMIT_REACHED':
    case 'SENDING_PAUSED':
    case 'CARRIER_UNAVAILABLE':
    case 'CARRIER_THROTTLED':
    case 'CARRIER_TIMEOUT':
    case 'CARRIER_ERROR':
    case 'network_error':
      logForOwner('verify.start', error);
      return TRY_LATER;
    default:
      // INSUFFICIENT_BALANCE, ACCOUNT_NOT_VERIFIED, PHONE_NUMBER_NOT_OWNED,
      // an invalid key and the like: the visitor can't fix these, you can.
      logForOwner('verify.start', error);
      return UNAVAILABLE;
  }
}

/** What to tell a visitor when HonkIO refused a code, and whether to start over. */
export function checkErrorMessage(error: HonkioError): { message: string; restart: boolean } {
  switch (error.name) {
    case 'VERIFICATION_INVALID_CODE': {
      const left = (error.details as { attempts_remaining?: unknown } | undefined)?.attempts_remaining;
      if (typeof left === 'number') {
        return { message: `That code isn’t right. ${left} ${left === 1 ? 'try' : 'tries'} left.`, restart: false };
      }
      return { message: 'That code isn’t right. Check the text and try again.', restart: false };
    }
    case 'VALIDATION_ERROR':
      return { message: 'Enter the code from the text, digits only.', restart: false };
    case 'VERIFICATION_EXPIRED':
      return { message: 'That code has expired. We can send you a new one.', restart: true };
    case 'VERIFICATION_MAX_ATTEMPTS':
      return { message: 'Too many wrong codes. Ask for a new code to try again.', restart: true };
    case 'VERIFICATION_ALREADY_VERIFIED':
      return { message: 'That code was already used. Ask for a new code to sign in again.', restart: true };
    case 'VERIFICATION_NOT_FOUND':
      return { message: 'We couldn’t find that sign-in. Please start again.', restart: true };
    case 'network_error':
      logForOwner('verify.check', error);
      return { message: 'We couldn’t check your code just now. Please try again.', restart: false };
    default:
      logForOwner('verify.check', error);
      return { message: UNAVAILABLE, restart: true };
  }
}

/**
 * The code that completes a test-mode verification, to show on the page.
 * HonkIO returns it as test_code (null on a live verification). If a response
 * has no test_code, a TEST verification's code is all zeros at its length.
 */
function testCodeOf(data: Pick<Verification, 'mode' | 'code_length'> & { test_code?: string | null }): string | null {
  if (typeof data.test_code === 'string') return data.test_code;
  return data.mode === 'TEST' ? '0'.repeat(data.code_length || 6) : null;
}

export async function startVerification(
  client: VerifyClient,
  input: { to: string; from: string; appName: string; allowTestMode: boolean },
): Promise<StartResult> {
  const { data, error } = await client.verify.start({ to: input.to, from: input.from, appName: input.appName });
  if (error) return { ok: false, message: startErrorMessage(error) };
  const testMode = data.mode === 'TEST';
  if (testMode && !input.allowTestMode) {
    logTestModeRefused();
    return { ok: false, message: UNAVAILABLE };
  }
  return { ok: true, verificationId: data.id, phone: data.phone_number, testCode: testCodeOf(data) };
}

export async function checkVerification(
  client: VerifyClient,
  verificationId: string,
  code: string,
  options: { allowTestMode: boolean },
): Promise<CheckResult> {
  const trimmed = code.replace(/\s/g, '');
  if (!/^\d{4,8}$/.test(trimmed)) {
    return { ok: false, message: 'Enter the code from the text, digits only.', restart: false };
  }
  const { data, error } = await client.verify.check(verificationId, { code: trimmed });
  if (error) return { ok: false, ...checkErrorMessage(error) };
  // The real guard: never hand out a session for a test-mode code where it isn't allowed.
  if (data.mode === 'TEST' && !options.allowTestMode) {
    logTestModeRefused();
    return { ok: false, message: UNAVAILABLE, restart: true };
  }
  return { ok: true, phone: data.phone_number };
}
