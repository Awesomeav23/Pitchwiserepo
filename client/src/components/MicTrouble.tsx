/**
 * The microphone-denied and microphone-unavailable states — REQUIREMENTS §5.1.
 *
 * A required success criterion, and the one failure every user of this app will
 * eventually hit. Generic error text is useless here: "permission denied" and
 * "another application is using it" need completely different actions, and the
 * browser reports them as distinct DOMException names, so the guidance is
 * chosen from the name rather than averaged into one message.
 */
import { MicrophoneError } from '../audio/engine';

interface Advice { title: string; body: string; steps?: string[] }

const ADVICE: Record<string, Advice> = {
  NotAllowedError: {
    title: 'Microphone access was blocked',
    body: 'The browser is refusing access rather than the app. Nothing here can work until that is changed, because all analysis happens on the audio it would capture.',
    steps: [
      'Click the icon at the left of the address bar',
      'Set Microphone to Allow',
      'Reload the page',
    ],
  },
  NotFoundError: {
    title: 'No microphone found',
    body: 'The browser can see no input device at all. A laptop microphone counts — if you expected one, it may be disabled at the system level.',
    steps: [
      'Check that a microphone is connected',
      'Open your system sound settings and confirm an input device is enabled',
      'Reload the page',
    ],
  },
  NotReadableError: {
    title: 'The microphone is in use',
    body: 'Another application has it open exclusively. Video calls are the usual cause.',
    steps: ['Close any call or recording app', 'Reload the page'],
  },
  OverconstrainedError: {
    title: 'This device cannot be used as asked',
    body: 'Pitchwise asks for raw audio — no echo cancellation, no noise suppression, no auto-gain — because those rewrite the waveform and make pitch readings untrustworthy. This device cannot provide that.',
  },
  SecurityError: {
    title: 'Microphone access needs a secure page',
    body: 'Browsers only grant microphone access over https, or on localhost. This page is served over neither.',
  },
};

const FALLBACK: Advice = {
  title: 'The microphone could not be opened',
  body: 'The browser refused the request without saying why.',
  steps: ['Reload the page', 'If it persists, try another browser'],
};

export function MicTrouble({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const kind = error instanceof MicrophoneError ? error.kind : 'Unknown';
  const advice = ADVICE[kind] ?? FALLBACK;

  return (
    <section className="mic-trouble">
      <h2>{advice.title}</h2>
      <p>{advice.body}</p>
      {advice.steps && (
        <ol>{advice.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
      )}
      <div className="mic-trouble-actions">
        {onRetry && <button className="primary" onClick={onRetry}>Try again</button>}
        <a className="link" href="#/">Back to the courses</a>
      </div>
      <p className="stat">
        Reading a lesson does not need a microphone. Only the exercises that score you do.
      </p>
    </section>
  );
}
