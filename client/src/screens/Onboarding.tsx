/**
 * Onboarding — US-01. Choose an instrument or voice, so exercises and analysis
 * are tuned to your range.
 *
 * Shown when /me returns no instruments, which is the honest definition of "new
 * user" given there is no sign-up event to hook (§3.1 provisions the row from
 * the first authenticated request, so the account exists before anyone has
 * chosen anything).
 */
import { useState } from 'react';
import { api } from '../api/client';
import { describeError, useApi } from '../api/useApi';
import { Loading, Failed } from '../components/Async';

const FAMILY_ORDER = ['voice', 'woodwind', 'brass', 'strings', 'keys'] as const;
const FAMILY_LABEL: Record<string, string> = {
  voice: 'Voice', woodwind: 'Woodwind', brass: 'Brass', strings: 'Strings', keys: 'Keys',
};

export function Onboarding({ onDone }: { onDone: () => void }) {
  const instruments = useApi(() => api.instruments(), []);
  const [chosen, setChosen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (instruments.loading) return <Loading what="instruments" />;
  if (instruments.error) return <Failed message={instruments.error} onRetry={instruments.reload} />;

  const confirm = () => {
    if (!chosen) return;
    setSaving(true);
    setError(null);
    api.setInstrument(chosen, true)
      .then(onDone)
      .catch((e: unknown) => { setError(describeError(e)); setSaving(false); });
  };

  return (
    <div className="tuner onboarding">
      <header><h1>Pitchwise</h1></header>

      <h2 className="big-question">What do you play?</h2>
      <p className="lede">
        This sets the frequency range the detector listens in, and puts your course at the
        top of the catalog. Every other instrument stays open to you, and you can add more
        than one later.
      </p>

      {error && <p className="alert error">{error}</p>}

      {FAMILY_ORDER.map((family) => {
        const inFamily = (instruments.data ?? []).filter((i) => i.family === family);
        if (inFamily.length === 0) return null;
        return (
          <section key={family}>
            <h3 className="section-head">{FAMILY_LABEL[family]}</h3>
            <div className="chips">
              {inFamily.map((i) => (
                <button
                  key={i.id}
                  className={`chip ${chosen === i.id ? 'on' : ''}`}
                  onClick={() => setChosen(i.id)}
                >
                  <span className="chip-name">{i.displayName.replace(/^Voice — /, '')}</span>
                  <span className="chip-range">{i.fMinHz}–{i.fMaxHz} Hz</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}

      <div className="onboarding-foot">
        <button className="primary" disabled={!chosen || saving} onClick={confirm}>
          {saving ? 'Saving…' : chosen ? 'Start learning' : 'Choose one to continue'}
        </button>
      </div>

      <p className="stat">
        Every instrument here is played one note at a time in this app. Chords and
        two-handed playing are taught in the courses but not scored — the detector hears a
        single pitch, which is a deliberate limit rather than a gap.
      </p>
    </div>
  );
}
