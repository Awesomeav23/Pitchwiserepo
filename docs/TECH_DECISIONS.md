# TECH_DECISIONS.md

**Project:** Pitchwise
**Format:** Architecture Decision Records — Context → Decision → Consequences
**Status:** Draft v1.0
**Last updated:** 2026-09-16

Each record is numbered and dated. Records are append-only: if a decision is reversed,
mark the original **Superseded** and write a new record rather than editing history.

---

## ADR-001 — Analyze audio client-side, not on the server

**Status:** Accepted · 2026-09-13

**Context**
Pitch feedback must feel instantaneous; a visible lag between singing a note and seeing
it appear breaks the practice loop entirely. Streaming raw audio to a server for analysis
adds a network round trip to every frame — tens of milliseconds at best, unpredictable at
worst. It also means user audio leaves the device, which creates a privacy and storage
burden disproportionate to a practice tool.

**Decision**
All audio capture and pitch analysis happens in the browser. The server never receives
audio. Only derived numeric results — detected frequencies, cents deviation, timing
offsets — are transmitted and persisted.

**Consequences**
- Latency budget is bounded by local processing only; no network variance.
- Privacy story is simple and true: audio never leaves the browser.
- No audio storage costs, no retention policy needed.
- Analysis quality is bounded by what runs in real time in a browser. Rules out
  heavyweight ML models.
- Server load is trivial; the backend is an ordinary CRUD API.
- Trade-off accepted: no server-side re-analysis of past attempts, since the audio is gone.

---

## ADR-002 — AudioWorklet, not ScriptProcessorNode

**Status:** Accepted · 2026-09-13

**Context**
Web Audio offers two routes for custom per-sample processing. `ScriptProcessorNode` is
the legacy API; it runs on the main thread, which means analysis competes with React
rendering and any layout work. Under load it produces audible glitches and inconsistent
timing. It has been deprecated for years. `AudioWorklet` runs processing on a dedicated
high-priority audio thread, isolated from the main thread.

**Decision**
Pitch detection runs inside an `AudioWorkletProcessor`. It communicates results to the
main thread via `port.postMessage`. The main thread only renders.

**Consequences**
- Analysis timing is stable and independent of UI work — this is the whole point.
- Meets the sub-50ms latency target in `REQUIREMENTS.md` §5.2.
- Higher learning cost: separate execution context, no DOM access, no direct imports,
  explicit message passing, manual ring buffering across 128-sample render quanta.
- Worklet code must be loaded as a separate module file, which complicates the build
  configuration.
- Budgeted as the single largest technical risk in week 1.

---

## ADR-003 — YIN autocorrelation, not FFT peak-picking

**Status:** Accepted · 2026-09-13

**Context**
Two broad approaches to monophonic pitch detection. FFT peak-picking finds the strongest
spectral bin — simple, but it fails on instruments with a weak fundamental and strong
overtones, and frequency resolution at low pitches is poor without large windows (which
cost latency). Autocorrelation methods compare the signal to time-shifted copies of
itself. YIN is a well-documented refinement of autocorrelation with a cumulative mean
normalized difference function, specifically designed to suppress the octave errors that
plague naive autocorrelation. It also reports an aperiodicity value usable as a
confidence signal.

Instrument timbre varies widely across our supported set — a flute is close to a pure
sine, a violin is harmonically rich, a plucked guitar string has a sharp attack and rapid
decay. The detector must handle all of these.

**Decision**
Use YIN (or a maintained implementation of it, e.g. Pitchy) for fundamental frequency
estimation.

**Consequences**
- Robust across the timbres in scope; does not depend on the fundamental being the
  loudest partial.
- Built-in aperiodicity/clarity value feeds the voicing decision — a free confidence gate.
- Still produces occasional octave errors, so the correction layer in ADR-004 remains
  necessary.
- Higher per-frame CPU cost than a bare FFT. Acceptable at our buffer sizes; to be
  confirmed against the CPU criterion in `REQUIREMENTS.md` §5.2.
- Guitar and piano attack transients will yield a few nonsense frames at note onset.
  Expected behavior, absorbed by smoothing.

---

## ADR-004 — Post-process with median filtering and amplitude gating

**Status:** Accepted · 2026-09-13

**Context**
Raw frame-by-frame pitch estimates are not directly presentable. Two failure modes
dominate. First, octave errors: a detector reports exactly half or double the true
frequency for isolated frames, producing violent jumps in the trace. Second, silence and
room noise: with no real signal present the detector still outputs *some* frequency,
which would render as a wandering line during rests.

**Decision**
Two post-processing stages between detection and display:
1. **Amplitude gate** — compute RMS per frame; below a per-instrument threshold, mark the
   frame unvoiced and emit no pitch.
2. **Median filter** — maintain a rolling window (initial value: 5 frames) over recent
   estimates; discard outliers that are approximately 2× or 0.5× the running median.

Both thresholds are tunable constants, with per-instrument overrides.

**Consequences**
- Trace is visually stable; isolated glitches disappear.
- Costs a small amount of latency equal to roughly half the filter window. Included in
  the latency budget in `AUDIO_PIPELINE.md` §7.
- Genuine fast octave leaps (a deliberate octave jump in an exercise) are slightly damped.
  Acceptable — exercises in v1 are stepwise and do not feature octave leaps.
- Introduces tuning constants that must be validated against real instruments, not only
  against synthesized tones.
- Rejected alternative: Kalman filtering. More principled, but more machinery than the
  problem justifies at this scope.

---

## ADR-005 — PostgreSQL, with JSONB for note sequences

**Status:** Accepted · 2026-09-13

**Context**
The data has two distinct shapes. Users, instruments, exercises, and attempts are
relational with clear foreign keys and benefit from constraints and joins. But two
payloads are variable-length nested structures: an exercise's target note sequence, and
an attempt's per-note result array. Modeling those as child tables means a row per note
and a join on every read, for data that is always read and written as a whole unit and
never queried by individual note.

**Decision**
PostgreSQL as the single datastore. Relational tables for entities; `JSONB` columns for
`exercises.note_sequence` and `attempts.note_results`.

**Consequences**
- Referential integrity where it matters; schema flexibility where the shape may evolve.
- Note sequences read and write in a single operation, no joins.
- `JSONB` still permits querying and indexing inside the document if aggregate analytics
  (US-11) later need it.
- Application-level validation is required for the JSON payloads, since the database will
  not enforce their internal shape. Shapes are specified in `DATA_MODEL.md` §4 and §5.
- Rejected MongoDB: the entity relationships are genuinely relational and the flexibility
  is only needed in two columns, which `JSONB` covers.

---

## ADR-006 — Managed authentication provider

**Status:** Accepted · 2026-09-13

**Context**
The project needs accounts so attempts persist per user. Hand-rolling auth means password
hashing, session or token management, reset flows, and email verification — several days
of work on a solved problem, with real security downside if done carelessly. That time
comes directly out of the audio engine, which is the part of this project worth building.
Auth appears on the protected list in `REQUIREMENTS.md` §9, so it cannot simply be cut.

**Decision**
Use a managed auth provider with a free tier (Clerk or Auth0). The backend validates the
provider's JWT on each request.

**Consequences**
- Days of effort redirected to the audio engine.
- Security posture better than a solo hand-rolled implementation.
- External dependency and vendor coupling; acceptable at this scope.
- Free-tier user limits are far beyond anything this project will reach.
- Trade-off accepted: hand-rolled JWT auth would demonstrate more backend breadth on a
  resume, but the differentiating work here is the DSP, not the login form.

---

## ADR-007 — React with TypeScript

**Status:** Accepted · 2026-09-13

**Context**
The frontend has meaningful state complexity: audio-engine lifecycle, permission states,
recording state, a high-frequency stream of pitch results, and scoring output. The pitch
data crossing the worklet boundary is structured and easy to get subtly wrong — units
(Hz vs cents vs MIDI note number) are exactly the kind of thing that produces silent bugs.

**Decision**
React with TypeScript. Strict mode enabled. Explicitly named types for the audio
boundary: `PitchFrame`, `NoteTarget`, `NoteResult`.

**Consequences**
- Unit confusion across the worklet boundary becomes a compile error rather than a
  wrong-looking graph.
- Shared type definitions between frontend and Node backend for API payloads.
- Small upfront cost typing the Web Audio and worklet interfaces.

---

## ADR-008 — Canvas for the pitch trace, SVG/VexFlow for notation

**Status:** Accepted · 2026-09-13

**Context**
The pitch trace updates at roughly 50 Hz and accumulates hundreds of points over a take.
Rendering that as DOM or SVG elements means hundreds of nodes mutating continuously,
which will not hold 60 fps. Notation, by contrast, is static once rendered and benefits
from being inspectable and accessible.

**Decision**
`<canvas>` for the live pitch-vs-time trace. VexFlow (SVG) for notation rendering, if
notation survives the cut list.

**Consequences**
- Trace rendering stays fast regardless of take length.
- Canvas content is not accessible or selectable; scorecard data is also presented in a
  DOM table, which covers this.
- Two rendering approaches in one app — justified by genuinely different requirements.

---

## ADR-009 — Node / Express backend

**Status:** Accepted · 2026-09-13

**Context**
The backend is an ordinary CRUD API: exercises, attempts, user profiles. There is no
server-side audio work (ADR-001), so there is no argument for Python's DSP ecosystem here.

**Decision**
Node with Express, TypeScript.

**Consequences**
- One language across the stack; API payload types are shared, not duplicated.
- Lower context-switching cost on a 5-week solo timeline.
- If server-side batch analysis is ever wanted, this choice would need revisiting. Not in
  scope.

---

## ADR-010 — Per-instrument configuration profiles

**Status:** Accepted · 2026-09-13

**Context**
The detection algorithm is instrument-agnostic — 440 Hz is 440 Hz regardless of source.
But three parameters genuinely vary by instrument, and getting them right materially
improves accuracy:
- **Frequency search range.** Bass guitar occupies roughly 41–400 Hz, violin roughly
  196–3000 Hz. Constraining the search range is the single cheapest reduction in octave
  errors available.
- **Transposition.** A Bb trumpet's written C sounds as Bb. Notation must shift; the
  detected frequency must not.
- **Noise gate threshold.** A flute into a laptop microphone is considerably quieter than
  a trumpet.

**Decision**
Store an instrument profile per user, holding these three values. Applied at engine
initialization.

**Consequences**
- Instrument selection at signup is functional, not cosmetic — worth stating in the UI.
- Adding an instrument is a data change, not a code change.
- Users who switch instruments must switch profiles; the profile is a user setting, not a
  fixed account property.
- Concrete per-instrument values live in `AUDIO_PIPELINE.md` §6, not here.

---

## ADR-011 — Hand-authored JSON exercises, no MIDI import

**Status:** Accepted · 2026-09-13

**Context**
Exercises need a note-sequence source. Two options: parse standard MIDI files, or author
JSON by hand. MIDI parsing means variable-length quantities, tempo maps, delta ticks, and
multi-track handling — two to three days of work. The v1 library is five exercises
totaling under 60 notes.

**Decision**
Exercises are hand-authored. A small build-time helper converts a compact note string into
the JSON shape. No MIDI parsing in v1. Full detail in `DATA_MODEL.md` §4.2 and §7.

**Consequences**
- Two to three days redirected to the audio engine, which is the differentiating work.
- The schema stays minimal. A MIDI importer would have pushed tick/PPQ/tempo-event concepts
  into storage that the scoring layer never consumes.
- Avoids inheriting MIDI's polyphonic capabilities, which would then need detecting and
  rejecting — more work than not supporting them.
- Adding MIDI import later is additive: a separate module emitting this same shape. No
  schema migration required.
- Trade-off accepted: users cannot bring their own MIDI files. Irrelevant in v1, since
  custom exercises (US-12) are post-MVP anyway.
- Revisit if user-contributed exercises become a product goal.

---

## ADR-012 — A learning layer above the exercise library, not a second product

**Status:** Accepted · 2026-09-15

**Context**
The v1 library is a flat list of five exercises with no ordering and no instruction around
them. A user who cannot already read music and does not know what an interval drill is for
has no route in. Adding structured teaching content is the change requested, and there
were two ways to take it: build a separate learning product beside the trainer, or model
courses as an ordered layer whose practice steps point at the exercises that already
exist.

A separate product would duplicate attempts, scoring, instrument profiles and history, and
would immediately raise the question of which of the two a score belongs to.

**Decision**
Courses, modules and lessons are added as a layer **above** `exercises`. A lesson of kind
`exercise` holds a foreign key to an existing exercise row. Attempts, `note_results`,
scoring, bands and instrument profiles are unchanged. Content lessons are text, diagrams
and Tone.js-synthesized reference audio; no video. Every instrument in the catalog gets one
starter course built from a shared eight-lesson skeleton. Full model in
`LEARNING_PLATFORM.md`.

**Consequences**
- The change is additive to the schema. No existing table or JSONB shape is modified
  except one new column on `attempts` (ADR-013).
- The practice-take screen is reused with lesson chrome rather than rebuilt, so the
  audio work already done carries straight into the new surface.
- Exercises gain a reason to exist in a particular order, which is what the flat library
  lacked.
- Progress must be evaluated server-side, which makes the backend a harder dependency
  than it already was. Six screens depended on endpoints that do not exist; now more do.
- Breadth was chosen over depth: twelve shallow starter courses rather than one complete
  curriculum. Accepted risk — a shallow course teaches little, and the mitigation is
  naming (starter course, never "learn guitar") plus a shared skeleton so the twelve do
  not each need bespoke authoring.
- Scope grows materially. Six new screens on top of eight already outstanding, with one
  screen built. This is no longer a five-week project and the timeline constraint in
  `REQUIREMENTS.md` §6 is superseded by this decision.
- Choosing text and SVG over video keeps content at zero recurring cost, consistent with
  the free-tier budget constraint.
- Trade-off accepted: no video means technique instruction is weaker than a video course.
  Technique is ungradable here regardless, so the gap is in teaching, not assessment.

---

## ADR-013 — A `NoteSource` abstraction now; Web MIDI deferred

**Status:** Accepted · 2026-09-15

**Context**
Teaching piano and guitar means teaching chords, and the engine cannot detect them.
Real-time polyphonic pitch detection from audio remains an open research problem
(`REQUIREMENTS.md` §2.2) and no amount of tuning YIN changes that.

The Web MIDI API sidesteps it entirely: a digital piano or MIDI controller over USB
reports exact note-on and note-off events, polyphonic, with velocity, and with no DSP at
all. It costs nothing in software. It does require hardware to develop against, a second
scoring path, and a device-permission surface — real work, on a project that has one
screen built and no server.

Building it now would delay the learning layer for a capability no lesson yet needs.
Building it later without preparing for it would mean threading a second input type
through the engine, the practice screen, the scoring layer and the schema after all four
have hardened around the assumption of one.

**Decision**
Introduce a `NoteSource` abstraction in the client audio layer now, with exactly one
implementation: the existing YIN audio engine. A `MidiSource` is **not** built. The
abstraction defines the boundary the scoring layer consumes, so a second source can be
added without changing its callers. `attempts` gains an `input_source` column, written as
`audio` for every row today.

Audio analysis remains monophonic. The locked scope constant in `MANIFEST.md` is amended
in wording only, from *monophonic only* to *monophonic audio analysis* — the ceiling on
what the detector can do is unchanged, and this decision does not raise it.

**Consequences**
- Zero cost today: no hardware purchase, no permission flow, no second scoring path.
- The seam is placed while there is one implementation and one caller, which is the
  cheapest moment to place it.
- `input_source` on `attempts` means a future MIDI attempt is distinguishable from an
  audio one without a migration. Mixing them silently would make score history
  meaningless, since a MIDI note is exact and a sung note is not.
- Chord and two-hand lessons ship taught but ungraded, closing with a self-reported
  drill and a `limitation` callout. Honest, and it is the same content either way.
- Risk of an abstraction designed against a single implementation being wrong for the
  second: the two sources differ fundamentally — audio is a continuous stream of cents
  estimates, MIDI is discrete events. The abstraction must not assume frames. If it turns
  out wrong, it is client-side code with no persisted shape depending on it, and the cost
  of correcting it is bounded.
- Trade-off accepted: users with a MIDI keyboard get no benefit from it in this release.

---

## ADR-014 — Schedule the metronome on the capture AudioContext, not Tone.js

**Status:** Accepted · 2026-09-15

**Context**
ADR-007 and the README name Tone.js in the frontend stack, and `REQUIREMENTS.md`
US-04 calls for a metronome with a count-in. The obvious move was to use Tone.js
for it.

The obstacle is the clock. Every frame the engine emits carries a timestamp taken
from the capture `AudioContext`'s audio clock (`AUDIO_PIPELINE.md` §4, "On
timestamps"), and every note window in a take is measured against those
timestamps. Tone.js constructs its own `AudioContext` by default. Two contexts on
one machine are two independent clocks: they start at different moments and drift
apart, so a click scheduled at "beat 4" in one and a frame stamped "2668 ms" in
the other cannot be compared without measuring an offset that itself changes.

A metronome is also a small thing — a scheduled oscillator with a decay envelope,
about eighty lines — against a library whose value here is its instruments and
transport, neither of which this needs.

**Decision**
The metronome is scheduled directly on the engine's capture `AudioContext`, via a
`Metronome` class taking that context. `PitchEngine` exposes a `context` getter for
the purpose. Clicks are synthesized oscillator bursts; no audio assets.

Tone.js is **not** dropped from the stack. It remains the intended player for
`listen` blocks in lesson content (`LEARNING_PLATFORM.md` §5.1), where nothing is
being recorded and clock alignment against captured audio does not arise.

**Consequences**
- Take alignment is exact by construction rather than approximately right and
  slowly wrong. The count-in, the clicks and the note windows are all expressed
  in one clock.
- No dependency added for this, and no audio asset to host — consistent with the
  free-tier budget.
- The accent and beat pitches are a one-line change rather than a sample swap.
- `PitchEngine.context` is now public. That is a real widening of the engine's
  surface, accepted because the alternative is routing every scheduled sound
  through the engine, which would make it responsible for playback it has no
  other reason to know about.
- **This does not make timing accurate in absolute terms.** Output latency and
  microphone input latency are both still `[TBM]` (`AUDIO_PIPELINE.md` §7). What
  the shared clock buys is that the error is a fixed offset rather than a drift.
  Rhythm scoring is position 2 on the cut list and `msOff` is null on every note
  result, so nothing currently depends on that offset being known.
- A future `MidiSource` has no `AudioContext` at all. Whatever plays the
  metronome then needs an explicit offset between its clock and the MIDI event
  clock. Noted where the getter is defined; not solved here.

---

## ADR-015 — Sheet music is core, and shares one source with the exercises

**Status:** Accepted · 2026-09-15

**Context**
The learning layer was specified with four content blocks — prose, diagram,
listen, callout — and notation sat at **position 1 on the cut list**
(`REQUIREMENTS.md` §9): "Notation rendering (VexFlow) → piano-roll display
only". That ordering came from a product whose centre was a pitch trainer, where
a piano roll shows a learner everything the scoring cares about.

That is the wrong centre for a learning platform. A course that teaches an
instrument without showing standard notation teaches somebody to imitate a
coloured bar. Reading is a substantial part of what a beginner is here to learn,
and the staff is the thing the rest of their musical life is written in.

There is also a question of where the music comes from. A lesson could carry its
notation as a separate authored field from the exercise it practises, but then
the sheet music and the thing being scored are two sources that can disagree —
and they will, on the first tempo change nobody propagated.

**Decision**
Notation is core and comes off the cut list. A fifth content block, `score`,
carries **the same compact note string** as an exercise (ADR-011), and both the
engraving and the playable audio are derived from it. One authored source, three
renderings: the staff, the reference audio, and the scoring target.

Rendering is VexFlow's SVG backend, as ADR-008 already chose. It is loaded on
demand rather than bundled with the app, because it is larger than React and the
audio engine together and no screen outside the learning layer engraves a note.

Playback is Web Audio, not Tone.js, for the reasons in ADR-014 plus one more: a
sampled instrument would sound better than synthesis, but samples are audio files
to host, which is the cost the content format was chosen to avoid.

**Consequences**
- A lesson's sheet music and the exercise it is scored against cannot drift
  apart, because neither is authored independently of the other.
- `REQUIREMENTS.md` §9 loses its first entry, and the cut list is renumbered.
  Notation joins the protected list: a course without a staff is not the product.
- The reference audio a learner hears derives from the same MIDI numbers the
  scoring uses, so it is in tune by construction and inherits the A4 = 440
  constant rather than restating it.
- VexFlow adds roughly 1.1 MB to the build, in its own chunk. Screens that do not
  engrave notation do not load it.
- Deliberately not supported in v1: ties across barlines, beaming, multiple
  voices, and key signatures beyond C. The seed library is quarter and half notes
  in 4/4, and notation that engraves what is actually there beats notation that
  engraves a general case badly. A note that crosses a barline lands in the bar
  it started in, engraved rather than refused.
- Transposing instruments are a real wrinkle this decision defers. A guitar
  course engraves an octave above sounding pitch and a clarinet course a tone
  above; both are correct notation and both need explaining in the lesson that
  introduces the staff. The first published course is voice, whose transposition
  is zero, so no notation in it means anything other than what it shows.
- Stage 2 (a cursor following playback) and stage 3 (live feedback on the staff)
  are not built. The renderer returns a note-index to SVG-element map and the
  player reports note indices so that neither needs a re-engraving pass.

---

## ADR-016 — Clerk, with a development fallback

**Status:** Accepted · 2026-09-16
*(Resolves the first open item in `API_SPEC.md` §14, left open by ADR-006.)*

**Context**
ADR-006 decided to use a managed auth provider and deliberately did not pick one,
because nothing downstream depended on which. That held: the server verifies any
RS256 JWT against a configured JWKS URL, issuer and audience, so the provider is
three environment variables rather than a code path.

Choosing became necessary to build sign-in (US-01). The two candidates were Clerk
and Auth0. Both have a free tier large enough that this project will never reach
it. The difference that mattered is the client: Clerk ships React components that
own the whole flow — sign-in, sign-up, verification, reset, account menu — while
Auth0 expects either its hosted page or a login UI built against its SDK.

A second problem is more specific to this project. Anyone cloning the repo has no
provider account, and requiring one to run the app at all would make the first
five minutes of contributing an account signup.

**Decision**
Clerk. The sign-in screen is Clerk's `<SignIn>` component inside a page of ours;
no form, no password handling, no reset flow of our own.

Auth selection is **optional at runtime**. `VITE_CLERK_PUBLISHABLE_KEY` decides:
set, the app is behind Clerk; unset, it runs on local accounts — created,
password-verified and signed in within the browser, producing the development
token the server accepts only when `AUTH_DEV_MODE` is on. Everything above
`api/session.ts` is identical either way.

The Clerk SDK is code-split, so a build without a key does not download it.

**Consequences**
- Sign-in, sign-up, verification, password reset and the account menu are all
  provider-owned. None of them is code in this repo, which is what ADR-006 was
  for.
- Adding Clerk could not break the working state, because the fallback is the
  behaviour that already existed. That is the reason it is a runtime switch and
  not a replacement.
- The main bundle grew by nothing: Clerk is 92 kB in its own chunk, fetched only
  when a key is configured.
- **Clerk's session token has no `email` claim by default**, and `API_SPEC.md`
  §3.1 provisions the user row from it. A custom claim is required —
  `"email": "{{user.primary_email_address}}"` under Configure → Sessions. The
  server's 401 names this specific fix rather than returning a bare
  `unauthenticated`, because it is the first thing that goes wrong on a new
  setup and the generic message sends people hunting through key configuration.
- Switching to Auth0 later remains three environment variables on the server and
  one component on the client. The seam ADR-006 created is not spent by this.
- The fallback is a working sign-in rather than a stub: accounts are created,
  passwords are salted and hashed with SHA-256, a wrong one is refused, and an
  unknown address and a wrong password return the same message so the form
  cannot enumerate accounts. A single SHA-256 pass is not a password KDF and
  would be wrong for anything real — but it is not real, and storing what
  someone typed in plain text is a bad habit to leave lying around in a
  placeholder.
- Those accounts live in one browser's `localStorage`, so they do not follow a
  user between devices and do not survive clearing site data. The sign-in page
  says so, because it is the only way this differs from the flow it stands in
  for.
- Trade-off accepted: the development fallback is a second identity path that
  exists only to be unused in production. It is gated on `NODE_ENV` at server
  startup, so it cannot be the one that ships.

---

## Decision Index

| ID | Decision | Status |
|---|---|---|
| ADR-001 | Client-side audio analysis | Accepted |
| ADR-002 | AudioWorklet over ScriptProcessorNode | Accepted |
| ADR-003 | YIN autocorrelation over FFT peak-picking | Accepted |
| ADR-004 | Median filtering + amplitude gating | Accepted |
| ADR-005 | PostgreSQL with JSONB note sequences | Accepted |
| ADR-006 | Managed auth provider | Accepted |
| ADR-007 | React + TypeScript | Accepted |
| ADR-008 | Canvas for trace, SVG for notation | Accepted |
| ADR-009 | Node / Express backend | Accepted |
| ADR-010 | Per-instrument configuration profiles | Accepted |
| ADR-011 | Hand-authored JSON exercises, no MIDI import | Accepted |
| ADR-012 | Learning layer above the exercise library | Accepted |
| ADR-013 | `NoteSource` abstraction, Web MIDI deferred | Accepted |
| ADR-014 | Metronome on the capture AudioContext, not Tone.js | Accepted |
| ADR-015 | Sheet music is core; one source for notation, audio and scoring | Accepted |
| ADR-016 | Clerk, with a development fallback | Accepted |
