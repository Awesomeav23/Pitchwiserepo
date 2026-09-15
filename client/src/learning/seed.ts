/**
 * The course catalog: one starter course per instrument in the profile list,
 * all published.
 *
 * Every course is generated from the shared eight-lesson skeleton
 * (LEARNING_PLATFORM.md §4.1) plus the per-instrument override in content.ts —
 * the seed generator described in DATA_MODEL.md §11.9. Writing twelve courses
 * longhand would have meant twelve copies of the same five exercises and the
 * same staff lesson, drifting apart on the first correction nobody propagated.
 *
 * Order follows the instrument profile list, so the catalog and the tuner's
 * instrument picker agree.
 */
import { INSTRUMENT_PROFILES } from '../audio/profiles';
import { generateCourse } from './generate';
import { INSTRUMENT_COURSES } from './content';
import type { Course } from './types';

const byId = new Map(INSTRUMENT_COURSES.map((c) => [c.instrumentId, c]));

export const COURSES: Course[] = INSTRUMENT_PROFILES.map((profile) => {
  const override = byId.get(profile.id);
  if (!override) {
    // Every profile must have course content. A profile added without it is a
    // gap in the catalog, and failing at module load is how it gets noticed —
    // the alternative is a course that silently never appears.
    throw new Error(`No course content for instrument profile "${profile.id}"`);
  }
  // The course engraves at written pitch and the profile records the same
  // offset for the same reason. Two copies of one fact drift, so the course is
  // refused if they disagree rather than quietly engraving a transposing
  // instrument at the wrong pitch — which looks entirely plausible on a staff.
  if (override.notationShift !== profile.transpositionSemitones) {
    throw new Error(
      `Notation shift for "${profile.id}" is ${override.notationShift} but its profile ` +
      `says ${profile.transpositionSemitones} (AUDIO_PIPELINE §6: written minus sounding).`,
    );
  }
  return generateCourse(override);
});

export const courseBySlug = (slug: string): Course | undefined =>
  COURSES.find((c) => c.slug === slug);
