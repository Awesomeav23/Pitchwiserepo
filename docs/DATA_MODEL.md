# DATA_MODEL.md

**Project:** Pitchwise
**Status:** Draft v1.0
**Last updated:** 2026-09-13

Resolves open question 1 in `MANIFEST.md`: **exercises are hand-authored JSON.** No MIDI
import in v1. Rationale is recorded as ADR-011 below and should be appended to
`TECH_DECISIONS.md`.

Related: `TECH_DECISIONS.md` ADR-005 (Postgres with JSONB), ADR-010 (instrument profiles);
`AUDIO_PIPELINE.md` §4 (runtime data shapes).

---

## 1. Design Principles

1. **Relational where it is relational.** Users, instruments, exercises, attempts have
   real foreign keys and benefit from constraints.
2. **JSONB where the payload is a whole unit.** Note sequences and per-note results are
   always read and written entire, never queried by individual note. A row per note would
   mean a join on every read for no benefit.
3. **Store MIDI note numbers, not Hz.** MIDI numbers are integers, exact, and transpose by
   addition. Hz is derived at runtime from the A4 reference. Storing Hz would bake the
   tuning reference into the data permanently.
4. **Store milliseconds, not ticks or beats.** The scoring layer works in ms against the
   audio clock. Storing beats would mean a tempo lookup on every comparison.
5. **No audio, ever.** Per ADR-001 audio never leaves the browser. Only derived numbers
   are persisted.

---

## 2. Entity Overview

```
   users
     │ 1
     │
     │ N
   user_instruments ───N──── 1 instruments
     │
     │ 1
     │ N
   attempts ────────────N──── 1 exercises
                                  │ N
                                  │
                                  │ 1
                              exercise_types
```

| Table | Rows expected | Purpose |
|---|---|---|
| `users` | small | Account, synced from auth provider |
| `instruments` | ~12, seeded | Static catalog with detection config |
| `user_instruments` | small | Which instruments a user plays; one marked primary |
| `exercise_types` | ~4, seeded | Scale / interval / warm-up / arpeggio |
| `exercises` | ~5 in v1 | Target note sequences |
| `attempts` | grows | One per recorded take |

---

## 3. Schema

### 3.1 `users`

Authentication is handled by a managed provider (ADR-006). This table holds only what the
application needs; it does not store passwords.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `auth_provider_id` | `text` | NOT NULL, UNIQUE | Subject claim from the provider JWT |
| `email` | `text` | NOT NULL | Synced from provider |
| `display_name` | `text` | | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

```sql
CREATE TABLE users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_provider_id text NOT NULL UNIQUE,
  email            text NOT NULL,
  display_name     text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_auth_provider ON users (auth_provider_id);
```

### 3.2 `instruments`

Seeded from the table in `AUDIO_PIPELINE.md` §6. This is the detection configuration —
changing a row here changes engine behavior, so treat it as code, not content.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `text` | PK | Slug: `voice_alto`, `trumpet_bb` |
| `display_name` | `text` | NOT NULL | |
| `family` | `text` | NOT NULL | `voice`, `woodwind`, `brass`, `strings`, `keys` |
| `f_min_hz` | `numeric(8,2)` | NOT NULL | Range clamp floor, AUDIO_PIPELINE Stage E |
| `f_max_hz` | `numeric(8,2)` | NOT NULL | Range clamp ceiling |
| `transposition_semitones` | `smallint` | NOT NULL, default 0 | **Notation display only** — never applied to detected Hz |
| `gate_threshold` | `numeric(6,5)` | NOT NULL | Linear RMS, Stage B. Seeded with a placeholder until measured |
| `is_measured` | `boolean` | NOT NULL, default false | False = `gate_threshold` is a guess, not a measurement |
| `sort_order` | `smallint` | NOT NULL, default 0 | |

```sql
CREATE TABLE instruments (
  id                      text PRIMARY KEY,
  display_name            text NOT NULL,
  family                  text NOT NULL,
  f_min_hz                numeric(8,2) NOT NULL,
  f_max_hz                numeric(8,2) NOT NULL,
  transposition_semitones smallint NOT NULL DEFAULT 0,
  gate_threshold          numeric(6,5) NOT NULL,
  is_measured             boolean NOT NULL DEFAULT false,
  sort_order              smallint NOT NULL DEFAULT 0,
  CONSTRAINT chk_range CHECK (f_max_hz > f_min_hz)
);
```

`is_measured` exists so the seed data cannot silently masquerade as tuned values. Every
row ships `false` and flips to `true` only after the spike measures that instrument.

### 3.3 `user_instruments`

| Column | Type | Constraints |
|---|---|---|
| `user_id` | `uuid` | FK → `users(id)` ON DELETE CASCADE |
| `instrument_id` | `text` | FK → `instruments(id)` |
| `is_primary` | `boolean` | NOT NULL, default false |
| `created_at` | `timestamptz` | NOT NULL, default `now()` |

```sql
CREATE TABLE user_instruments (
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instrument_id text NOT NULL REFERENCES instruments(id),
  is_primary    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, instrument_id)
);

-- At most one primary per user
CREATE UNIQUE INDEX idx_one_primary_instrument
  ON user_instruments (user_id) WHERE is_primary;
```

The partial unique index enforces the one-primary rule in the database rather than in
application code.

### 3.4 `exercise_types`

| Column | Type | Constraints |
|---|---|---|
| `id` | `text` | PK — `scale`, `interval`, `warmup`, `arpeggio` |
| `display_name` | `text` | NOT NULL |
| `description` | `text` | |

### 3.5 `exercises`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `slug` | `text` | NOT NULL, UNIQUE | `c-major-scale-ascending` |
| `title` | `text` | NOT NULL | |
| `description` | `text` | | |
| `type_id` | `text` | FK → `exercise_types(id)` | |
| `difficulty` | `smallint` | NOT NULL, CHECK 1–5 | |
| `tempo_bpm` | `smallint` | NOT NULL | Metronome tempo |
| `time_signature` | `text` | NOT NULL, default `'4/4'` | Display and count-in only |
| `lowest_midi` | `smallint` | NOT NULL | Denormalized from sequence, for filtering by range |
| `highest_midi` | `smallint` | NOT NULL | Denormalized |
| `note_sequence` | `jsonb` | NOT NULL | Shape in §4 |
| `created_by` | `uuid` | FK → `users(id)`, NULL for seeded | NULL = built-in |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

```sql
CREATE TABLE exercises (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           text NOT NULL UNIQUE,
  title          text NOT NULL,
  description    text,
  type_id        text NOT NULL REFERENCES exercise_types(id),
  difficulty     smallint NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  tempo_bpm      smallint NOT NULL CHECK (tempo_bpm BETWEEN 20 AND 300),
  time_signature text NOT NULL DEFAULT '4/4',
  lowest_midi    smallint NOT NULL,
  highest_midi   smallint NOT NULL,
  note_sequence  jsonb NOT NULL,
  created_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_midi_range CHECK (highest_midi >= lowest_midi)
);

CREATE INDEX idx_exercises_type ON exercises (type_id);
CREATE INDEX idx_exercises_range ON exercises (lowest_midi, highest_midi);
```

`lowest_midi` / `highest_midi` are denormalized out of the JSONB so that "exercises that
fit an alto's range" is an indexed integer comparison rather than a JSON scan. They must
be recomputed whenever `note_sequence` changes — enforce in the application layer, or add
a trigger if custom exercises (US-12) ever ship.

### 3.6 `attempts`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `user_id` | `uuid` | FK → `users(id)` ON DELETE CASCADE | |
| `exercise_id` | `uuid` | FK → `exercises(id)` ON DELETE CASCADE | |
| `instrument_id` | `text` | FK → `instruments(id)` | What they used *this* take |
| `started_at` | `timestamptz` | NOT NULL | |
| `duration_ms` | `integer` | NOT NULL | |
| `overall_score` | `smallint` | NOT NULL, CHECK 0–100 | Denormalized for history lists |
| `mean_abs_cents` | `numeric(6,2)` | | Mean absolute deviation across attempted notes |
| `notes_on_pitch` | `smallint` | NOT NULL | Within ±10 cents |
| `notes_attempted` | `smallint` | NOT NULL | Coverage above threshold |
| `notes_total` | `smallint` | NOT NULL | Denormalized from the exercise |
| `rhythm_scored` | `boolean` | NOT NULL, default false | False if timing scoring was cut or unavailable |
| `note_results` | `jsonb` | NOT NULL | Shape in §5 |
| `engine_version` | `text` | NOT NULL | e.g. `yin-1.0-median5` |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

```sql
CREATE TABLE attempts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id     uuid NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  instrument_id   text NOT NULL REFERENCES instruments(id),
  started_at      timestamptz NOT NULL,
  duration_ms     integer NOT NULL,
  overall_score   smallint NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  mean_abs_cents  numeric(6,2),
  notes_on_pitch  smallint NOT NULL,
  notes_attempted smallint NOT NULL,
  notes_total     smallint NOT NULL,
  rhythm_scored   boolean NOT NULL DEFAULT false,
  note_results    jsonb NOT NULL,
  engine_version  text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_attempts_user_created ON attempts (user_id, created_at DESC);
CREATE INDEX idx_attempts_user_exercise ON attempts (user_id, exercise_id, created_at DESC);
```

**`engine_version` matters more than it looks.** Detection config will change as you tune
the median window and gate thresholds. Without it, a score from week 2 is not comparable
to one from week 4 and progress graphs will show improvement that is actually a config
change. Bump it on any change to window size, hop, filter, or thresholds.

**The two summary indexes** cover the only two access patterns in v1: a user's recent
attempts, and a user's attempts on one exercise. The denormalized summary columns mean the
history list renders without ever parsing `note_results`.

---

## 4. `exercises.note_sequence` Shape

```jsonc
{
  "version": 1,
  "notes": [
    { "midi": 60, "startMs": 0,    "durationMs": 667 },
    { "midi": 62, "startMs": 667,  "durationMs": 667 }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `version` | integer | Schema version. Present from day one so a future change is not a guessing game |
| `notes[].midi` | integer 0–127 | Concert pitch. 60 = C4. Transposition is display-only |
| `notes[].startMs` | integer | Milliseconds from exercise start. First note is 0 |
| `notes[].durationMs` | integer | Sounding duration |

**Invariants** (enforced in application validation — Postgres will not check JSONB shape):

- `notes` is non-empty
- `startMs` values are non-decreasing
- No overlap: `notes[i].startMs + notes[i].durationMs <= notes[i+1].startMs`
- Non-overlap is what enforces monophony at the data level. A sequence that violates it is
  rejected at write time.

**Rests are implicit.** A gap between one note's end and the next note's start is a rest.
No rest objects — nothing scores against them.

### 4.1 Worked example — C major scale, ascending and descending

Nine notes, quarter notes at 90 bpm. At 90 bpm a quarter note is 60000 / 90 ≈ 667 ms.

```json
{
  "version": 1,
  "notes": [
    { "midi": 60, "startMs": 0,    "durationMs": 667 },
    { "midi": 62, "startMs": 667,  "durationMs": 667 },
    { "midi": 64, "startMs": 1334, "durationMs": 667 },
    { "midi": 65, "startMs": 2001, "durationMs": 667 },
    { "midi": 67, "startMs": 2668, "durationMs": 667 },
    { "midi": 65, "startMs": 3335, "durationMs": 667 },
    { "midi": 64, "startMs": 4002, "durationMs": 667 },
    { "midi": 62, "startMs": 4669, "durationMs": 667 },
    { "midi": 60, "startMs": 5336, "durationMs": 1334 }
  ]
}
```

MIDI 60, 62, 64, 65, 67 = C4, D4, E4, F4, G4 — a five-note scale up and back, final note
held for two beats. Total duration 6670 ms. `lowest_midi` = 60, `highest_midi` = 67.

### 4.2 Authoring helper

Per the decision in ADR-011, exercises are authored from a compact string rather than
typed as JSON by hand. Roughly 20 lines:

```
buildExercise("C4 D4 E4 F4 G4 F4 E4 D4 C4.", { bpm: 90, unit: "quarter" })
```

- Note names map to MIDI: `C4` → 60, `F#3` → 54, `Bb4` → 70
- `.` suffix doubles that note's duration
- `-` is a rest of one unit
- `startMs` accumulates; `lowest_midi` / `highest_midi` computed on the way

This is a build-time script that emits seed JSON. It is not an API endpoint and not part
of the running app.

---

## 5. `attempts.note_results` Shape

```jsonc
{
  "version": 1,
  "results": [
    {
      "index": 0,
      "targetMidi": 60,
      "detectedHz": 261.2,
      "centsOff": -2.6,
      "msOff": 14,
      "coverage": 0.94,
      "band": "green"
    },
    {
      "index": 3,
      "targetMidi": 65,
      "detectedHz": null,
      "centsOff": null,
      "msOff": null,
      "coverage": 0.08,
      "band": "missed"
    }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `index` | integer | Position in the exercise's `notes` array |
| `targetMidi` | integer | Copied from the target, so the result is readable standalone |
| `detectedHz` | number \| null | Median of voiced frames inside the note window. Null when not attempted |
| `centsOff` | number \| null | Signed. Negative = flat. Formula in `AUDIO_PIPELINE.md` Stage G |
| `msOff` | number \| null | Signed onset offset. Negative = early. Null when `rhythm_scored` is false |
| `coverage` | number 0–1 | Fraction of the note window that was voiced |
| `band` | enum | `green` / `amber` / `red` / `missed` |

**`coverage` carries real information.** A note with `coverage` 0.08 was not sung at all;
a note with coverage 0.95 and 40 cents off was sung wrong. Those are different feedback
messages and the scorecard should say so. Notes below a coverage threshold are `missed`
and excluded from `mean_abs_cents` — otherwise skipping notes would improve the average.

**Bands** come from the thresholds in `AUDIO_PIPELINE.md` Stage G: green within ±10 cents,
amber ±10 to ±25, red beyond ±25.

**Why the array is sparse-friendly.** `index` is stored explicitly rather than relying on
array position, so a result set that omits notes still reads correctly.

### 5.1 Scoring formula

```
attempted    = results where coverage >= COVERAGE_THRESHOLD (initial: 0.5)
onPitch      = attempted where |centsOff| <= 10
meanAbsCents = mean(|centsOff|) over attempted

pitchScore   = 100 × (onPitch / notesTotal)
```

Denominator is `notesTotal`, not `attempted` — skipping notes must lower the score.

When `rhythm_scored` is true, the overall score becomes a weighted blend; weights are
deferred until rhythm scoring is actually built, since it sits at position 2 on the cut
list in `REQUIREMENTS.md` §9.

`COVERAGE_THRESHOLD` is a tuning constant and belongs in the same config as the gate and
filter values. Record its final value here once set.

---

## 6. Seed Data

### 6.1 Exercise types

| id | display_name |
|---|---|
| `scale` | Scale |
| `interval` | Interval drill |
| `warmup` | Vocal warm-up |
| `arpeggio` | Arpeggio |

### 6.2 The five v1 exercises

| slug | title | type | difficulty | bpm | notes | range |
|---|---|---|---|---|---|---|
| `c-major-five-note` | C major, five notes | scale | 1 | 90 | 9 | C4–G4 |
| `c-major-octave` | C major scale, one octave | scale | 2 | 100 | 15 | C4–C5 |
| `seconds-and-thirds` | Seconds and thirds | interval | 2 | 80 | 12 | C4–A4 |
| `five-note-descending-warmup` | Descending five-note warm-up | warmup | 1 | 76 | 10 | G4–C4 |
| `major-triad-arpeggio` | Major triad arpeggio | arpeggio | 3 | 92 | 13 | C4–C5 |

All five are stepwise or small-interval by design — no octave leaps, per the median-filter
limitation in `AUDIO_PIPELINE.md` Stage F.

Ranges are written for a middle voice. Per-instrument transposed variants are a post-MVP
concern; `lowest_midi` / `highest_midi` exist to support that filtering when it comes.

---

## 7. ADR-011 — Hand-authored JSON exercises, no MIDI import

**Status:** Accepted · 2026-09-13
*(Append to `TECH_DECISIONS.md`.)*

**Context**
Exercises need a note-sequence source. Two options: parse standard MIDI files, or author
JSON by hand. MIDI parsing means variable-length quantities, tempo maps, delta ticks, and
multi-track handling — two to three days of work. The v1 library is five exercises
totaling under 60 notes.

**Decision**
Exercises are hand-authored. A small build-time helper (§4.2) converts a compact note
string into the JSON shape. No MIDI parsing in v1.

**Consequences**
- Two to three days redirected to the audio engine, which is the differentiating work.
- The schema stays minimal. A MIDI importer would have pushed tick/PPQ/tempo-event
  concepts into storage that the scoring layer never consumes.
- Avoids inheriting MIDI's polyphonic capabilities, which would then need detecting and
  rejecting — more work than not supporting them.
- Adding MIDI import later is additive: a separate module emitting this same shape. No
  schema migration required.
- Trade-off accepted: users cannot bring their own MIDI files. Irrelevant in v1, since
  custom exercises (US-12) are post-MVP anyway.
- Revisit if user-contributed exercises become a product goal.

---

## 8. Migration Order

Foreign keys dictate the sequence. Run in this order:

1. `users`
2. `instruments` *(seed immediately after, from `AUDIO_PIPELINE.md` §6, all `is_measured = false`)*
3. `user_instruments`
4. `exercise_types` *(seed)*
5. `exercises` *(seed the five)*
6. `attempts`

Requires the `pgcrypto` extension for `gen_random_uuid()`, or Postgres 13+ where it is
built in.

---

## 9. Deferred

Not built in v1. Listed so the schema's silence on them is deliberate rather than an
oversight.

| Item | Trigger to build |
|---|---|
| `practice_sessions` grouping attempts | When session-level stats are wanted |
| Teacher/student relation (US-13) | Post-MVP |
| `exercise_tags` | When the library outgrows browsing by type |
| Aggregate progress rollups | When the history query gets slow — not before |
| Soft deletes | Not needed; cascade is correct here |

---

## 10. Open Items

- [ ] `COVERAGE_THRESHOLD` final value — set during spike, record in §5.1
- [ ] Rhythm-vs-pitch score weighting — deferred until rhythm scoring is built
- [ ] Gate thresholds per instrument — all `[TBM]` in `AUDIO_PIPELINE.md` §6; flip
      `is_measured` as each is measured
