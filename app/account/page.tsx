import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sessionSecret } from '../../lib/config';
import { formatPhone } from '../../lib/phone';
import { openSession, sessionCookie } from '../../lib/session';
import { signOut } from '../actions';

export default async function Account() {
  const session = await openSession((await cookies()).get(sessionCookie())?.value, sessionSecret());
  if (!session) redirect('/');

  return (
    <main className="card">
      <h1>You’re signed in</h1>
      <p>
        Signed in as <strong>{formatPhone(session.phone)}</strong>.
      </p>
      <p className="muted">
        This page is where your app starts. Look up or create the user for this phone number in your own database.
      </p>
      <form action={signOut}>
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
