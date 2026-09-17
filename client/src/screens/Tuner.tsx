/**
 * Tuner mode — US-08. Detected pitch and deviation with no exercise attached.
 *
 * This is also the escalation fallback in REQUIREMENTS §8: if the rest of the
 * product had to be cut, this screen is what survives, so it is built first and
 * depends on nothing but the engine.
 *
 * Rendering note: frames arrive ~94 times a second. Putting them in React state
 * would re-render the tree at 94 Hz, which is the main-thread contention
 * ADR-002 exists to avoid. Frames go into a ref, and a requestAnimationFrame
 * loop writes the readout and canvas directly. React state holds only what
 * actually changes at human speed — running, profile, errors.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { PitchEngine, MicrophoneError } from '../audio/engine';
import type { AudioInputKind, TrackReport } from '../audio/engine';
import { assertContinuousPitch, onPitchFrames } from '../audio/note-source';
import { INSTRUMENT_PROFILES, profileById, detectionFloorHz, profileBelowFloor } from '../audio/profiles';
import { MicTrouble } from '../components/MicTrouble';
import { useAudioInputs } from '../audio/useAudioInputs';
import { useMe } from '../api/useMe';
import { bandFor, hzToMidi, midiToHz, noteName } from '../audio/pitch';
import { DEFAULT_CONFIG } from '../audio/types';
import type { AnalysedFrame, InstrumentProfile } from '../audio/types';

const TRACE_SPAN_MS = 5000;
const BAND_COLOR: Record<string, string> = {
  green: '#3ddc84', amber: '#f2c14e', red: '#ff5d6c',
};

export function Tuner() {
  const { primaryInstrumentId } = useMe();
  const [profileId, setProfileId] = useState(primaryInstrumentId ?? 'voice_tenor');
  const { inputs } = useAudioInputs();
  const [deviceId, setDeviceId] = useState<string>('');
  const [inputKind, setInputKind] = useState<AudioInputKind>('mic');
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [micError, setMicError] = useState<unknown>(null);
  const [track, setTrack] = useState<TrackReport | null>(null);

  const profile = profileById(profileId);

  const engineRef = useRef<PitchEngine | null>(null);
  const framesRef = useRef<AnalysedFrame[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const noteRef = useRef<HTMLDivElement>(null);
  const centsRef = useRef<HTMLDivElement>(null);
  const needleRef = useRef<HTMLBaseElement>(null);
  const statRef = useRef<HTMLDivElement>(null);

  // one engine for the life of the screen
  if (engineRef.current === null) engineRef.current = new PitchEngine(profile);
  const engine = engineRef.current;

  useEffect(() => {
    // This screen is a continuous pitch display and cannot render anything
    // from a note-only source. Fail here rather than on an empty canvas.
    assertContinuousPitch(engine);
    const unsubscribe = onPitchFrames(engine, (f) => {
      const arr = framesRef.current;
      arr.push(f);
      if (arr.length > 3000) arr.splice(0, arr.length - 3000);
    });
    engine.events.onTrack = setTrack;
    return () => { unsubscribe(); void engine.stop(); };
  }, [engine]);

  useEffect(() => { engine.setProfile(profile); }, [engine, profile]);

  const toggle = useCallback(async () => {
    setError(null);
    setMicError(null);
    setBusy(true);
    try {
      if (engine.running) {
        await engine.stop();
        setRunning(false);
        setTrack(null);
      } else {
        framesRef.current = [];
        engine.setInput(inputKind, deviceId || undefined);
        await engine.start();
        setRunning(true);
      }
    } catch (err) {
      if (err instanceof MicrophoneError) setMicError(err);
      else setError(String(err));
      setRunning(false);
    } finally {
      setBusy(false);
    }
  }, [engine, inputKind, deviceId]);

  // ---- draw loop -------------------------------------------------------
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const frames = framesRef.current;
      paintTrace(canvasRef.current, frames, profile);

      const latest = lastVoiced(frames);
      if (noteRef.current && centsRef.current) {
        if (latest?.noteName != null && latest.centsOff != null) {
          const colour = BAND_COLOR[bandFor(latest.centsOff)];
          noteRef.current.textContent = latest.noteName;
          noteRef.current.style.color = colour;
          centsRef.current.textContent =
            `${latest.centsOff >= 0 ? '+' : ''}${latest.centsOff.toFixed(1)}¢`;
          centsRef.current.style.color = colour;
          if (needleRef.current) {
            const clamped = Math.max(-50, Math.min(50, latest.centsOff));
            needleRef.current.style.left = `calc(${50 + clamped}% - 3px)`;
            needleRef.current.style.background = colour;
          }
        } else {
          noteRef.current.textContent = '—';
          noteRef.current.style.color = '';
          centsRef.current.textContent = '';
          if (needleRef.current) needleRef.current.style.left = 'calc(50% - 3px)';
        }
      }

      const f = frames[frames.length - 1];
      if (statRef.current && f) {
        statRef.current.textContent = f.voiced
          ? `${f.filteredHz?.toFixed(1)} Hz · clarity ${f.clarity.toFixed(2)} · rms ${f.rms.toFixed(4)}`
          : `${gateLabel(f.reason)} · rms ${f.rms.toFixed(4)}`;
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [profile]);

  const floor = detectionFloorHz(DEFAULT_CONFIG.windowSize, engine.sampleRate ?? 48000);
  const belowFloor = profileBelowFloor(profile, DEFAULT_CONFIG.windowSize, engine.sampleRate ?? 48000);

  return (
    <div className="tuner">
      <header>
        <h1>Pitchwise <small>tuner</small></h1>
        <span className={`pill ${running ? 'ok' : ''}`}>
          {running ? `live · ${engine.sampleRate} Hz` : 'idle'}
        </span>
      </header>

      <section className="controls">
        <div className="seg">
          {(['mic', 'synth'] as AudioInputKind[]).map((k) => (
            <button key={k} className={inputKind === k ? 'on' : ''} disabled={running}
              onClick={() => setInputKind(k)}>
              {k === 'mic' ? 'Microphone' : 'Test tone'}
            </button>
          ))}
        </div>

        {inputs.length > 1 && inputKind === 'mic' && (
          <label>
            Microphone
            <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} disabled={running}>
              <option value="">System default</option>
              {inputs.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
              ))}
            </select>
          </label>
        )}

        <label>
          Instrument
          <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            {INSTRUMENT_PROFILES.map((p) => (
              <option key={p.id} value={p.id}>{p.displayName} ({p.nominalRange})</option>
            ))}
          </select>
        </label>

        <button className="primary" onClick={toggle} disabled={busy}>
          {running ? 'Stop' : 'Start'}
        </button>
      </section>

      {micError != null && <MicTrouble error={micError} onRetry={() => void toggle()} />}
      {error && <p className="alert error">{error}</p>}

      {!profile.isMeasured && (
        <p className="alert warn">
          <strong>{profile.displayName}</strong>’s amplitude gate is a placeholder,
          not a measured value. It may cut quiet notes or let room noise through
          until it is calibrated for your microphone and room.
        </p>
      )}

      {belowFloor && (
        <p className="alert warn">
          This profile reaches down to {profile.fMinHz} Hz, below what a{' '}
          {DEFAULT_CONFIG.windowSize}-sample window can resolve ({floor.toFixed(1)} Hz).
          Its lowest notes will read as unvoiced rather than as a wrong pitch.
        </p>
      )}

      {track && track.ignored.length > 0 && (
        <p className="alert error">
          The browser did not honour: {track.ignored.join(', ')}. Pitch readings are
          being taken from processed audio and should not be trusted.
        </p>
      )}

      <section className="readout">
        <div className="note" ref={noteRef}>—</div>
        <div className="cents" ref={centsRef} />
      </section>

      <div className="needle-track">
        <u />
        <i />
        <b ref={needleRef as React.RefObject<HTMLElement>} />
      </div>

      <canvas ref={canvasRef} className="trace" />
      <div className="stat" ref={statRef} />
    </div>
  );
}

function gateLabel(reason: number): string {
  return ['voiced', 'below amplitude gate', 'below clarity gate', 'outside range'][reason] ?? '—';
}

function lastVoiced(frames: AnalysedFrame[]): AnalysedFrame | undefined {
  for (let i = frames.length - 1; i >= Math.max(0, frames.length - 4); i--) {
    if (frames[i].filteredHz != null) return frames[i];
  }
  return undefined;
}

/** Y axis is linear in semitones, i.e. logarithmic in Hz (§3 Stage H). */
function paintTrace(
  canvas: HTMLCanvasElement | null,
  frames: AnalysedFrame[],
  profile: InstrumentProfile,
): void {
  if (!canvas) return;
  const g = canvas.getContext('2d');
  if (!g) return;
  const dpr = devicePixelRatio || 1;
  const W = canvas.clientWidth * dpr;
  const H = canvas.clientHeight * dpr;
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  g.clearRect(0, 0, W, H);

  const mLo = hzToMidi(profile.fMinHz);
  const mHi = hzToMidi(profile.fMaxHz);
  const y = (hz: number) => H - ((hzToMidi(hz) - mLo) / (mHi - mLo)) * H;

  g.lineWidth = 1;
  g.strokeStyle = 'rgba(255,255,255,.05)';
  g.fillStyle = '#55556a';
  g.font = `${10 * dpr}px ui-monospace, monospace`;
  for (let m = Math.ceil(mLo / 12) * 12; m <= mHi; m += 12) {
    const yy = Math.round(y(midiToHz(m))) + 0.5;
    g.beginPath(); g.moveTo(0, yy); g.lineTo(W, yy); g.stroke();
    g.fillText(noteName(m), 7 * dpr, yy - 5 * dpr);
  }

  if (frames.length === 0) return;
  const now = frames[frames.length - 1].timestamp;
  const x = (t: number) => ((t - (now - TRACE_SPAN_MS)) / TRACE_SPAN_MS) * W;

  // Runs break at rests and at holes in the frame stream: a continuous line
  // across a rest would draw pitch that was never sung.
  const maxGap = (DEFAULT_CONFIG.hopSize / 48000) * 1000 * 2.5;
  const runs: Array<Array<[number, number, number]>> = [];
  let cur: Array<[number, number, number]> = [];
  let prevT: number | null = null;
  for (const f of frames) {
    if (f.timestamp < now - TRACE_SPAN_MS) continue;
    const usable = f.filteredHz != null;
    if (!usable || (prevT != null && f.timestamp - prevT > maxGap)) {
      if (cur.length > 1) runs.push(cur);
      cur = [];
    }
    if (usable) {
      cur.push([x(f.timestamp), y(f.filteredHz as number), f.centsOff ?? 0]);
      prevT = f.timestamp;
    } else prevT = null;
  }
  if (cur.length > 1) runs.push(cur);

  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.save();
  g.strokeStyle = 'rgba(124,92,255,.5)';
  g.lineWidth = 3.5 * dpr;
  g.shadowColor = 'rgba(124,92,255,.5)';
  g.shadowBlur = 14 * dpr;
  for (const run of runs) {
    g.beginPath();
    g.moveTo(run[0][0], run[0][1]);
    for (let i = 1; i < run.length; i++) g.lineTo(run[i][0], run[i][1]);
    g.stroke();
  }
  g.restore();

  g.lineWidth = 2 * dpr;
  for (const run of runs) {
    for (let i = 1; i < run.length; i++) {
      g.strokeStyle = BAND_COLOR[bandFor(run[i][2])];
      g.beginPath();
      g.moveTo(run[i - 1][0], run[i - 1][1]);
      g.lineTo(run[i][0], run[i][1]);
      g.stroke();
    }
  }
}
