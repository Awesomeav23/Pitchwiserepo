-- Core schema — DATA_MODEL.md §3, in the order §8 requires.
-- Requires pgcrypto for gen_random_uuid(), built in from Postgres 13.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_provider_id text NOT NULL UNIQUE,
  email            text NOT NULL,
  display_name     text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_auth_provider ON users (auth_provider_id);

-- Detection configuration, not content. Changing a row here changes engine
-- behaviour, so it is treated as code (DATA_MODEL §3.2).
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

CREATE TABLE user_instruments (
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instrument_id text NOT NULL REFERENCES instruments(id),
  is_primary    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, instrument_id)
);

-- One primary per user, enforced in the database rather than in application code.
CREATE UNIQUE INDEX idx_one_primary_instrument
  ON user_instruments (user_id) WHERE is_primary;

CREATE TABLE exercise_types (
  id           text PRIMARY KEY,
  display_name text NOT NULL,
  description  text
);

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

-- input_source is folded into the CREATE rather than added by the ALTER in
-- DATA_MODEL §11.7, which §11.8 permits because this schema has not been
-- applied anywhere yet.
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
  input_source    text NOT NULL DEFAULT 'audio' CHECK (input_source IN ('audio','midi')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- The only two access patterns v1 has (DATA_MODEL §3.6).
CREATE INDEX idx_attempts_user_created ON attempts (user_id, created_at DESC);
CREATE INDEX idx_attempts_user_exercise ON attempts (user_id, exercise_id, created_at DESC);
