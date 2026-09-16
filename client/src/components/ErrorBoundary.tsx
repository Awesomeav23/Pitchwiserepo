/**
 * Catches a render crash and shows it, instead of letting React unmount the
 * tree and leave a blank page.
 *
 * Added after exactly that happened: the practice screen threw, the whole app
 * disappeared, and the only symptom was a page that looked like it had
 * navigated nowhere. The error was in the console the entire time, which is no
 * help to someone who is not looking at a console.
 *
 * A class component because that is still the only way to catch a render error
 * in React — there is no hook equivalent.
 */
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Render error:', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="tuner">
        <header><h1>Pitchwise</h1></header>
        <p className="alert error">
          <strong>Something broke while drawing this screen.</strong>
        </p>
        {/* Shown rather than hidden: this runs on one laptop and in front of
            the person who can fix it. A friendlier message would cost the only
            useful thing on the page. */}
        <pre className="crash">{error.message}</pre>
        <div className="detail-actions">
          <button className="primary" onClick={() => { this.setState({ error: null }); location.hash = '#/'; }}>
            Back to the courses
          </button>
        </div>
        <p className="stat">
          The full stack trace is in the browser console, and in the dev server's output.
        </p>
      </div>
    );
  }
}
