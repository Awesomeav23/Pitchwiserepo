# API_SPEC.md

**Project:** Pitchwise
**Status:** Draft v1.0
**Last updated:** 2026-09-15

The HTTP contract between the React client and the Node/Express backend (ADR-009).

Related: `DATA_MODEL.md` defines every persisted shape referenced here — this document
does not redefine them. `TECH_DECISIONS.md` ADR-001 (client-side audio), ADR-006 (managed
auth), ADR-009 (Node/Express). `REQUIREMENTS.md` §4 lists the user stories each endpoint
serves.

---

## 1. Scope

The backend is an ordinary CRUD API. Per ADR-001 all audio capture and pitch analysis
happen in the browser, so there is no signal processing on the server, no upload path, and
no audio storage. The API carries derived numbers only.

**There is deliberately no audio endpoint.** No multipart route, no blob column, no
presigned upload. This is a permanent property of the design, not a v1 omission — if a
future change needs server-side re-analysis, it supersedes ADR-001 and belongs in an ADR,
not in a new route.

| Serves | Endpoints |
|---|---|
| US-01 account, primary instrument | §5 `/me`, §6 `/instruments` |
| US-02 browse exercises | §7 `/exercises` |
| US-06 scorecard | §8 `POST /attempts` response |
| US-07 attempt history | §8 `GET /attempts` |
| US-03/04/05/08 live feedback, tuner | *no API* — entirely client-side |

That last row is the point of ADR-001: the part of the product a user actually looks at
does not touch the network.

---

## 2. Conventions

| | |
|---|---|
| Base path | `/api/v1` |
| Content type | `application/json; charset=utf-8` |
| Casing | `camelCase` in JSON; the database uses `snake_case` (`DATA_MODEL.md` §3). The mapping happens in the repository layer, not in SQL aliases |
| Timestamps | ISO 8601, UTC, milliseconds — `2026-09-13T14:22:31.004Z` |
| Identifiers | UUID v4 as strings. `instruments` and `exercise_types` use their text slugs |
| Durations | Integer milliseconds, never seconds or beats (`DATA_MODEL.md` §1) |
| Pitch | MIDI note numbers for targets, Hz for detections, cents for deviation |
| Empty collections | `{ "items": [] }` with `200`, never `404` |

**Versioning.** The path carries `v1` from the first commit. The cost is one path segment;
the cost of adding it later, once a deployed client depends on unversioned paths, is a
coordinated release. Note that `note_sequence` and `note_results` carry their *own*
`version` field inside the JSONB — those version the payload shape and move independently
of the HTTP surface.

---

## 3. Authentication

Every endpoint except `/healthz` requires a bearer token issued by the managed auth
provider (ADR-006).

```
Authorization: Bearer <provider JWT>
```

The backend validates the signature against the provider's JWKS, checks `exp`, `iss` and
`aud`, and reads the subject claim. It never accepts a user id from the request body or
path as proof of identity — ownership is always derived from the token.

**There is no signup, login, logout, or password endpoint.** The provider owns those
flows; adding our own would recreate exactly what ADR-006 chose to avoid.

### 3.1 Implicit user provisioning

There is no `POST /users`. On the first authenticated request from an unseen subject, the
backend inserts a `users` row from the token claims:

| Column | Source |
|---|---|
| `auth_provider_id` | `sub` |
| `email` | `email` |
| `display_name` | `name`, when present |

Provisioning is an upsert on `auth_provider_id`, which is `UNIQUE`, so concurrent first
requests cannot create duplicates. `email` and `display_name` are refreshed on each
request if the token disagrees with the stored row, so a change made at the provider
propagates without a sync job.

The alternative — a client-called `POST /users/register` after sign-up — has a failure
mode where the provider account exists but the row does not, leaving an authenticated user
the API cannot serve. Deriving the row from the token makes that state unrepresentable.

---

## 4. Errors

```jsonc
{
  "error": {
    "code": "validation_failed",
    "message": "note_results is not consistent with the exercise",
    "details": [
      { "path": "results[7].index", "message": "index 7 is outside the exercise's 5 notes" }
    ]
  }
}
```

`message` is for the developer reading logs. `details` is present only for
`validation_failed`. The client is expected to render its own copy, not surface `message`
to a musician mid-practice.

| Status | `code` | When |
|---|---|---|
| `400` | `malformed_json` | Body is not parseable JSON |
| `400` | `validation_failed` | Body parsed but violates §9 |
| `401` | `unauthenticated` | Missing, expired, or unverifiable token |
| `403` | `forbidden` | Authenticated, but the row belongs to another user |
| `404` | `not_found` | No such row, **or** a row this user may not see |
| `409` | `conflict` | Unique constraint violation |
| `413` | `payload_too_large` | Body over 256 KB |
| `422` | `unprocessable` | Well-formed and internally valid, but rejected by a domain rule |
| `429` | `rate_limited` | See §11 |
| `500` | `internal_error` | Unhandled. Never echoes a database message |

**`403` vs `404`.** Requesting another user's attempt returns `404`, not `403`. A `403`
confirms the row exists, which leaks the existence of other users' data. `403` is reserved
for cases where the client already provably knows the row exists.

---

## 5. Current user

### `GET /api/v1/me`

Returns the profile and instrument selection. Provisions the user if this is their first
request (§3.1).

```jsonc
{
  "id": "8f14e45f-ceea-467a-9a43-3f6c0d4c8b21",
  "email": "avnish@example.com",
  "displayName": "Avnish",
  "createdAt": "2026-09-13T14:22:31.004Z",
  "instruments": [
    { "instrumentId": "voice_tenor", "isPrimary": true,  "addedAt": "2026-09-13T14:22:31.004Z" },
    { "instrumentId": "guitar",      "isPrimary": false, "addedAt": "2026-09-13T14:25:02.118Z" }
  ]
}
```

`instruments` is embedded rather than requiring a second call: the client needs the
primary instrument before it can configure the audio engine at all, and it is at most a
handful of rows.

### `PATCH /api/v1/me`

Body: `{ "displayName": "Avnish O." }`. Only `displayName` is writable — `email` and
`authProviderId` are owned by the provider and a write here would be silently overwritten
on the next request (§3.1).

---

## 6. Instruments

### `GET /api/v1/instruments`

The seeded catalog from `AUDIO_PIPELINE.md` §6. Public to any authenticated user; static
enough to cache for a day.

```jsonc
{
  "items": [
    {
      "id": "voice_tenor",
      "displayName": "Voice — tenor",
      "family": "voice",
      "fMinHz": 120.0,
      "fMaxHz": 550.0,
      "transpositionSemitones": 0,
      "gateThreshold": 0.01,
      "isMeasured": false
    }
  ]
}
```

**`isMeasured` must reach the client.** It is `false` until the spike measures that
instrument, and `gateThreshold` is then a placeholder, not a tuned value. The client is
expected to surface this — an unmeasured profile will gate badly in a quiet or loud room,
and a user who is told that will adjust rather than conclude the product is broken.
Hiding the flag would let seed data masquerade as measurement, which is the exact failure
`DATA_MODEL.md` §3.2 added the column to prevent.

`transpositionSemitones` is for notation display only and must never be applied to a
detected frequency (ADR-010).

### `PUT /api/v1/me/instruments/:instrumentId`

Adds the instrument to the user, or updates it. Body: `{ "isPrimary": true }`.

Setting `isPrimary: true` clears the flag on the user's other rows **in the same
transaction**. The partial unique index `idx_one_primary_instrument` will otherwise reject
the write, and doing it in two statements leaves a window where the user has none.

`PUT` rather than `POST` because the operation is idempotent on `(user, instrument)`,
which is the table's primary key.

### `DELETE /api/v1/me/instruments/:instrumentId`

`204` on success. Returns `422 unprocessable` when removing the user's only instrument —
the client cannot configure the engine without one, and an empty selection is a state the
practice screen has no sensible rendering for.

Past attempts keep their `instrument_id`: `attempts.instrument_id` references
`instruments`, not `user_instruments`, so history survives a user dropping an instrument.

---

## 7. Exercises

Read-only in v1. There is no `POST /exercises` — the library is seeded
(`DATA_MODEL.md` §6.2) and authored by a build-time script (ADR-011). Custom exercises are
US-12, post-MVP.

### `GET /api/v1/exercises`

| Query | Type | Notes |
|---|---|---|
| `type` | slug | `scale`, `interval`, `warmup`, `arpeggio` |
| `difficulty` | 1–5 | Exact match |
| `fits` | instrument id | Only exercises inside that instrument's range — see below |
| `limit` | 1–100, default 50 | |
| `cursor` | opaque | §10 |

```jsonc
{
  "items": [
    {
      "id": "3d1f...",
      "slug": "c-major-five-note",
      "title": "C major, five notes",
      "description": "Five-note scale up and back.",
      "typeId": "scale",
      "difficulty": 1,
      "tempoBpm": 90,
      "timeSignature": "4/4",
      "lowestMidi": 60,
      "highestMidi": 67,
      "noteCount": 9,
      "durationMs": 6670
    }
  ],
  "nextCursor": null
}
```

The list omits `noteSequence` and returns `noteCount` and `durationMs` instead. A library
view needs to show length, not every note, and the sequences are the largest field in the
table.

**`fits` compares against the instrument's Hz range converted to MIDI**, then filters on
`lowest_midi >= floor` and `highest_midi <= ceiling`. Those two columns are denormalized
out of the JSONB precisely so this is an indexed integer comparison rather than a JSON
scan (`DATA_MODEL.md` §3.5), and `idx_exercises_range` covers it.

The conversion rounds *inward* — an exercise is excluded unless it fits entirely within
the playable range. A partially playable exercise scores badly through no fault of the
player, which reads as the tool being wrong.

### `GET /api/v1/exercises/:idOrSlug`

The full record including `noteSequence` exactly as stored (`DATA_MODEL.md` §4). Accepts
either the UUID or the slug, since `slug` is `UNIQUE` and slugs are what appear in URLs.

---

## 8. Attempts

### `POST /api/v1/attempts`

Submits one completed take. This is the only write of consequence in the API.

```jsonc
{
  "id": "b7c3e1a2-5d4f-4c8b-9e7a-1f2d3c4b5a69",
  "exerciseId": "3d1f...",
  "instrumentId": "voice_tenor",
  "startedAt": "2026-09-13T14:31:02.550Z",
  "durationMs": 6670,
  "engineVersion": "yin-1.0-median5",
  "rhythmScored": false,
  "noteResults": {
    "version": 1,
    "results": [
      { "index": 0, "targetMidi": 60, "detectedHz": 261.2, "centsOff": -2.6,
        "msOff": null, "coverage": 0.94, "band": "green" }
    ]
  }
}
```

**The client supplies `id`.** A take cannot be recreated — the audio is gone the moment
analysis ends (ADR-001), and the user physically performed it. A retry after a timeout
must not create a second row. The client generates a UUID before sending; re-`POST`ing the
same id returns `200` with the existing attempt instead of `201`, making submission safely
retryable. Without this, the honest failure mode is a duplicated attempt that quietly
skews the user's history.

**The client does not send scores.** `overallScore`, `notesOnPitch`, `notesAttempted`,
`meanAbsCents` and `notesTotal` are absent from the request and computed by the server
from `noteResults` using the formula in `DATA_MODEL.md` §5.1. Two reasons, and the second
matters more:

1. A client cannot be the authority on its own score.
2. The denormalized columns exist so history lists render without parsing the JSONB. If
   the client sent both, they could disagree, and the summary is what every list and graph
   reads. Deriving them server-side makes disagreement impossible.

`COVERAGE_THRESHOLD` lives in server config, not in the request, so it can be retuned
without a client release. Its value is still an open item (`DATA_MODEL.md` §10).

**`engineVersion` is required.** A request without it is rejected with `validation_failed`
rather than defaulted. Detection config will change as the median window and gate
thresholds are tuned, and an attempt whose engine is unknown cannot be honestly compared
with any other — it would show up as progress that is really a config change
(`DATA_MODEL.md` §3.6). Rejecting is better than storing an unfalsifiable row.

**Response** `201` (or `200` on idempotent replay) — the full attempt, which is exactly
the scorecard for US-06:

```jsonc
{
  "id": "b7c3e1a2-...",
  "exerciseId": "3d1f...",
  "instrumentId": "voice_tenor",
  "startedAt": "2026-09-13T14:31:02.550Z",
  "durationMs": 6670,
  "overallScore": 78,
  "meanAbsCents": 8.4,
  "notesOnPitch": 7,
  "notesAttempted": 8,
  "notesTotal": 9,
  "rhythmScored": false,
  "engineVersion": "yin-1.0-median5",
  "noteResults": { "version": 1, "results": [ "…" ] },
  "createdAt": "2026-09-13T14:31:09.882Z"
}
```

### `GET /api/v1/attempts`

| Query | Notes |
|---|---|
| `exerciseId` | Filter to one exercise — the per-exercise history in US-07 |
| `limit` | 1–100, default 20 |
| `cursor` | §10 |

Always scoped to the authenticated user; there is no parameter to request another user's
attempts. Ordered `createdAt DESC`, served by `idx_attempts_user_created` and
`idx_attempts_user_exercise`, which are the only two access patterns v1 has.

Rows here are **summary only** — no `noteResults`. A history list shows score and date; it
does not need every note, and including the JSONB would make the list response an order of
magnitude larger for data nothing renders.

### `GET /api/v1/attempts/:id`

The full attempt including `noteResults`. `404` if it belongs to another user (§4).

### `DELETE /api/v1/attempts/:id`

`204`. A user can remove a take they would rather not keep. Hard delete — `DATA_MODEL.md`
§9 records soft deletes as deliberately not built, and there is no recovery requirement.

---

## 9. Validation

Postgres cannot check JSONB shape (`DATA_MODEL.md` §4), so the API layer is the only place
these hold. All of them reject with `400 validation_failed`.

**`noteResults`**

- `version` equals `1`
- `results` is non-empty
- every `index` is an integer within the target exercise's `notes` array
- no duplicate `index`
- `targetMidi` equals the exercise's note at that index — a mismatch means the client
  scored against a different or stale exercise, and storing it would produce a scorecard
  that disagrees with the exercise it claims to be for
- `coverage` is within `0…1`
- `centsOff` is `null` exactly when `detectedHz` is `null`
- `msOff` is `null` for every result when `rhythmScored` is `false`
- `band` is one of `green` / `amber` / `red` / `missed`

**Attempt**

- `exerciseId` and `instrumentId` exist
- `durationMs` is positive and under one hour
- `startedAt` is not in the future by more than one minute, allowing for clock skew
- `engineVersion` is present and non-empty

**Not validated:** that `band` agrees with `centsOff`, and that `detectedHz` is plausible
for `targetMidi`. The server recomputes the summary from `centsOff` and `coverage`
regardless, so a wrong `band` is cosmetic in a payload the client authored for itself.
Recomputing every band server-side would duplicate Stage G in two languages for no gain.

---

## 10. Pagination

Cursor-based, on `(created_at, id)`:

```
GET /api/v1/attempts?limit=20
→ { "items": [ … ], "nextCursor": "eyJjIjoiMjAyNi0wOS0xM1QxNDozMTowOS44ODJaIiwiaSI6ImI3YzNlMWEyIn0" }

GET /api/v1/attempts?limit=20&cursor=eyJjIjoi…
```

`nextCursor` is `null` on the last page. The cursor is an opaque base64 object; clients
must not construct or parse it.

Offset pagination would be simpler and is wrong here: attempts are inserted continuously
at the head of the same list a user is scrolling, so `OFFSET 20` after a new attempt
re-shows a row from page one. Cursors are stable under insertion, and the tiebreak on `id`
keeps ordering total when two attempts share a timestamp.

---

## 11. Rate limits, size, CORS

| | |
|---|---|
| Read endpoints | 120 requests/minute per user |
| `POST /attempts` | 30 per minute per user |
| Body limit | 256 KB — a 60-note attempt is a few KB; the cap is a floor under abuse, not a real constraint |
| CORS | The deployed client origin and `http://localhost:5173`. Credentials not required — the token is a bearer header, not a cookie |

Exceeding a limit returns `429` with `Retry-After` in seconds.

---

## 12. Health

### `GET /api/v1/healthz`

Unauthenticated. `200` with `{ "status": "ok", "db": "ok" }`, or `503` with
`"db": "unreachable"`. Checks database connectivity, because the process being alive while
Postgres is unreachable is the failure that matters on a free tier where databases sleep.

---

## 13. Not in v1

Listed so their absence is legible as a decision rather than an oversight.

| Endpoint | Why not | Trigger |
|---|---|---|
| `POST /exercises` | Library is seeded; ADR-011 | US-12, custom exercises |
| `GET /me/progress` | Aggregates are cut list item 3 (`REQUIREMENTS.md` §9) | US-11 |
| Teacher / student routes | Post-MVP | US-13 |
| Any audio upload | ADR-001 — permanent, not deferred | Would supersede ADR-001 |
| `PATCH /attempts/:id` | Attempts are immutable records of a performance | — |
| WebSocket / SSE | Live feedback never leaves the browser | — |

---

## 14. Open Items

- [ ] Provider choice, Clerk or Auth0 (ADR-006 leaves it open). Changes the JWKS URL and
      claim names in §3.1, nothing else in this document
- [ ] `COVERAGE_THRESHOLD` server config value — tracked in `DATA_MODEL.md` §10
- [ ] Whether `GET /exercises` should default to `fits=<primary instrument>` rather than
      returning everything. Better default, but hides content; decide after the library
      has more than five entries
- [ ] Rhythm scoring changes the score blend (`DATA_MODEL.md` §5.1). `rhythmScored` is
      already in the payload, so enabling it needs no shape change

---

## 15. Courses, Lessons and Progress

Added by **ADR-012**. Model in `LEARNING_PLATFORM.md`; schema in `DATA_MODEL.md` §11.

Content is read-only, like exercises — courses are seeded by a build-time generator
(`DATA_MODEL.md` §11.9), not authored through the API. The only writes are enrollment,
quiz submission, and lesson completion for the two self-reported kinds.

**Progress is computed server-side.** For `attempt_score` and `quiz_pass` lessons the
client has no completion endpoint at all; it posts an attempt or a quiz submission and the
server decides. A client able to declare its own completion makes progress advisory.

### 15.1 `GET /api/v1/courses`

| Query | Type | Notes |
|---|---|---|
| `instrument` | instrument id | Courses for that instrument |
| `mine` | boolean | Only courses for the user's `user_instruments` |
| `limit` | 1–100, default 50 | |
| `cursor` | opaque | §10 |

```jsonc
{
  "items": [
    {
      "id": "9a2c...",
      "slug": "guitar-starter",
      "title": "Guitar — starter course",
      "summary": "Hold it, tune it, and play your first melody.",
      "instrumentId": "guitar",
      "level": 1,
      "lessonCount": 9,
      "estimatedMinutes": 75,
      "progress": { "completedLessons": 3, "state": "in_progress" }
    }
  ],
  "nextCursor": null
}
```

Unpublished courses (`is_published = false`) are omitted entirely. `progress` is `null`
when the user is not enrolled.

`lessonCount` and `estimatedMinutes` are aggregated per request rather than denormalized.
Twelve courses of nine lessons is not a query worth a summary column; revisit if the
catalog grows past a few hundred lessons, not before.

### 15.2 `GET /api/v1/courses/:idOrSlug`

The full outline: modules in order, lessons in order, and this user's progress on each.
One request renders the whole course-detail screen.

```jsonc
{
  "id": "9a2c...",
  "slug": "guitar-starter",
  "title": "Guitar — starter course",
  "instrumentId": "guitar",
  "enrolled": true,
  "nextLessonId": "4f81...",
  "modules": [
    {
      "id": "1b0e...",
      "title": "Getting started",
      "lessons": [
        {
          "id": "2c93...",
          "slug": "guitar-starter-meet-your-instrument",
          "title": "Meet your instrument",
          "kind": "content",
          "estimatedMinutes": 8,
          "completionRule": { "kind": "read" },
          "locked": false,
          "progress": { "state": "complete", "completedAt": "2026-09-14T09:12:00.000Z" }
        },
        {
          "id": "4f81...",
          "slug": "guitar-starter-first-three-notes",
          "title": "Your first three notes",
          "kind": "exercise",
          "exerciseId": "3d1f...",
          "completionRule": { "kind": "attempt_score", "minScore": 70 },
          "locked": false,
          "progress": null
        }
      ]
    }
  ]
}
```

Lesson **bodies are omitted here** — blocks and quiz questions are the largest fields and
the outline screen renders none of them. Fetch one lesson at a time (§15.3).

`locked` is computed, not stored: a lesson is locked when any earlier lesson in the course
is incomplete. `nextLessonId` is the first incomplete lesson, derived the same way — which
is why `user_course_enrollment` stores no pointer (`DATA_MODEL.md` §11.4).

### 15.3 `GET /api/v1/lessons/:idOrSlug`

One lesson with its payload. Returns `423 Locked` with error code `lesson_locked` if an
earlier lesson in the course is incomplete.

For `kind: 'content'` and `'drill'`, `body` is the block array
(`LEARNING_PLATFORM.md` §5). For `kind: 'exercise'`, the response embeds the full exercise
record including `noteSequence`, so the practice screen needs no second request. For
`kind: 'quiz'`, see below.

### 15.4 Quiz questions omit their answers

A quiz lesson returns questions with `answerIndex` and `explain` **stripped**:

```jsonc
{
  "kind": "quiz",
  "quiz": {
    "version": 1,
    "passFraction": 0.8,
    "questions": [
      {
        "id": "q1",
        "prompt": "Which note is this?",
        "kind": "choice",
        "diagram": "staff-treble-c4",
        "choices": ["C4", "E4", "G4", "A4"]
      }
    ]
  }
}
```

Shipping `answerIndex` to the client would make the quiz decorative — anyone reading the
network tab has the key. The stripping happens in the serializer, not the query, and it is
the one place in this API where a response is a deliberate subset of a stored JSONB
document.

### 15.5 `POST /api/v1/lessons/:id/quiz`

```jsonc
{ "answers": [ { "questionId": "q1", "choiceIndex": 0 } ] }
```

Response grades every question and returns the explanations that were withheld:

```jsonc
{
  "fraction": 0.8,
  "passed": true,
  "results": [
    { "questionId": "q1", "correct": true, "answerIndex": 0,
      "explain": "Middle C sits on the first ledger line below the treble staff." }
  ],
  "progress": { "state": "complete", "completedAt": "2026-09-15T10:04:11.000Z" }
}
```

Grading is server-side against the stored `quiz` JSONB. `quiz_fraction` on
`user_lesson_progress` keeps the **best** result; resubmission is allowed and a worse
score does not overwrite a better one, nor un-complete the lesson.

Unanswered questions are graded incorrect rather than rejected. A partial submission is a
failed attempt, not a validation error.

### 15.6 `POST /api/v1/lessons/:id/complete`

Valid **only** where `completion_rule.kind` is `read` or `self_report`. Any other kind
returns `422` with code `completion_not_self_reportable`.

This is the narrow, deliberate exception to server-evaluated progress: there is no signal
for "the user read this" or "the user practised their chord" other than the user saying
so, and `LEARNING_PLATFORM.md` §2 requires those lessons be honest about not being graded.

Idempotent. Completing an already-complete lesson returns the existing row unchanged.

### 15.7 `POST /api/v1/courses/:id/enroll`

Creates the `user_course_enrollment` row. Idempotent — re-enrolling returns the existing
row and does not reset progress. There is no unenroll in v1; deleting progress a user
worked for is not a feature worth building by default.

### 15.8 Change to `POST /api/v1/attempts`

One new optional field, and one new required one:

| Field | Type | Notes |
|---|---|---|
| `lessonId` | uuid, optional | When the take was made inside a lesson |
| `inputSource` | `audio` \| `midi` | **Required.** `audio` for every client today (ADR-013) |

When `lessonId` is present the server validates that the lesson's `exercise_id` matches
the attempt's `exerciseId`, evaluates the lesson's `completion_rule`, and returns the
resulting progress alongside the attempt:

```jsonc
{
  "id": "b7c3...",
  "overallScore": 82,
  "lessonProgress": { "state": "complete", "completedAt": "2026-09-15T10:22:41.000Z" }
}
```

A mismatch between `lessonId` and `exerciseId` is `422` `lesson_exercise_mismatch`, not a
silent ignore — it means the client sent a take from a different exercise than the lesson
it claims.

Attempts without a `lessonId` are unchanged and still valid: the exercise library and
tuner mode both exist outside any course.

### 15.9 Not in this layer

| Item | Why |
|---|---|
| Course authoring endpoints | Seeded by generator, ADR-011 / `DATA_MODEL.md` §11.9 |
| Unenrolling, resetting progress | §15.7 |
| Teacher assignment of courses | US-13, post-MVP |
| Free-text quiz answers | `LEARNING_PLATFORM.md` §6 |
