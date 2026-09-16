import { lazy, Suspense, useMemo, useState } from 'react';
import { api } from './api/client';
import { useApi } from './api/useApi';
import { MeContext, primaryOf } from './api/useMe';
import { devSession, signOutDev, usingClerk } from './api/session';
import { Loading, Failed } from './components/Async';
import { Catalog } from './screens/Catalog';
import { CourseView } from './screens/CourseView';
import { LessonView } from './screens/LessonView';
import { LocalSignIn } from './screens/LocalSignIn';
import { Onboarding } from './screens/Onboarding';
import { Practice } from './screens/Practice';
import { Scorecard } from './screens/Scorecard';
import { Tuner } from './screens/Tuner';
import { navigate, useRoute } from './lib/route';

// Split out so the SDK is fetched only when a publishable key is configured.
const ClerkShell = lazy(() => import('./ClerkShell'));
const AccountMenu = lazy(() => import('./ClerkShell').then((m) => ({ default: m.UserButton })));

/**
 * Chooses how the user is identified, and nothing below this cares which.
 *
 * With a Clerk key the app is behind sign-in; without one it runs on the
 * development session the server accepts only in development. The fallback
 * exists so that cloning the repo and running it needs no provider account
 * (ADR-016).
 */
export default function App() {
  // Re-read on sign-in so the tree swaps without a reload.
  const [devUser, setDevUser] = useState(() => devSession());

  if (!usingClerk()) {
    if (!devUser) return <LocalSignIn onSignedIn={() => setDevUser(devSession())} />;
    return <AuthedApp key={devUser.sub} onSignOut={() => { signOutDev(); setDevUser(null); }} />;
  }

  return (
    <Suspense fallback={<Loading what="sign-in" />}>
      <ClerkShell><AuthedApp /></ClerkShell>
    </Suspense>
  );
}

function AuthedApp({ onSignOut }: { onSignOut?: () => void } = {}) {
  const route = useRoute();
  const meState = useApi(() => api.me(), []);

  const value = useMemo(() => ({
    me: meState.data,
    loading: meState.loading,
    error: meState.error,
    primaryInstrumentId: primaryOf(meState.data),
    reload: meState.reload,
  }), [meState.data, meState.loading, meState.error, meState.reload]);

  if (meState.loading) return <Loading what="Pitchwise" />;
  if (meState.error) return <Failed message={meState.error} onRetry={meState.reload} />;

  // No instruments is the honest definition of a new user: §3.1 provisions the
  // account from the first authenticated request, so there is no sign-up event
  // to hang this off.
  if (meState.data && meState.data.instruments.length === 0) {
    return (
      <MeContext.Provider value={value}>
        <Onboarding onDone={() => { meState.reload(); navigate({ name: 'catalog' }); }} />
      </MeContext.Provider>
    );
  }

  const inCourses = route.name === 'catalog' || route.name === 'course'
    || route.name === 'lesson' || route.name === 'attempt';

  return (
    <MeContext.Provider value={value}>
      <nav className="nav">
        <div className="seg">
          <button className={inCourses ? 'on' : ''} onClick={() => navigate({ name: 'catalog' })}>
            Learn
          </button>
          <button className={route.name === 'practice' ? 'on' : ''}
            onClick={() => navigate({ name: 'practice' })}>
            Practice
          </button>
          <button className={route.name === 'tuner' ? 'on' : ''}
            onClick={() => navigate({ name: 'tuner' })}>
            Tuner
          </button>
        </div>
        <div className="nav-user">
          {usingClerk()
            ? <Suspense fallback={null}><AccountMenu /></Suspense>
            : onSignOut && (
                <button className="link" onClick={onSignOut}>
                  {meState.data?.email} · sign out
                </button>
              )}
        </div>
      </nav>

      {route.name === 'catalog' &&
        <Catalog onOpen={(course) => navigate({ name: 'course', slug: course.slug })} />}

      {route.name === 'course' &&
        <CourseView
          key={route.slug}
          slug={route.slug}
          onOpenLesson={(lesson) => navigate({ name: 'lesson', id: lesson.id })}
          onBack={() => navigate({ name: 'catalog' })}
        />}

      {route.name === 'lesson' &&
        <LessonView key={route.id} lessonId={route.id} onBack={() => history.back()} />}

      {route.name === 'attempt' &&
        <Scorecard key={route.id} attemptId={route.id} onBack={() => history.back()} />}

      {/* Keyed so leaving a screen unmounts it, releasing the microphone rather
          than leaving two engines contending for it. */}
      {route.name === 'practice' && <Practice key="practice" />}
      {route.name === 'tuner' && <Tuner key="tuner" />}
    </MeContext.Provider>
  );
}
