/**
 * Sign-in — US-01. Provider-hosted, per ADR-006 and ADR-016.
 *
 * There is deliberately no form here. Clerk's component owns the whole flow —
 * email, password, verification, reset, social — and rebuilding any of it would
 * recreate exactly what choosing a managed provider was meant to avoid. This
 * file is the page around it.
 */
import { SignIn as ClerkSignIn } from '@clerk/clerk-react';

export function SignInScreen() {
  return (
    <div className="tuner signin">
      <header><h1>Pitchwise</h1></header>

      <h2 className="big-question">Sign in to keep your progress</h2>
      <p className="lede">
        Your courses, scores and attempt history are tied to your account, so they follow
        you between devices rather than living in one browser.
      </p>

      <div className="signin-box">
        <ClerkSignIn
          appearance={{
            variables: {
              colorPrimary: '#7c5cff',
              colorBackground: '#12121b',
              colorText: '#e6e6f0',
              colorTextSecondary: '#8b8b9f',
              colorInputBackground: '#0b0b12',
              colorInputText: '#e6e6f0',
              borderRadius: '11px',
            },
          }}
        />
      </div>

      <p className="stat">
        Pitchwise never receives your password — the provider handles it. And it never
        receives your audio either: analysis happens in this browser and only the derived
        numbers are stored (ADR-001).
      </p>
    </div>
  );
}
