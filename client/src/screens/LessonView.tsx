/**
 * Lesson view — US-16 (read and hear), US-17 (practice counts toward
 * completion), US-18 (quiz with explanations), US-19 (self-reported drill).
 *
 * Completion is decided by the server (LEARNING_PLATFORM §7). This screen posts
 * evidence — an attempt, a quiz submission, a self-report — and renders whatever
 * progress comes back. It never decides that a lesson is finished.
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { describeError, useApi } from '../api/useApi';
import type { LessonProgress, QuizForClient, QuizResult } from '../api/types';
import { BlockView } from '../learning/Blocks';
import { Markdown } from '../learning/Markdown';
import { Loading, Failed } from '../components/Async';
import { Score } from '../notation/Score';
import { buildExercise } from '../exercises/build';
import type { Exercise } from '../exercises/types';
import { Practice } from './Practice';
import type { AttemptSummary } from '../practice/scoring';

export function LessonView({ lessonId, onBack }: { lessonId: string; onBack: () => void }) {
  const lesson = useApi(() => api.lesson(lessonId), [lessonId]);
  const [progress, setProgress] = useState<LessonProgress | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => { setProgress(lesson.data?.progress ?? null); }, [lesson.data]);

  const data = lesson.data;

  // A 'read' lesson completes on being opened. There is no other evidence to
  // wait for, and asking someone to confirm they read what they are looking at
  // is theatre.
  useEffect(() => {
    if (data?.completionRule.kind === 'read' && data.progress?.state !== 'complete') {
      api.completeLesson(data.id).then(setProgress).catch((e: unknown) => setActionError(describeError(e)));
    }
  }, [data]);

  const onAttempt = useCallback((_summary: AttemptSummary, attempt?: { lessonProgress?: LessonProgress }) => {
    if (attempt?.lessonProgress) setProgress(attempt.lessonProgress);
  }, []);

  if (lesson.loading) return <Loading what="the lesson" />;
  if (lesson.error || !data) return <Failed message={lesson.error ?? 'Not found'} onRetry={lesson.reload} />;

  const complete = progress?.state === 'complete';

  return (
    <div className="tuner lesson">
      <header>
        <button className="back" onClick={onBack}>← Course</button>
        <h1>{data.title}</h1>
        {complete && <span className="pill ok">complete</span>}
      </header>

      {actionError && <p className="alert error">{actionError}</p>}

      {data.blocks?.map((block, i) => <BlockView key={i} block={block} />)}

      {data.kind === 'exercise' && data.exercise && (
        <section className="lesson-task">
          <h2 className="section-head">Play it</h2>
          <Practice exercise={toExercise(data.exercise)} lessonId={data.id} onResult={onAttempt} embedded />
          {data.completionRule.kind === 'attempt_score' && (
            <p className="stat">This lesson completes at {data.completionRule.minScore} or above.</p>
          )}
        </section>
      )}

      {data.kind === 'quiz' && data.quiz && (
        <QuizView lessonId={data.id} quiz={data.quiz} onProgress={setProgress} />
      )}

      {data.kind === 'drill' && (
        <section className="lesson-task">
          {complete
            ? <p className="stat">Marked complete. You can redo this any time.</p>
            : <button
                className="primary"
                onClick={() => api.completeLesson(data.id).then(setProgress)
                  .catch((e: unknown) => setActionError(describeError(e)))}
              >
                I've done this
              </button>}
        </section>
      )}

      {complete && (
        <p className="alert ok-alert">
          Lesson complete. <button className="link" onClick={onBack}>Back to the course</button>
        </p>
      )}
    </div>
  );
}

// ---- quiz --------------------------------------------------------------

function QuizView({
  lessonId, quiz, onProgress,
}: {
  lessonId: string;
  quiz: QuizForClient;
  onProgress: (p: LessonProgress) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = () => {
    setSending(true);
    setError(null);
    // Graded server-side against the stored quiz. Unanswered questions count as
    // incorrect rather than being rejected — a partial submission is a failed
    // attempt, not a validation error.
    api.submitQuiz(lessonId, quiz.questions.map((q) => ({
      questionId: q.id, choiceIndex: answers[q.id] ?? -1,
    })))
      .then((r) => { setResult(r); onProgress(r.progress); })
      .catch((e: unknown) => setError(describeError(e)))
      .finally(() => setSending(false));
  };

  const verdictFor = (questionId: string) => result?.results.find((r) => r.questionId === questionId);

  return (
    <section className="lesson-task quiz">
      <h2 className="section-head">Check yourself</h2>
      {error && <p className="alert error">{error}</p>}

      {quiz.questions.map((q, qi) => {
        const chosen = answers[q.id];
        const verdict = verdictFor(q.id);
        return (
          <div key={q.id} className="question">
            <p className="q-prompt"><strong>{qi + 1}.</strong> {q.prompt}</p>
            {q.score && (
              <Score
                sequence={buildExercise(q.score.spec, { bpm: q.score.bpm }).noteSequence}
                bpm={q.score.bpm}
                clef={q.score.clef}
                playable={false}
              />
            )}
            <div className="choices">
              {q.choices.map((choice, ci) => {
                const state = !verdict ? (chosen === ci ? 'chosen' : '')
                  : ci === verdict.answerIndex ? 'right'
                  : chosen === ci ? 'wrong' : '';
                return (
                  <button key={ci} className={`choice ${state}`} disabled={!!result}
                    onClick={() => setAnswers({ ...answers, [q.id]: ci })}>
                    {choice}
                  </button>
                );
              })}
            </div>
            {/* Explanations arrive only with the graded response — the client
                never held the answers (API_SPEC §15.4). */}
            {verdict && <p className="explain"><Markdown md={verdict.explain} /></p>}
          </div>
        );
      })}

      {!result
        ? <button className="primary" disabled={sending || Object.keys(answers).length === 0} onClick={submit}>
            {sending ? 'Marking…' : 'Submit answers'}
          </button>
        : <p className={`alert ${result.passed ? 'ok-alert' : 'warn'}`}>
            {result.results.filter((r) => r.correct).length} of {result.results.length} correct
            {result.passed ? ' — passed.' : ` — ${Math.round(quiz.passFraction * 100)}% needed to pass.`}
            {' '}
            <button className="link" onClick={() => { setResult(null); setAnswers({}); }}>Try again</button>
          </p>}
    </section>
  );
}

/** The API's exercise shape is the client's, minus the fields only the local
 *  seed carried. */
function toExercise(e: NonNullable<import('../api/types').LessonDetail['exercise']>): Exercise {
  return {
    id: e.id, slug: e.slug, title: e.title, description: e.description ?? '',
    typeId: e.typeId as Exercise['typeId'], difficulty: e.difficulty,
    tempoBpm: e.tempoBpm, timeSignature: e.timeSignature,
    lowestMidi: e.lowestMidi, highestMidi: e.highestMidi, noteSequence: e.noteSequence,
  };
}
