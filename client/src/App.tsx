/**
 * Screen switch. Deliberately not a router — routing is its own outstanding
 * item in README.md, and picking a router is a decision that belongs with the
 * course and lesson URLs it will have to carry, not with two screens that have
 * no URLs at all yet.
 */
import { useState } from 'react';
import { Practice } from './screens/Practice';
import { Tuner } from './screens/Tuner';

type Screen = 'practice' | 'tuner';

export default function App() {
  const [screen, setScreen] = useState<Screen>('practice');
  return (
    <>
      <nav className="nav">
        <div className="seg">
          <button className={screen === 'practice' ? 'on' : ''} onClick={() => setScreen('practice')}>
            Practice
          </button>
          <button className={screen === 'tuner' ? 'on' : ''} onClick={() => setScreen('tuner')}>
            Tuner
          </button>
        </div>
      </nav>
      {/* Keyed so switching screens unmounts the old one, which releases its
          microphone rather than leaving two engines contending for it. */}
      {screen === 'practice' ? <Practice key="practice" /> : <Tuner key="tuner" />}
    </>
  );
}
