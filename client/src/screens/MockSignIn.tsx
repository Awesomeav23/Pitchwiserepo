/**
 * Placeholder sign-in, used when no Clerk key is configured (ADR-016).
 *
 * This is **not authentication**. It exists so the sign-in step can be built
 * and walked through before a provider account exists, and so a second identity
 * is one form away when testing what a new learner sees.
 *
 * The password field is here because the page should have the shape it will
 * have under Clerk — a real form, two fields, a submit. It is never checked,
 * never stored and never sent. The alternative, comparing it against something,
 * would be a fake credential check, and a security control that does nothing is
 * worse than a visibly absent one. The page says so in as many words, because a
 * login form that quietly accepts anything is exactly the kind of thing that
 * survives into production by being forgotten.
 */
import { useState } from 'react';
import { signInDev } from '../api/session';

export function MockSignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // `password` is read nowhere. It is state so the input is controlled, and
    // that is the whole of its life.
    signInDev(email.trim(), name);
    onSignedIn();
  };

  const valid = /.+@.+\..+/.test(email.trim()) && password.length > 0;

  return (
    <div className="tuner signin">
      <header><h1>Pitchwise</h1></header>

      <h2 className="big-question">Sign in</h2>
      <p className="lede">
        Your courses, scores and attempt history are tied to your account, so they follow
        you between devices rather than living in one browser.
      </p>

      <p className="alert warn">
        <strong>Placeholder sign-in.</strong> No password is checked, stored or sent —
        any address and any password will let you in, and each new address gets a fresh
        account. This is replaced by Clerk the moment a publishable key is configured
        (ADR-016).
      </p>

      <form className="signin-form" onSubmit={submit}>
        <label>
          Email
          <input type="email" value={email} autoComplete="off"
            onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </label>

        <label>
          Password
          <input type="password" value={password} autoComplete="off"
            onChange={(e) => setPassword(e.target.value)} placeholder="anything at all" />
        </label>

        <label>
          Display name <span className="optional">optional</span>
          <input type="text" value={name} autoComplete="off"
            onChange={(e) => setName(e.target.value)} placeholder="Taken from your email if blank" />
        </label>

        <button className="primary" type="submit" disabled={!valid}>
          Sign in
        </button>
      </form>

      <p className="stat">
        Pitchwise never receives your audio: analysis happens in this browser and only the
        derived numbers are stored (ADR-001).
      </p>
    </div>
  );
}
