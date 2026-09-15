-- Learning layer — DATA_MODEL.md §11, in the order §11.8 requires.

CREATE TABLE courses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,
  title         text NOT NULL,
  summary       text,
  instrument_id text NOT NULL REFERENCES instruments(id),
  level         smallint NOT NULL CHECK (level BETWEEN 1 AND 5),
  is_published  boolean NOT NULL DEFAULT false,
  sort_order    smallint NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_courses_instrument ON courses (instrument_id) WHERE is_published;

CREATE TABLE modules (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id  uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title      text NOT NULL,
  sort_order smallint NOT NULL,
  UNIQUE (course_id, sort_order)
);

CREATE TABLE lessons (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id         uuid NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  slug              text NOT NULL UNIQUE,
  title             text NOT NULL,
  kind              text NOT NULL CHECK (kind IN ('content','exercise','quiz','drill')),
  sort_order        smallint NOT NULL,
  body              jsonb,
  quiz              jsonb,
  exercise_id       uuid REFERENCES exercises(id),
  completion_rule   jsonb NOT NULL,
  estimated_minutes smallint,
  UNIQUE (module_id, sort_order),
  -- The kind-to-payload rule lives here so a quiz lesson with no questions is
  -- not insertable. Without it the failure surfaces when a user opens it.
  CONSTRAINT chk_lesson_payload CHECK (
    (kind = 'exercise' AND exercise_id IS NOT NULL) OR
    (kind = 'quiz'     AND quiz IS NOT NULL)        OR
    (kind IN ('content','drill') AND body IS NOT NULL)
  )
);

CREATE INDEX idx_lessons_module ON lessons (module_id, sort_order);
CREATE INDEX idx_lessons_exercise ON lessons (exercise_id) WHERE exercise_id IS NOT NULL;

CREATE TABLE user_course_enrollment (
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id      uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  started_at     timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, course_id)
);

CREATE TABLE user_lesson_progress (
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id       uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  state           text NOT NULL CHECK (state IN ('in_progress','complete')),
  -- SET NULL, not CASCADE: deleting an attempt must not revoke a completed
  -- lesson. Completion is sticky (LEARNING_PLATFORM §7).
  best_attempt_id uuid REFERENCES attempts(id) ON DELETE SET NULL,
  quiz_fraction   numeric(4,3) CHECK (quiz_fraction BETWEEN 0 AND 1),
  completed_at    timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lesson_id),
  CONSTRAINT chk_completed_at CHECK (
    (state = 'complete'    AND completed_at IS NOT NULL) OR
    (state = 'in_progress' AND completed_at IS NULL)
  )
);

CREATE INDEX idx_progress_user ON user_lesson_progress (user_id, state);
