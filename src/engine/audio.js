// Chiptune synth on the Web Audio API: square lead, 25% pulse harmony, triangle bass, noise drums.
// Nothing is created before unlock() (called from the first user gesture — the mobile autoplay rule);
// until then every play call is a no-op (a requested music track is remembered and starts on unlock).
// Songs come from jingles.js. Jingles/sfx are scheduled whole, up front; music and the looping sfx
// are topped up by a 100 ms interval with a 0.3 s look-ahead on ctx.currentTime, wrapping seamlessly.
import { SONGS } from './jingles.js';

export const MASTER = 0.15;
const KEY = 'tarekmon.muted';
const LOOKAHEAD = 0.3, INTERVAL_MS = 100, LEAD_IN = 0.05, FADE = 0.15, DUCK = 0.4;
const ATTACK = 0.005, RELEASE = 0.03;
const VOICE = { lead: 'square', harmony: 'pulse25', bass: 'triangle', drums: 'noise' };
const VOLUME = { square: 0.5, pulse25: 0.35, triangle: 0.7, noise: 0.6 };
// drum hit → [filter type, cutoff Hz, decay s, level]
const DRUMS = { k: ['lowpass', 180, 0.15, 1.6], s: ['bandpass', 1800, 0.12, 0.9], h: ['highpass', 7000, 0.04, 0.5] };

export const midiToHz = m => 440 * 2 ** ((m - 69) / 12);

/** Plays `track` once from `startTime` through `voice(note, time, duration)` (rests skipped); returns the end time. */
export function scheduleTrack(voice, track, bpm, startTime) {
  const spb = 60 / bpm;
  let t = startTime;
  for (const [note, beats] of track) {
    const d = beats * spb;
    if (note !== null) voice(note, t, d);
    t += d;
  }
  return t;
}

/** A 25%-duty pulse as a PeriodicWave (Fourier series of a rectangular wave). */
function pulseWave(ctx, duty = 0.25, harmonics = 32) {
  const real = new Float32Array(harmonics), imag = new Float32Array(harmonics);
  for (let n = 1; n < harmonics; n++) real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
  return ctx.createPeriodicWave(real, imag);
}

function noiseBuffer(ctx) {
  const len = Math.floor(ctx.sampleRate * 0.5), buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

export function createAudio({ AudioContextCtor = globalThis.AudioContext, storage = globalThis.localStorage,
  timers = globalThis, onMuteChange = null } = {}) {
  let ctx = null, master = null, pulse = null, noise = null;
  let music = null, loopSfx = null, wanted = null; // wanted: music asked for before unlock
  let muted = false;
  try { muted = storage?.getItem(KEY) === '1'; } catch { /* storage blocked: default to sound on */ }

  /** Returns voice(note, t, dur) for a voice kind, playing into `out` and registering nodes in `nodes`. */
  function voiceFor(kind, out, nodes) {
    const keep = (node, end) => nodes?.add({ node, end });
    if (kind === 'noise') {
      return (hit, t, d) => {
        const [type, freq, decay, level] = DRUMS[hit];
        const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        const end = t + Math.min(decay, d);
        src.buffer = noise; f.type = type; f.frequency.value = freq;
        g.gain.setValueAtTime(level * VOLUME.noise, t);
        g.gain.exponentialRampToValueAtTime(0.001, end);
        src.connect(f); f.connect(g); g.connect(out);
        src.start(t); src.stop(end); keep(src, end);
      };
    }
    const vol = VOLUME[kind];
    return (note, t, d) => {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      if (kind === 'pulse25') osc.setPeriodicWave(pulse); else osc.type = kind;
      osc.frequency.value = midiToHz(note);
      const a = Math.min(ATTACK, d / 4), r = Math.min(RELEASE, d / 2); // tiny envelope: no clicks
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + a);
      g.gain.setValueAtTime(vol, t + d - r);
      g.gain.linearRampToValueAtTime(0, t + d);
      osc.connect(g); g.connect(out);
      osc.start(t); osc.stop(t + d); keep(osc, t + d);
    };
  }
  const voicesOf = (song, out, nodes) =>
    Object.keys(song.tracks).map(name => voiceFor(song.voices?.[name] ?? VOICE[name], out, nodes));

  /** Schedules a whole song once, now; returns its end time. */
  function oneShot(song) {
    const start = ctx.currentTime + LEAD_IN, voices = voicesOf(song, master);
    return Math.max(...Object.values(song.tracks).map((tr, i) => scheduleTrack(voices[i], tr, song.bpm, start)));
  }

  /** A looping song on its own gain node, topped up by an interval; stop() fades it out and cancels. */
  function looper(name) {
    const song = SONGS[name], gain = ctx.createGain(), nodes = new Set(), spb = 60 / song.bpm;
    gain.connect(master);
    const voices = voicesOf(song, gain, nodes);
    const t0 = ctx.currentTime + LEAD_IN;
    const cursors = Object.values(song.tracks).map((track, i) => ({ track, voice: voices[i], i: 0, t: t0 }));
    const pump = () => {
      const now = ctx.currentTime;
      // Fell behind (a throttled background tab): shift every track by the same amount, keeping them in step.
      const lag = now - Math.min(...cursors.map(c => c.t));
      if (lag > 0) for (const c of cursors) c.t += lag + LEAD_IN;
      for (const c of cursors) {
        while (c.t < now + LOOKAHEAD) {
          const [note, beats] = c.track[c.i];
          if (note !== null) c.voice(note, c.t, beats * spb);
          c.t += beats * spb;
          c.i = (c.i + 1) % c.track.length;
        }
      }
      for (const n of nodes) if (n.end < now) nodes.delete(n);
    };
    pump();
    const id = timers.setInterval(pump, INTERVAL_MS);
    return {
      name, gain,
      stop(fade = FADE) {
        timers.clearInterval(id);
        const now = ctx.currentTime, p = gain.gain;
        p.cancelScheduledValues(now);
        p.setValueAtTime(p.value, now);
        p.linearRampToValueAtTime(0, now + fade);
        for (const { node } of nodes) { try { node.stop(now + fade); } catch { /* already stopped */ } }
        nodes.clear();
      },
    };
  }

  const audio = {
    get muted() { return muted; },

    /** Call from a user gesture: creates the context on first call, resumes it if suspended. */
    unlock() {
      if (!ctx) {
        if (!AudioContextCtor) return;
        ctx = new AudioContextCtor();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : MASTER;
        master.connect(ctx.destination);
        pulse = pulseWave(ctx);
        noise = noiseBuffer(ctx);
      }
      if (ctx.state === 'suspended') ctx.resume?.()?.catch?.(() => {});
      if (wanted) { const w = wanted; wanted = null; audio.startMusic(w); }
    },

    /** A short piece over the music, which dips to 40% until it ends. */
    playJingle(name) {
      const song = SONGS[name];
      if (!ctx || !song || muted) return;
      const end = oneShot(song);
      if (music) {
        const p = music.gain.gain, now = ctx.currentTime;
        p.cancelScheduledValues(now);
        p.setValueAtTime(DUCK, now);
        p.setValueAtTime(1, end);
      }
    },

    playSfx(name) {
      const song = SONGS[name];
      if (ctx && song && !muted) oneShot(song);
    },

    /** Only one track at a time; the current one again is a no-op. */
    startMusic(name) {
      if (!SONGS[name]) return;
      if (!ctx) { wanted = name; return; }
      if (music?.name === name) return;
      music?.stop();
      music = looper(name);
    },

    stopMusic() {
      wanted = null;
      music?.stop();
      music = null;
    },

    /** A looping sound effect (the skateboard), independent of the music. */
    startLoopSfx(name) {
      if (!ctx || !SONGS[name] || loopSfx?.name === name) return;
      loopSfx?.stop(0.05);
      loopSfx = looper(name);
    },

    stopLoopSfx() {
      loopSfx?.stop(0.05);
      loopSfx = null;
    },

    setMuted(value) {
      muted = !!value;
      try { storage?.setItem(KEY, muted ? '1' : '0'); } catch { /* not persisted; still applies now */ }
      if (master) master.gain.value = muted ? 0 : MASTER;
      onMuteChange?.(muted);
    },
  };
  return audio;
}
