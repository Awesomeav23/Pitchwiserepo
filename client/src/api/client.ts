/**
 * The single seam between the app and the API.
 *
 * Every screen talks through this and nothing else fetches directly, so the
 * things that change — the base URL, how a token is obtained, how an error
 * becomes a message — change in one file.
 */
import { getToken } from './session';
import type {
  ApiExercise, ApiExerciseSummary, ApiInstrument, Attempt, CourseCard, CourseOutline, LessonDetail,
  LessonProgress, Me, Page, QuizResult,
} from './types';

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787/api/v1';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Array<{ path: string; message: string }>;
  constructor(status: number, code: string, message: string, details?: Array<{ path: string; message: string }>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** True when the API is unreachable rather than returning an error — a
 *  different message, because "start the server" is the fix, not a retry. */
export class NetworkError extends Error {}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const bearer = await getToken();
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${bearer}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new NetworkError(`Could not reach the API at ${BASE}. Is the server running?`);
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const e = body?.error ?? {};
    // API_SPEC §4: `message` is for logs. The screens render their own copy;
    // this carries the code so they can decide what to say.
    throw new ApiError(res.status, e.code ?? 'internal_error', e.message ?? res.statusText, e.details);
  }
  return body as T;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  me: () => request<Me>('/me'),
  setDisplayName: (displayName: string) =>
    request<Me>('/me', { method: 'PATCH', body: JSON.stringify({ displayName }) }),

  instruments: () => request<Page<ApiInstrument>>('/instruments').then((p) => p.items),
  setInstrument: (instrumentId: string, isPrimary: boolean) =>
    request<{ instrumentId: string; isPrimary: boolean }>(`/me/instruments/${instrumentId}`,
      { method: 'PUT', body: JSON.stringify({ isPrimary }) }),
  removeInstrument: (instrumentId: string) =>
    request<void>(`/me/instruments/${instrumentId}`, { method: 'DELETE' }),

  /**
   * The browsable library by default — the five authored exercises. Pass
   * `all` to include the transposed course variants, which is only useful for
   * resolving a title for an attempt made inside a lesson.
   */
  exercises: (opts: { all?: boolean; type?: string; difficulty?: number;
                      fits?: string; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (opts.all) q.set('all', 'true');
    if (opts.type) q.set('type', opts.type);
    if (opts.difficulty) q.set('difficulty', String(opts.difficulty));
    if (opts.fits) q.set('fits', opts.fits);
    q.set('limit', String(opts.limit ?? 100));
    return request<Page<ApiExerciseSummary>>(`/exercises?${q}`).then((p) => p.items);
  },
  exercise: (idOrSlug: string) => request<ApiExercise>(`/exercises/${idOrSlug}`),

  courses: () => request<Page<CourseCard>>('/courses').then((p) => p.items),
  course: (idOrSlug: string) => request<CourseOutline>(`/courses/${idOrSlug}`),
  enroll: (courseId: string) => post<unknown>(`/courses/${courseId}/enroll`),

  lesson: (idOrSlug: string) => request<LessonDetail>(`/lessons/${idOrSlug}`),
  completeLesson: (lessonId: string) => post<LessonProgress>(`/lessons/${lessonId}/complete`),
  submitQuiz: (lessonId: string, answers: Array<{ questionId: string; choiceIndex: number }>) =>
    post<QuizResult>(`/lessons/${lessonId}/quiz`, { answers }),

  postAttempt: (attempt: Record<string, unknown>) => post<Attempt>('/attempts', attempt),

  /**
   * One page of attempts, newest first. Returns the whole page rather than its
   * items, because the cursor is how the next one is asked for — dropping it,
   * as this used to, made everything past the first page unreachable.
   */
  attempts: (opts: { exerciseId?: string; cursor?: string; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (opts.exerciseId) q.set('exerciseId', opts.exerciseId);
    if (opts.cursor) q.set('cursor', opts.cursor);
    if (opts.limit) q.set('limit', String(opts.limit));
    const query = q.toString();
    return request<Page<Attempt>>(`/attempts${query ? `?${query}` : ''}`);
  },

  attempt: (id: string) => request<Attempt>(`/attempts/${id}`),
  deleteAttempt: (id: string) => request<void>(`/attempts/${id}`, { method: 'DELETE' }),
};
