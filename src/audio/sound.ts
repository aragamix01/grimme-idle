// Chiptune music and sound effects, synthesised live with WebAudio: no audio files.
// A tiny sequencer plays a square-wave lead, a triangle bass and noise drums; the tune
// follows the world's mood. Effects answer chronicle events. Browsers only allow sound
// after a user gesture, so the context starts on the first tap once sound is on.
import { ageOf, type ChronicleEntry, type EventKind, type WorldState } from '../sim';

type Step = number | null; // semitones above the song's base note, or a rest
interface Song {
  bpm: number;
  base: number; // MIDI note for lead offset 0
  bassBase: number;
  lead: Step[]; // eighth notes
  bass: Step[];
  wave: OscillatorType;
  drums: 'pop' | 'soft' | 'march' | 'none';
}

const _ = null;
const SONGS: Record<'day' | 'night' | 'dark' | 'occupied' | 'dayOld' | 'dayNew', Song> = {
  // The first age's day: a plain pentatonic folk tune on a soft flute-like triangle.
  dayOld: {
    bpm: 100,
    base: 72,
    bassBase: 48,
    wave: 'triangle',
    drums: 'soft',
    lead: [0, _, 2, 4, 7, _, 4, 2, 0, _, _, _, 9, 7, 4, _, 2, _, 4, 7, 9, _, 7, 4, 2, 4, 2, 0, 0, _, _, _],
    bass: [0, _, _, _, 7, _, _, _, 0, _, _, _, 9, _, _, _, 2, _, _, _, 7, _, _, _, 0, _, _, _, 7, _, _, _],
  },
  // The third age's day: quicker, with a run up the scale like a court dance.
  dayNew: {
    bpm: 128,
    base: 72,
    bassBase: 48,
    wave: 'square',
    drums: 'pop',
    lead: [0, 2, 4, 5, 7, 9, 11, 12, 11, 7, 9, 5, 7, 4, 2, _, 4, 5, 7, 12, 9, 7, 5, 4, 2, 4, 5, 2, 0, _, 12, _],
    bass: [0, 7, 12, 7, 5, 9, 12, 9, 7, 11, 14, 11, 0, 7, 12, _, 5, 9, 12, 9, 7, 11, 14, 11, 0, 7, 0, _, 0, _, _, _],
  },
  // Bright market-day tune in C major.
  day: {
    bpm: 112,
    base: 72,
    bassBase: 48,
    wave: 'square',
    drums: 'pop',
    lead: [0, 4, 7, 12, 11, 7, 4, 2, 0, 2, 4, 7, 9, 7, 4, _, 5, 9, 12, 9, 7, 4, 2, 4, 0, 4, 2, -1, 0, _, _, _],
    bass: [0, _, 7, _, 0, _, 7, _, 5, _, 12, _, 7, _, 11, _, 5, _, 9, _, 7, _, 2, _, 0, _, 7, _, 0, _, _, _],
  },
  // A slow lullaby in A minor under the stars.
  night: {
    bpm: 80,
    base: 69,
    bassBase: 45,
    wave: 'triangle',
    drums: 'soft',
    lead: [12, _, 7, _, 8, 7, 3, _, 5, _, 3, 2, 0, _, _, _, 3, _, 7, _, 8, _, 10, 8, 7, _, 3, 5, 2, _, _, _],
    bass: [0, _, _, _, 8, _, _, _, 5, _, _, _, 7, _, _, _, 0, _, _, _, 8, _, _, _, 3, _, _, _, 7, _, _, _],
  },
  // Darkness creeping in: D minor, low and uneasy.
  dark: {
    bpm: 92,
    base: 62,
    bassBase: 38,
    wave: 'square',
    drums: 'march',
    lead: [0, _, 1, 0, _, 3, 1, _, 0, _, -2, -1, 0, _, _, _, 7, _, 6, 5, 3, _, 1, 0, -1, _, 0, _, 1, _, _, _],
    bass: [0, 0, _, 0, 1, _, 0, _, 0, 0, _, 0, -2, _, -1, _, 0, 0, _, 0, 1, _, 0, _, -1, -1, _, -1, 0, _, _, _],
  },
  // Under the demon lord: a dirge.
  occupied: {
    bpm: 70,
    base: 57,
    bassBase: 33,
    wave: 'sawtooth',
    drums: 'march',
    lead: [0, _, _, 1, 0, _, _, _, 3, _, _, 1, 0, _, -1, _, 0, _, _, 1, 3, _, 6, _, 5, _, 3, _, 1, _, 0, _],
    bass: [0, _, _, _, 0, _, _, _, 1, _, _, _, 0, _, _, _, 0, _, _, _, -2, _, _, _, -1, _, _, _, 0, _, _, _],
  },
};

const STORE = 'grimm-sound';
const MUSIC_VOL = 0.09;
const SFX_VOL = 0.18;
const AHEAD = 0.25; // seconds of music scheduled in advance

let ctx: AudioContext | null = null;
let master: GainNode;
let musicBus: GainNode;
let sfxBus: GainNode;
let noise: AudioBuffer;
let rain: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let enabled = readSetting();
let song: Song = SONGS.day;
let step = 0;
let nextAt = 0;
let lastSeq = -1;
let lastSfx = 0;

function readSetting(): boolean {
  try {
    return localStorage.getItem(STORE) !== 'off';
  } catch {
    return true;
  }
}

export const soundOn = () => enabled;

export function setSound(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(STORE, on ? 'on' : 'off');
  } catch {
    /* private mode: the choice lasts this visit */
  }
  if (on) start();
  else void ctx?.suspend();
}

// Call from a user gesture: browsers refuse to start audio without one.
export function start(): void {
  if (!enabled) return;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = MUSIC_VOL;
    musicBus.connect(master);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = SFX_VOL;
    sfxBus.connect(master);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    nextAt = ctx.currentTime + 0.1;
    setInterval(schedule, 60);
  }
  void ctx.resume();
}

const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

function tone(at: number, midi: number, len: number, wave: OscillatorType, vol: number, bus: GainNode, slideTo?: number): void {
  const c = ctx!;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = wave;
  o.frequency.setValueAtTime(freq(midi), at);
  if (slideTo !== undefined) o.frequency.exponentialRampToValueAtTime(freq(slideTo), at + len);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  o.connect(g).connect(bus);
  o.start(at);
  o.stop(at + len + 0.02);
}

function hit(at: number, len: number, vol: number, bus: GainNode, lowpass = 8000): void {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lowpass;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  src.connect(f).connect(g).connect(bus);
  src.start(at, Math.random() * 0.5, len + 0.05);
}

// Queue the next notes of the current song a little ahead of time.
function schedule(): void {
  if (!ctx || ctx.state !== 'running') return;
  const eighth = 60 / song.bpm / 2;
  while (nextAt < ctx.currentTime + AHEAD) {
    const i = step % song.lead.length;
    const l = song.lead[i];
    if (l !== null) tone(nextAt, song.base + l, eighth * 0.9, song.wave, 0.5, musicBus);
    const b = song.bass[i];
    if (b !== null) tone(nextAt, song.bassBase + b, eighth * (song.bass[(i + 1) % song.bass.length] === null ? 1.8 : 0.9), 'triangle', 0.7, musicBus);
    drum(nextAt, i);
    nextAt += eighth;
    step++;
  }
}

function drum(at: number, i: number): void {
  if (song.drums === 'none') return;
  if (song.drums === 'pop') {
    if (i % 4 === 0) tone(at, 36, 0.12, 'sine', 0.8, musicBus, 24);
    if (i % 2 === 1) hit(at, 0.04, 0.25, musicBus);
  } else if (song.drums === 'soft') {
    if (i % 8 === 4) hit(at, 0.06, 0.15, musicBus, 3000);
  } else if (i % 4 === 0 || i % 8 === 3) {
    tone(at, 33, 0.18, 'sine', 0.9, musicBus, 22); // the march: heavy, uneven
  }
}

// Pick the tune for how the world feels, and keep the rain hiss in step with the weather.
export function updateMood(world: WorldState): void {
  if (!ctx) return;
  const t = (world.day % 16) / 16;
  const next =
    world.demon?.stage === 'occupied'
      ? SONGS.occupied
      : world.demon || (world.balance ?? 0) <= -20
        ? SONGS.dark
        : t > 0.3 && t < 0.7
          ? SONGS.night
          : [SONGS.dayOld, SONGS.day, SONGS.dayNew, SONGS.dayNew, SONGS.dayNew][ageOf(world)]; // the day's tune follows the age
  if (next !== song) {
    song = next;
    step = 0; // start the new tune from its first bar
  }
  const raining = !!world.weather && world.weather.kind === 'rain' && world.weather.until > world.day;
  if (raining && !rain) startRain();
  else if (!raining && rain) stopRain();
}

function startRain(): void {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 1800;
  f.Q.value = 0.6;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.35, c.currentTime + 1.5);
  src.connect(f).connect(gain).connect(sfxBus);
  src.start();
  rain = { src, gain };
}

function stopRain(): void {
  const r = rain!;
  rain = null;
  const now = ctx!.currentTime;
  r.gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
  r.src.stop(now + 1.6);
}

// ---------- effects ----------

const SFX: Partial<Record<EventKind, (at: number) => void>> = {
  battle: (at) => {
    hit(at, 0.08, 0.6, sfxBus, 6000);
    tone(at, 88, 0.12, 'square', 0.3, sfxBus, 76);
  },
  bless: (at) => [72, 76, 79, 84].forEach((n, i) => tone(at + i * 0.07, n, 0.25, 'triangle', 0.5, sfxBus)),
  curse: (at) => tone(at, 64, 0.5, 'sawtooth', 0.35, sfxBus, 40),
  theft: (at) => [84, 88].forEach((n, i) => tone(at + i * 0.06, n, 0.08, 'square', 0.25, sfxBus)),
  trade: (at) => [88, 93].forEach((n, i) => tone(at + i * 0.08, n, 0.12, 'square', 0.25, sfxBus)),
  dream: (at) => [79, 84, 79, 86].forEach((n, i) => tone(at + i * 0.12, n, 0.3, 'sine', 0.35, sfxBus)),
  quest: (at) => [67, 72, 76].forEach((n, i) => tone(at + i * 0.09, n, 0.16, 'square', 0.3, sfxBus)),
  rank: (at) => [72, 76, 79, 84, 88].forEach((n, i) => tone(at + i * 0.06, n, 0.14, 'square', 0.3, sfxBus)),
  politics: (at) => [67, 67, 72].forEach((n, i) => tone(at + i * 0.12, n, i === 2 ? 0.4 : 0.1, 'square', 0.3, sfxBus)),
  death: (at) => tone(at, 55, 0.7, 'triangle', 0.4, sfxBus, 43),
  disaster: (at) => {
    hit(at, 0.9, 0.7, sfxBus, 400);
    tone(at, 40, 0.8, 'sawtooth', 0.3, sfxBus, 28);
  },
  cult: (at) => tone(at, 45, 0.9, 'sawtooth', 0.25, sfxBus, 44),
};
const SFX_GAP = 0.25; // seconds between effects, so a busy day doesn't turn to noise

export function playEvents(world: WorldState): void {
  if (lastSeq < 0 || !ctx || ctx.state !== 'running') {
    lastSeq = world.chronicleSeq;
    return;
  }
  const fresh: ChronicleEntry[] = world.chronicle.filter((e) => e.seq > lastSeq);
  lastSeq = world.chronicleSeq;
  for (const e of fresh) {
    const fx = SFX[e.kind];
    if (!fx) continue;
    const at = Math.max(ctx.currentTime + 0.02, lastSfx + SFX_GAP);
    if (at > ctx.currentTime + 1) break; // too much at once: let the rest pass
    fx(at);
    lastSfx = at;
  }
}

// A soft blip for buttons.
export function click(): void {
  if (!ctx || ctx.state !== 'running') return;
  tone(ctx.currentTime, 84, 0.04, 'square', 0.15, sfxBus);
}
