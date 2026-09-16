/**
 * Sign-in when no Clerk key is configured (ADR-016).
 *
 * A working sign-in: accounts are created, passwords are salted, hashed and
 * verified, and a wrong one is refused. The accounts live in this browser
 * rather than on a server, which is the one thing about it that differs from
 * the real flow — so the page says that, and says nothing else that is not
 * true.
 */
import { useState } from 'react';
import { accountCount, createDevAccount, lastEmail, signInDev } from '../api/session';

type Mode = 'signIn' | 'create';

export function LocalSignIn({ onSignedIn }: { onSignedIn: () => void }) {
  // Someone with no account here can only be creating one; someone with an
  // account is far more likely to be returning.
  const [mode, setMode] = useState<Mode>(accountCount() > 0 ? 'signIn' : 'create');
  // Offered rather than left blank: the address is not a secret, and retyping
  // it every visit is the kind of friction that makes a form feel broken.
  const [email, setEmail] = useState(lastEmail);
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = mode === 'create'
      ? await createDevAccount(email, password, name)
      : await signInDev(email, password);
    setBusy(false);

    if (!result.ok) { setError(result.reason); return; }

    if (mode === 'create') {
      // Hand off to sign-in rather than letting them in. The email is kept so
      // there is one field to fill, and the password is cleared because typing
      // it again is the point.
      setMode('signIn');
      setPassword('');
      setCreated(true);
      return;
    }
    onSignedIn();
  };

  const switchTo = (next: Mode) => { setMode(next); setError(null); setCreated(false); };
  const valid = /.+@.+\..+/.test(email.trim()) && password.length > 0;

  return (
    <div className="tuner signin">
      <header><h1>Pitchwise</h1></header>

      <h2 className="big-question">
        {mode === 'create' ? 'Create your account' : created ? 'Now sign in' : 'Welcome back'}
      </h2>
      <p className="lede">
        Your courses, scores and attempt history are tied to your account, so your progress
        is kept rather than lost when you close the tab.
      </p>

      {created && (
        <p className="alert ok-alert">
          Account created. Sign in with the password you just chose.
        </p>
      )}
      {error && <p className="alert error">{error}</p>}

      <form className="signin-form" onSubmit={(e) => void submit(e)}
            method="post" action="#" name="signin">
        <label>
          Email
          {/* name and id are what a password manager keys off. Without them
              Chrome will not offer to save or fill this form at all, however
              correct the autoComplete hints are. */}
          <input
            type="email" id="email" name="email" value={email}
            autoComplete="username" required
            onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
          />
        </label>

        <label>
          Password
          <input
            type="password" id="password" name="password" value={password}
            autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
            required minLength={6}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'create' ? 'At least 6 characters' : ''}
          />
        </label>

        {mode === 'create' && (
          <label>
            Display name <span className="optional">optional</span>
            <input
              type="text" id="displayName" name="displayName" value={name}
              autoComplete="name"
              onChange={(e) => setName(e.target.value)}
              placeholder="Taken from your email if blank"
            />
          </label>
        )}

        <button className="primary" type="submit" disabled={!valid || busy}>
          {busy ? 'Just a moment…' : mode === 'create' ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <p className="stat">
        {mode === 'create'
          ? <>Already have an account? <button className="link" onClick={() => switchTo('signIn')}>Sign in</button></>
          : <>No account yet? <button className="link" onClick={() => switchTo('create')}>Create one</button></>}
      </p>

      <p className="stat">
        Accounts are stored in this browser, so they do not follow you to another device
        or survive clearing site data. Connecting Clerk replaces this with real hosted
        accounts and changes nothing else about the app.
      </p>

      <p className="stat">
        Pitchwise never receives your audio: analysis happens in this browser and only the
        derived numbers are stored (ADR-001).
      </p>
    </div>
  );
}
