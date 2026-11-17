import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sessionSecret } from '../lib/config';
import type { SignInState } from '../lib/formState';
import { openPending, openSession, pendingCookie, sessionCookie } from '../lib/session';
import { SignInForm } from './sign-in-form';

export default async function Home() {
  const store = await cookies();
  const secret = sessionSecret();
  if (await openSession(store.get(sessionCookie())?.value, secret)) redirect('/account');

  // A code already on its way (after a refresh, say) picks up at the code step.
  const pending = await openPending(store.get(pendingCookie())?.value, secret);
  const initial: SignInState = pending
    ? { step: 'code', phone: pending.phone, testCode: pending.testCode }
    : { step: 'phone' };

  return (
    <main className="card">
      <h1>Sign in</h1>
      <p className="muted">We’ll text you a one-time code. No password needed.</p>
      <SignInForm initial={initial} />
    </main>
  );
}
