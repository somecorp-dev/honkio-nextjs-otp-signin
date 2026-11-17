'use client';

import { useActionState } from 'react';
import type { SignInState } from '../lib/formState';
import { formatPhone } from '../lib/phone';
import { signIn } from './actions';

export function SignInForm({ initial }: { initial: SignInState }) {
  const [state, action, pending] = useActionState(signIn, initial);

  if (state.step === 'phone') {
    return (
      <form action={action} className="stack">
        <label htmlFor="phone">Mobile number</label>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="613 555 0123"
          defaultValue={state.phone}
          required
        />
        {state.error && <p className="error" role="alert">{state.error}</p>}
        <button type="submit" name="intent" value="send" disabled={pending}>
          {pending ? 'Sending…' : 'Text me a code'}
        </button>
        <p className="muted">Canadian mobile numbers only. Standard message rates may apply.</p>
      </form>
    );
  }

  return (
    <form action={action} className="stack">
      <p>
        We texted a code to <strong>{formatPhone(state.phone)}</strong>.
      </p>
      {state.testCode !== null && (
        <p className="notice">
          Test mode: no text was sent. The code is <code>{state.testCode}</code>.
        </p>
      )}
      <label htmlFor="code">Code</label>
      <input
        id="code"
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={8}
        required
        autoFocus
      />
      {state.error && <p className="error" role="alert">{state.error}</p>}
      <button type="submit" name="intent" value="check" disabled={pending}>
        {pending ? 'Checking…' : 'Sign in'}
      </button>
      <button type="submit" name="intent" value="restart" className="link" formNoValidate disabled={pending}>
        Use a different number
      </button>
    </form>
  );
}
