/** The two states every networked screen needs, so each one does not invent
 *  its own spinner and its own error copy. */

export function Loading({ what }: { what: string }) {
  return (
    <div className="tuner">
      <p className="stat loading">Loading {what}…</p>
    </div>
  );
}

export function Failed({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="tuner">
      <p className="alert error">
        {message}
        {onRetry && <> <button className="link" onClick={onRetry}>Try again</button></>}
      </p>
      {import.meta.env.DEV && (
        // Development only. Deployed, the client and the API are one project on
        // one origin, so there is no separate server to start and this advice
        // is a puzzle rather than a hint.
        <p className="stat">
          The API runs separately from the app. If it is not started:
          <code> docker compose up -d && cd server && npm run dev</code>
        </p>
      )}
    </div>
  );
}
