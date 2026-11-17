import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HonkioError } from '@honkio/node';
import { checkVerification, startVerification, type VerifyClient } from '../lib/otp';

// A stand-in for the SDK client: only verify.start and verify.check, as vi.fn()s.
function fakeClient() {
  const start = vi.fn();
  const check = vi.fn();
  const client = { verify: { start, check } } as unknown as VerifyClient;
  return { client, start, check };
}

const apiError = (name: string, statusCode: number | null, details?: unknown): HonkioError =>
  ({ name, message: `${name} from the API`, statusCode, details }) as HonkioError;

const verification = {
  id: 'ver_123',
  phone_number: '+16135550123',
  from_number: '+16135550100',
  status: 'pending',
  attempts: 0,
  mode: 'TEST',
  cost_cents: 0,
  code_length: 6,
  test_code: '000000',
  app_name: 'Acme',
  expires_at: '2026-11-17T12:10:00.000Z',
  verified_at: null,
  created_at: '2026-11-17T12:00:00.000Z',
};

afterEach(() => vi.restoreAllMocks());

describe('startVerification', () => {
  it('sends the number, sender and app name to verify.start', async () => {
    const { client, start } = fakeClient();
    start.mockResolvedValue({ data: verification, error: null });

    const result = await startVerification(client, { to: '+16135550123', from: '+16135550100', appName: 'Acme', allowTestMode: true });

    expect(start).toHaveBeenCalledWith({ to: '+16135550123', from: '+16135550100', appName: 'Acme' });
    expect(result).toEqual({ ok: true, verificationId: 'ver_123', phone: '+16135550123', testCode: '000000' });
  });

  it('reports no test code on a live verification', async () => {
    const { client, start } = fakeClient();
    start.mockResolvedValue({ data: { ...verification, mode: 'LIVE', test_code: null }, error: null });

    const result = await startVerification(client, { to: '+16135550123', from: '+16135550100', appName: 'Acme', allowTestMode: true });
    expect(result).toMatchObject({ ok: true, testCode: null });
  });

  it('shows the test code the verification returned', async () => {
    const { client, start } = fakeClient();
    start.mockResolvedValue({ data: { ...verification, code_length: 4, test_code: '0000' }, error: null });

    const result = await startVerification(client, { to: '+16135550123', from: '+16135550100', appName: 'Acme', allowTestMode: true });
    expect(result).toMatchObject({ ok: true, testCode: '0000' });
  });

  it('falls back to zeros at the code length when a test verification has no test_code', async () => {
    const { client, start } = fakeClient();
    const { test_code: _omitted, ...withoutTestCode } = verification;
    start.mockResolvedValue({ data: { ...withoutTestCode, code_length: 8 }, error: null });

    const result = await startVerification(client, { to: '+16135550123', from: '+16135550100', appName: 'Acme', allowTestMode: true });
    expect(result).toMatchObject({ ok: true, testCode: '00000000' });
  });

  it.each([
    ['RATE_LIMITED', 429, /wait a minute/i],
    ['NON_CANADIAN_NUMBER', 422, /canadian mobile/i],
    ['NOT_A_MOBILE_NUMBER', 422, /can’t receive texts/i],
    ['UNDELIVERABLE_NUMBER', 422, /different one/i],
    ['OPT_OUT_BLOCKED', 451, /START/],
  ])('turns %s into a message the visitor can act on', async (name, status, expected) => {
    const { client, start } = fakeClient();
    start.mockResolvedValue({ data: null, error: apiError(name, status) });

    const result = await startVerification(client, { to: '+16135550123', from: '+16135550100', appName: 'Acme', allowTestMode: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(expected);
  });

  it('hides account problems from the visitor and logs them for the owner', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client, start } = fakeClient();
    start.mockResolvedValue({ data: null, error: apiError('INSUFFICIENT_BALANCE', 402) });

    const result = await startVerification(client, { to: '+16135550123', from: '+16135550100', appName: 'Acme', allowTestMode: true });
    expect(result).toEqual({ ok: false, message: expect.stringMatching(/isn’t available/) });
    expect(result.ok === false && result.message).not.toMatch(/balance/i);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('INSUFFICIENT_BALANCE'));
  });

  it('refuses a test-mode code where test sign-ins are not allowed, and tells the owner why', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client, start } = fakeClient();
    start.mockResolvedValue({ data: verification, error: null });

    const result = await startVerification(client, { to: '+16135550123', from: '+16135550100', appName: 'Acme', allowTestMode: false });
    expect(result).toEqual({ ok: false, message: expect.stringMatching(/isn’t available/) });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('ALLOW_TEST_MODE_SIGNIN'));
  });

  it('sends a live code whether or not test sign-ins are allowed', async () => {
    const { client, start } = fakeClient();
    start.mockResolvedValue({ data: { ...verification, mode: 'LIVE', test_code: null }, error: null });

    const result = await startVerification(client, { to: '+16135550123', from: '+16135550100', appName: 'Acme', allowTestMode: false });
    expect(result).toMatchObject({ ok: true, testCode: null });
  });

  it('asks the visitor to try later when sending is limited or the network fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client, start } = fakeClient();
    for (const name of ['SENDING_PAUSED', 'NUMBER_RATE_LIMITED', 'network_error']) {
      start.mockResolvedValueOnce({ data: null, error: apiError(name, name === 'network_error' ? null : 429) });
      const result = await startVerification(client, { to: '+16135550123', from: '+16135550100', appName: 'Acme', allowTestMode: true });
      expect(result).toEqual({ ok: false, message: expect.stringMatching(/try again in a few minutes/) });
    }
  });
});

describe('checkVerification', () => {
  it('signs in on a correct code', async () => {
    const { client, check } = fakeClient();
    check.mockResolvedValue({ data: { ...verification, status: 'verified', attempts_remaining: 0 }, error: null });

    const result = await checkVerification(client, 'ver_123', ' 000 000 ', { allowTestMode: true });
    expect(check).toHaveBeenCalledWith('ver_123', { code: '000000' });
    expect(result).toEqual({ ok: true, phone: '+16135550123' });
  });

  it('never signs anyone in with a test-mode code where test sign-ins are not allowed', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client, check } = fakeClient();
    check.mockResolvedValue({ data: { ...verification, status: 'verified', attempts_remaining: 0 }, error: null });

    const result = await checkVerification(client, 'ver_123', '000000', { allowTestMode: false });
    expect(result).toEqual({ ok: false, restart: true, message: expect.stringMatching(/isn’t available/) });
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/test key.*anyone could sign in/));
  });

  it('signs in on a correct live code when test sign-ins are not allowed', async () => {
    const { client, check } = fakeClient();
    check.mockResolvedValue({ data: { ...verification, mode: 'LIVE', test_code: null, status: 'verified', attempts_remaining: 0 }, error: null });

    const result = await checkVerification(client, 'ver_123', '482913', { allowTestMode: false });
    expect(result).toEqual({ ok: true, phone: '+16135550123' });
  });

  it('refuses a code that is not digits without calling the API', async () => {
    const { client, check } = fakeClient();
    const result = await checkVerification(client, 'ver_123', 'abc', { allowTestMode: true });
    expect(check).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, restart: false });
  });

  it('shows the attempts left on a wrong code and keeps the visitor on the code step', async () => {
    const { client, check } = fakeClient();
    check.mockResolvedValue({ data: null, error: apiError('VERIFICATION_INVALID_CODE', 422, { attempts_remaining: 3 }) });

    const result = await checkVerification(client, 'ver_123', '123456', { allowTestMode: true });
    expect(result).toEqual({ ok: false, restart: false, message: 'That code isn’t right. 3 tries left.' });
  });

  it('says "1 try" for the last attempt', async () => {
    const { client, check } = fakeClient();
    check.mockResolvedValue({ data: null, error: apiError('VERIFICATION_INVALID_CODE', 422, { attempts_remaining: 1 }) });

    const result = await checkVerification(client, 'ver_123', '123456', { allowTestMode: true });
    expect(result).toMatchObject({ message: 'That code isn’t right. 1 try left.' });
  });

  it.each([
    ['VERIFICATION_EXPIRED', 410, /expired/],
    ['VERIFICATION_MAX_ATTEMPTS', 429, /too many wrong codes/i],
    ['VERIFICATION_ALREADY_VERIFIED', 409, /already used/],
    ['VERIFICATION_NOT_FOUND', 404, /start again/],
  ])('sends the visitor back for a new code on %s', async (name, status, expected) => {
    const { client, check } = fakeClient();
    check.mockResolvedValue({ data: null, error: apiError(name, status) });

    const result = await checkVerification(client, 'ver_123', '123456', { allowTestMode: true });
    expect(result).toMatchObject({ ok: false, restart: true });
    if (!result.ok) expect(result.message).toMatch(expected);
  });

  it('lets the visitor retry the same code after a network error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client, check } = fakeClient();
    check.mockResolvedValue({ data: null, error: apiError('network_error', null) });

    const result = await checkVerification(client, 'ver_123', '123456', { allowTestMode: true });
    expect(result).toMatchObject({ ok: false, restart: false });
  });
});
