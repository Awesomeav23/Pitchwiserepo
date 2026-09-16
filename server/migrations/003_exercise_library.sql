-- Separates library content from course material.
--
-- The course generator emits a transposed variant of each exercise per
-- instrument (DATA_MODEL §11.9), so the table holds 5 authored exercises and 48
-- generated ones. Both are exercises and both are attempted, but only the
-- authored five are something to browse — a library listing all 53 shows twelve
-- near-identical copies of the same scale.
--
-- Recorded as a column rather than inferred from the slug, which would work
-- today and break the first time an exercise is named inconveniently.

ALTER TABLE exercises
  ADD COLUMN in_library boolean NOT NULL DEFAULT false;

-- Browsing the library is the only query that filters on this.
CREATE INDEX idx_exercises_library ON exercises (difficulty) WHERE in_library;
