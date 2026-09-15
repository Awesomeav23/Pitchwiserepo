/**
 * End-to-end checks against a running API and a seeded database.
 *
 *   npm run dev      # in one shell
 *   npm run verify   # in another
 *
 * Same spirit as spike/verify.mjs and the client's scoring checks: no test
 * framework, no mocks. It talks to the real server and the real Postgres,
 * because the things most likely to be wrong here are SQL, status codes and
 * ownership rules — none of which a mock would have exercised.
 *
 * Requires AUTH_DEV_MODE, so it never runs against production.
 */
const BASE = process.env.API_BASE ?? 'http://localhost:8787/api/v1';

// A fresh subject per run. Progress is persistent and lesson unlocking depends
// on it, so reusing one identity would make the second run assert against the
// first run's state — the "a locked lesson is refused" check passes once and
// then fails forever.
const run = crypto.randomUUID().slice(0, 8);
const alice = `dev:alice-${run}:alice-${run}@example.com:Alice`;
const bob = `dev:bob-${run}:bob-${run}@example.com:Bob`;

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown): void {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS  ' : 'FAIL  '}${name}`);
  if (!ok && detail !== undefined) console.log(`        ${JSON.stringify(detail)}`);
}

async function call(
  path: string,
  opts: { method?: string; token?: string; body?: unknown } = {},
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const uuid = () => crypto.randomUUID();

// ---- health and auth ---------------------------------------------------

let r = await call('/healthz');
check('healthz is 200 and reports the database', r.status === 200 && r.body.db === 'ok', r.body);

r = await call('/me');
check('no token is 401 unauthenticated', r.status === 401 && r.body.error.code === 'unauthenticated', r.body);

r = await call('/me', { token: 'not-a-real-token' });
check('garbage token is 401', r.status === 401, r.body);

// ---- provisioning (§3.1) -----------------------------------------------

r = await call('/me', { token: alice });
check('first request provisions the user', r.status === 200 && r.body.email === `alice-${run}@example.com`, r.body);
const aliceId = r.body.id;

r = await call('/me', { token: alice });
check('second request reuses the same row', r.body.id === aliceId, { aliceId, got: r.body.id });

r = await call('/me', { token: bob });
check('a different subject gets a different user', r.body.id !== aliceId);

r = await call('/me', { method: 'PATCH', token: alice, body: { displayName: 'Alice O.' } });
check('PATCH /me updates displayName', r.body.displayName === 'Alice O.', r.body);

r = await call('/me', { method: 'PATCH', token: alice, body: { email: 'hacker@example.com' } });
check('PATCH /me rejects a body with no displayName', r.status === 400, r.body);

// ---- instruments (§6) --------------------------------------------------

r = await call('/instruments', { token: alice });
check('12 instruments are seeded', r.body.items.length === 12, r.body.items?.length);
check('isMeasured reaches the client as false', r.body.items.every((i: any) => i.isMeasured === false));
check('gateThreshold is a number, not a string', typeof r.body.items[0].gateThreshold === 'number');

r = await call('/me/instruments/voice_tenor', { method: 'PUT', token: alice, body: { isPrimary: true } });
check('adding an instrument as primary', r.status === 200 && r.body.isPrimary === true, r.body);

r = await call('/me/instruments/not_an_instrument', { method: 'PUT', token: alice, body: {} });
check('unknown instrument is 404', r.status === 404, r.body);

r = await call('/me/instruments/voice_tenor', { method: 'DELETE', token: alice });
check('removing the only instrument is 422', r.status === 422 && r.body.error.code === 'unprocessable', r.body);

await call('/me/instruments/guitar', { method: 'PUT', token: alice, body: { isPrimary: true } });
r = await call('/me', { token: alice });
const primaries = r.body.instruments.filter((i: any) => i.isPrimary);
check('setting a new primary clears the old one', primaries.length === 1 && primaries[0].instrumentId === 'guitar',
  r.body.instruments);

r = await call('/me/instruments/guitar', { method: 'DELETE', token: alice });
check('removing one of two instruments is 204', r.status === 204, r.body);

// ---- exercises (§7) ----------------------------------------------------

r = await call('/exercises?limit=5', { token: alice });
check('exercise list is paginated', r.body.items.length === 5 && r.body.nextCursor !== null, r.body.items?.length);
check('list omits noteSequence and returns noteCount', r.body.items[0].noteSequence === undefined
  && typeof r.body.items[0].noteCount === 'number', r.body.items[0]);

const cursor = r.body.nextCursor;
const firstPageIds = r.body.items.map((i: any) => i.id);
r = await call(`/exercises?limit=5&cursor=${encodeURIComponent(cursor)}`, { token: alice });
check('the next page does not repeat the first',
  r.body.items.every((i: any) => !firstPageIds.includes(i.id)), r.body.items?.length);

r = await call('/exercises?cursor=not-a-cursor', { token: alice });
check('a malformed cursor is rejected', r.status === 400, r.body);

r = await call('/exercises/c-major-five-note', { token: alice });
check('an exercise is fetchable by slug, with its sequence',
  r.body.slug === 'c-major-five-note' && r.body.noteSequence.notes.length === 9, r.body?.noteSequence?.notes?.length);
const exercise = r.body;

r = await call('/exercises?fits=bass', { token: alice });
check('fits= excludes exercises outside the range',
  r.body.items.length < 53 && r.body.items.every((i: any) => i.lowestMidi >= 34), r.body.items?.length);

// ---- courses and lessons (§15) -----------------------------------------

r = await call('/courses', { token: alice });
check('12 courses, all published', r.body.items.length === 12, r.body.items?.length);
check('course cards carry lesson counts', r.body.items.every((c: any) => c.lessonCount >= 8), r.body.items?.[0]);

r = await call('/courses/voice-tenor-starter', { token: alice });
check('course detail returns modules in order', r.body.modules.length === 3, r.body.modules?.length);
const allLessons = r.body.modules.flatMap((m: any) => m.lessons);
check('course detail omits lesson bodies', allLessons.every((l: any) => l.blocks === undefined));
check('the first lesson is unlocked, the second is not',
  allLessons[0].locked === false && allLessons[1].locked === true,
  allLessons.slice(0, 2).map((l: any) => l.locked));
check('nextLessonId is the first incomplete lesson', r.body.nextLessonId === allLessons[0].id);
const [lesson1, lesson2] = allLessons;

r = await call(`/lessons/${lesson2.id}`, { token: alice });
check('a locked lesson is refused', r.status === 403 && r.body.error.message.includes('lesson_locked'), r.body);

r = await call(`/lessons/${lesson1.id}`, { token: alice });
check('an unlocked lesson returns its blocks', Array.isArray(r.body.blocks) && r.body.blocks.length > 0);

r = await call(`/courses/${r.body.id ?? 'x'}/enroll`, { token: alice });
// enrol by course id
const courseDetail = await call('/courses/voice-tenor-starter', { token: alice });
r = await call(`/courses/${courseDetail.body.id}/enroll`, { method: 'POST', token: alice });
check('enrolling is 200', r.status === 200, r.body);
r = await call(`/courses/${courseDetail.body.id}/enroll`, { method: 'POST', token: alice });
check('re-enrolling is idempotent', r.status === 200, r.body);

// ---- completion rules --------------------------------------------------

r = await call(`/lessons/${lesson1.id}/complete`, { method: 'POST', token: alice });
check('a read lesson completes on self-report', r.body.state === 'complete', r.body);

r = await call(`/lessons/${lesson2.id}`, { token: alice });
check('completing lesson 1 unlocks lesson 2', r.status === 200, r.body?.error);

// Walk the course in order, as a learner must — a lesson cannot be reached
// until every earlier one is complete, so the test has to unlock its way in.
const detail = await call('/courses/voice-tenor-starter', { token: alice });
const lessons = detail.body.modules.flatMap((m: any) => m.lessons);
const quizLesson = lessons.find((l: any) => l.kind === 'quiz');
const exerciseLesson = lessons.find((l: any) => l.kind === 'exercise');

r = await call(`/lessons/${exerciseLesson.id}/complete`, { method: 'POST', token: alice });
check('an exercise lesson refuses self-reported completion',
  r.status === 422 && r.body.error.message.includes('completion_not_self_reportable'), r.body);

// Lesson 2 is a self-reported drill; completing it unlocks the first exercise.
const drill = lessons.find((l: any) => l.kind === 'drill');
await call(`/lessons/${drill.id}/complete`, { method: 'POST', token: alice });
r = await call(`/lessons/${exerciseLesson.id}`, { token: alice });
check('completing the drill unlocks the exercise lesson', r.status === 200, r.body?.error);

// ---- attempts (§8) -----------------------------------------------------

const notes = exercise.noteSequence.notes as Array<{ midi: number }>;
const perfect = notes.map((n, index) => ({
  index, targetMidi: n.midi, detectedHz: 440 * Math.pow(2, (n.midi - 69) / 12),
  centsOff: 0, msOff: null, coverage: 1, band: 'green' as const,
}));

const attemptId = uuid();
const attemptBody = {
  id: attemptId, exerciseId: exercise.id, instrumentId: 'voice_tenor',
  startedAt: new Date().toISOString(), durationMs: 6670,
  engineVersion: 'mpm-1.0-w2048-h512-median5', inputSource: 'audio',
  rhythmScored: false, noteResults: { version: 1, results: perfect },
};

r = await call('/attempts', { method: 'POST', token: alice, body: attemptBody });
check('a perfect attempt is 201 and scores 100', r.status === 201 && r.body.overallScore === 100, r.body);
check('the server computed the summary', r.body.notesOnPitch === 9 && r.body.notesTotal === 9, r.body);

r = await call('/attempts', { method: 'POST', token: alice, body: attemptBody });
check('re-posting the same id is an idempotent 200', r.status === 200 && r.body.id === attemptId, r.status);

r = await call('/attempts', { method: 'POST', token: alice, body: { ...attemptBody, id: uuid(), engineVersion: '' } });
check('a missing engineVersion is rejected', r.status === 400
  && r.body.error.details.some((d: any) => d.path === 'engineVersion'), r.body?.error);

r = await call('/attempts', {
  method: 'POST', token: alice,
  body: { ...attemptBody, id: uuid(), noteResults: { version: 1, results: [{ ...perfect[0], targetMidi: 99 }] } },
});
check('results for the wrong exercise are rejected', r.status === 400
  && r.body.error.details.some((d: any) => d.path.includes('targetMidi')), r.body?.error);

r = await call('/attempts', {
  method: 'POST', token: alice,
  body: { ...attemptBody, id: uuid(), rhythmScored: false,
          noteResults: { version: 1, results: [{ ...perfect[0], msOff: 12 }] } },
});
check('msOff must be null when rhythm is not scored', r.status === 400, r.body?.error);

r = await call('/attempts', { token: alice });
check('attempt list omits noteResults', r.body.items.length >= 1 && r.body.items[0].noteResults === undefined);

r = await call(`/attempts/${attemptId}`, { token: alice });
check('a single attempt includes noteResults', r.body.noteResults.results.length === 9);

r = await call(`/attempts/${attemptId}`, { token: bob });
check("another user's attempt is 404, not 403", r.status === 404, r.status);

r = await call('/attempts', { token: bob });
check("bob sees none of alice's attempts", r.body.items.length === 0, r.body.items?.length);

// ---- attempt completing a lesson (§15.8) -------------------------------

const lessonExercise = await call(`/lessons/${exerciseLesson.id}`, { token: alice });
const le = lessonExercise.body.exercise;
const leNotes = le.noteSequence.notes as Array<{ midi: number }>;
const lePerfect = leNotes.map((n, index) => ({
  index, targetMidi: n.midi, detectedHz: 440 * Math.pow(2, (n.midi - 69) / 12),
  centsOff: 0, msOff: null, coverage: 1, band: 'green' as const,
}));

r = await call('/attempts', {
  method: 'POST', token: alice,
  body: { id: uuid(), exerciseId: le.id, instrumentId: 'voice_tenor',
          startedAt: new Date().toISOString(), durationMs: 5000,
          engineVersion: 'mpm-1.0-w2048-h512-median5', inputSource: 'audio',
          rhythmScored: false, lessonId: exerciseLesson.id,
          noteResults: { version: 1, results: lePerfect } },
});
check('an attempt inside a lesson completes it', r.body.lessonProgress?.state === 'complete', r.body?.lessonProgress);

r = await call('/attempts', {
  method: 'POST', token: alice,
  body: { id: uuid(), exerciseId: exercise.id, instrumentId: 'voice_tenor',
          startedAt: new Date().toISOString(), durationMs: 5000,
          engineVersion: 'mpm-1.0-w2048-h512-median5', inputSource: 'audio',
          rhythmScored: false, lessonId: exerciseLesson.id,
          noteResults: { version: 1, results: perfect } },
});
check('an attempt for the wrong exercise is refused by the lesson',
  r.status === 422 && r.body.error.message.includes('lesson_exercise_mismatch'), r.body?.error);

// ---- quiz (§15.4, §15.5) ------------------------------------------------

r = await call(`/lessons/${quizLesson.id}`, { token: alice });
check('the quiz unlocks once the exercise lesson is complete', r.status === 200, r.body?.error);
const quiz = r.body.quiz;
check('quiz questions ship without their answers',
  quiz.questions.every((q: any) => q.answerIndex === undefined && q.explain === undefined), quiz?.questions?.[0]);

r = await call(`/lessons/${quizLesson.id}/quiz`, {
  method: 'POST', token: alice,
  body: { answers: quiz.questions.map((q: any) => ({ questionId: q.id, choiceIndex: 1 })) },
});
check('a wrong submission returns explanations', r.body.results.every((x: any) => x.explain), r.body?.results?.[0]);
check('a wrong submission does not complete the lesson', r.body.progress.state === 'in_progress', r.body?.progress);

r = await call(`/lessons/${quizLesson.id}/quiz`, {
  method: 'POST', token: alice,
  body: { answers: r.body.results.map((x: any) => ({ questionId: x.questionId, choiceIndex: x.answerIndex })) },
});
check('a correct submission passes and completes', r.body.passed === true && r.body.progress.state === 'complete',
  r.body?.progress);

r = await call(`/lessons/${quizLesson.id}/quiz`, {
  method: 'POST', token: alice,
  body: { answers: quiz.questions.map((q: any) => ({ questionId: q.id, choiceIndex: 1 })) },
});
check('a later worse attempt does not un-complete the lesson', r.body.progress.state === 'complete', r.body?.progress);

// ---- misc ---------------------------------------------------------------

r = await call('/nope', { token: alice });
check('an unknown endpoint is 404', r.status === 404, r.status);

console.log(`\n${failures === 0 ? 'All' : `${failures} FAILED —`} API checks complete.`);
if (failures > 0) throw new Error(`${failures} API check(s) failed`);
