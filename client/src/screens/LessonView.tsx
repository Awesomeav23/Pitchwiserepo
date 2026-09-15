/**
 * Lesson view — US-16 (read and hear), US-17 (practice counts toward
 * completion), US-18 (quiz with explanations), US-19 (self-reported drill).
 *
 * One screen for all four lesson kinds, because they differ only in what
 * completes them. An exercise lesson embeds the practice take rather than
 * linking to it — LEARNING_PLATFORM §8: chrome around the existing screen, not
 * a second one.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BlockView } from '../learning/Blocks';
import { Markdown } from '../learning/Markdown';
import { progressFor, record } from '../learning/progress';
import type { LessonProgress } from '../learning/progress';
import type { Lesson, QuizQuestion } from '../learning/types';
import { buildExercise } from '../exercises/build';
import { exerciseBySlug } from '../exercises/seed';
import type { Exercise } from '../exercises/types';
import { Score } from '../notation/Score';
import { Practice } from './Practice';
import type { AttemptSummary } from '../practice/scoring';

export function LessonView({ lesson, onBack }: { lesson: Lesson; onBack: () => void }) {
  const [progress, setProgress] = useState<LessonProgress>(() => progressFor(lesson.id));

  // A 'read' lesson completes on being opened. Recorded on mount rather than on
  // a button, because there is no other evidence to wait for and asking someone
  // to confirm they read something they are looking at is theatre.
  useEffect(() => {
    if (lesson.completionRule.kind === 'read') {
      setProgress(record(lesson, { opened: true }));
    } else if (progressFor(lesson.id).state === 'not_started') {
      setProgress(record(lesson, {}));
    }
  }, [lesson]);

  const exercise = useMemo(() => resolveExercise(lesson), [lesson]);

  const onAttempt = useCallback((summary: AttemptSummary) => {
    setProgress(record(lesson, { attemptScore: summary.overallScore }));
  }, [lesson]);

  const onQuizDone = useCallback((fraction: number) => {
    setProgress(record(lesson, { quizFraction: fraction }));
  }, [lesson]);

  const complete = progress.state === 'complete';

  return (
    <div className="tuner lesson">
      <header>
        <button className="back" onClick={onBack}>← Course</button>
        <h1>{lesson.title}</h1>
        {complete && <span className="pill ok">complete</span>}
      </header>

      {lesson.blocks?.map((block, i) => <BlockView key={i} block={block} />)}

      {lesson.kind === 'exercise' && exercise && (
        <section className="lesson-task">
          <h2 className="section-head">Sing it</h2>
          <Practice exercise={exercise} onResult={onAttempt} embedded />
          {lesson.completionRule.kind === 'attempt_score' && (
            <p className="stat">
              This lesson completes at {lesson.completionRule.minScore} or above.
              {progress.bestScore != null && <> Your best so far: <strong>{progress.bestScore}</strong>.</>}
            </p>
          )}
        </section>
      )}

      {lesson.kind === 'quiz' && lesson.quiz && (
        <QuizView quiz={lesson.quiz} onDone={onQuizDone} best={progress.quizFraction} />
      )}

      {lesson.kind === 'drill' && (
        <section className="lesson-task">
          {complete
            ? <p className="stat">Marked complete. You can redo this any time.</p>
            : <button className="primary" onClick={() => setProgress(record(lesson, { selfReported: true }))}>
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
  quiz, onDone, best,
}: {
  quiz: { passFraction: number; questions: QuizQuestion[] };
  onDone: (fraction: number) => void;
  best?: number;
}) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const correct = quiz.questions.filter((q) => answers[q.id] === q.answerIndex).length;
  const fraction = correct / quiz.questions.length;
  const passed = fraction >= quiz.passFraction;

  const submit = () => {
    setSubmitted(true);
    onDone(fraction);
  };

  return (
    <section className="lesson-task quiz">
      <h2 className="section-head">Check yourself</h2>

      {quiz.questions.map((q, qi) => {
        const chosen = answers[q.id];
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
                const state = !submitted ? (chosen === ci ? 'chosen' : '')
                  : ci === q.answerIndex ? 'right'
                  : chosen === ci ? 'wrong' : '';
                return (
                  <button
                    key={ci}
                    className={`choice ${state}`}
                    disabled={submitted}
                    onClick={() => setAnswers({ ...answers, [q.id]: ci })}
                  >
                    {choice}
                  </button>
                );
              })}
            </div>
            {/* Explanations are withheld until submission — API_SPEC §15.4. */}
            {submitted && <p className="explain"><Markdown md={q.explain} /></p>}
          </div>
        );
      })}

      {!submitted
        ? <button
            className="primary"
            disabled={Object.keys(answers).length === 0}
            onClick={submit}
          >
            Submit answers
          </button>
        : <p className={`alert ${passed ? 'ok-alert' : 'warn'}`}>
            {correct} of {quiz.questions.length} correct
            {passed ? ' — passed.' : ` — ${Math.round(quiz.passFraction * 100)}% needed to pass.`}
            {' '}
            <button className="link" onClick={() => { setSubmitted(false); setAnswers({}); }}>
              Try again
            </button>
          </p>}

      {/* Unanswered questions are graded incorrect rather than rejected: a
          partial submission is a failed attempt, not a validation error. */}
      {best != null && best > 0 && !submitted && (
        <p className="stat">Best so far: {Math.round(best * 100)}%</p>
      )}
    </section>
  );
}

// ---- helpers -----------------------------------------------------------

function resolveExercise(lesson: Lesson): Exercise | null {
  if (lesson.exerciseSlug) return exerciseBySlug(lesson.exerciseSlug);
  if (!lesson.inlineExercise) return null;
  const { slug, title, bpm, typeId, difficulty, sequence } = lesson.inlineExercise;
  const midis = sequence.notes.map((n) => n.midi);
  return {
    slug,
    title,
    description: '',
    typeId,
    difficulty,
    tempoBpm: bpm,
    timeSignature: '4/4',
    lowestMidi: Math.min(...midis),
    highestMidi: Math.max(...midis),
    noteSequence: sequence,
  };
}
