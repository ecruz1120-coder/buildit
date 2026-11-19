/**
 * Opening-cinematic score, synthesized with Web Audio.
 * The same function schedules into a live AudioContext (in game) or an OfflineAudioContext
 * (MP4 export), so picture and sound always line up. All times are seconds from the start.
 */
export const INTRO_LENGTH = 92;

type Ctx = BaseAudioContext;

function noiseBuffer(ctx: Ctx, seconds: number): AudioBuffer {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = b.getChannelData(0);
  let s = 1234567;
  for (let i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = (s / 0x7fffffff) * 2 - 1; }
  return b;
}

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

export function scheduleScore(ctx: Ctx, out: AudioNode, t0 = 0) {
  const master = ctx.createGain(); master.gain.value = 0.9; master.connect(out);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.connect(master);
  const noise = noiseBuffer(ctx, 2);
  const T = (s: number) => t0 + s;

  /** Sustained pad chord with slow attack/release. */
  const pad = (notes: number[], start: number, end: number, vol = 0.05, cutoff = 900, type: OscillatorType = 'sawtooth') => {
    const g = ctx.createGain(); g.gain.setValueAtTime(0, T(start));
    g.gain.linearRampToValueAtTime(vol, T(start + Math.min(2.5, (end - start) / 3)));
    g.gain.setValueAtTime(vol, T(end - Math.min(2, (end - start) / 3)));
    g.gain.linearRampToValueAtTime(0, T(end));
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = 0.7;
    f.connect(g); g.connect(comp);
    for (const n of notes) for (const det of [-6, 5]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = hz(n); o.detune.value = det;
      o.connect(f); o.start(T(start)); o.stop(T(end + 0.1));
    }
  };
  /** Monitor beep (ECG). */
  const beep = (at: number, freq = 980, len = 0.09, vol = 0.12) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, T(at)); g.gain.linearRampToValueAtTime(vol, T(at + 0.005)); g.gain.setValueAtTime(vol, T(at + len)); g.gain.linearRampToValueAtTime(0, T(at + len + 0.02));
    o.connect(g); g.connect(comp); o.start(T(at)); o.stop(T(at + len + 0.05));
  };
  /** Cinematic hit: sub drop + noise burst. */
  const hit = (at: number, vol = 0.5, low = 55) => {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(low * 2.2, T(at)); o.frequency.exponentialRampToValueAtTime(low * 0.5, T(at + 0.9));
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, T(at)); g.gain.exponentialRampToValueAtTime(0.001, T(at + 1.4));
    o.connect(g); g.connect(comp); o.start(T(at)); o.stop(T(at + 1.5));
    const n = ctx.createBufferSource(); n.buffer = noise;
    const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 2200;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(vol * 0.5, T(at)); ng.gain.exponentialRampToValueAtTime(0.001, T(at + 0.45));
    n.connect(nf); nf.connect(ng); ng.connect(comp); n.start(T(at)); n.stop(T(at + 0.5));
  };
  /** Low pulse bass note. */
  const bass = (at: number, note: number, len = 0.22, vol = 0.16) => {
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = hz(note);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, T(at)); g.gain.exponentialRampToValueAtTime(0.001, T(at + len));
    o.connect(f); f.connect(g); g.connect(comp); o.start(T(at)); o.stop(T(at + len + 0.05));
  };
  const tick = (at: number, vol = 0.05) => {
    const n = ctx.createBufferSource(); n.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, T(at)); g.gain.exponentialRampToValueAtTime(0.001, T(at + 0.06));
    n.connect(f); f.connect(g); g.connect(comp); n.start(T(at), (at * 7.31) % 1.5); n.stop(T(at + 0.08));
  };
  /** Pitched bell for the title and the coin. */
  const bell = (at: number, note: number, vol = 0.12, len = 3) => {
    for (const [mul, v] of [[1, 1], [2.76, 0.4], [5.4, 0.2]] as [number, number][]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz(note) * mul;
      const g = ctx.createGain(); g.gain.setValueAtTime(vol * v, T(at)); g.gain.exponentialRampToValueAtTime(0.0005, T(at + len));
      o.connect(g); g.connect(comp); o.start(T(at)); o.stop(T(at + len));
    }
  };
  /** Rain bed. */
  const rain = (start: number, end: number, vol = 0.05) => {
    const n = ctx.createBufferSource(); n.buffer = noise; n.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3000; f.Q.value = 0.4;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, T(start)); g.gain.linearRampToValueAtTime(vol, T(start + 1.5)); g.gain.setValueAtTime(vol, T(end - 1)); g.gain.linearRampToValueAtTime(0, T(end));
    n.connect(f); f.connect(g); g.connect(comp); n.start(T(start)); n.stop(T(end));
  };

  /** Filtered-noise sweep (risers, whooshes). */
  const sweep = (start: number, end: number, f0: number, f1: number, vol = 0.08) => {
    const n = ctx.createBufferSource(); n.buffer = noise; n.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(f0, T(start)); f.frequency.exponentialRampToValueAtTime(f1, T(end));
    const g = ctx.createGain(); g.gain.setValueAtTime(0, T(start)); g.gain.linearRampToValueAtTime(vol, T(end - 0.15)); g.gain.linearRampToValueAtTime(0, T(end));
    n.connect(f); f.connect(g); g.connect(comp); n.start(T(start)); n.stop(T(end + 0.05));
  };
  /** Low engine hum. */
  const hum = (start: number, end: number, vol = 0.05) => {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 46;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 240;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, T(start)); g.gain.linearRampToValueAtTime(vol, T(start + 0.8)); g.gain.setValueAtTime(vol, T(end - 0.6)); g.gain.linearRampToValueAtTime(0, T(end));
    o.connect(f); f.connect(g); g.connect(comp); o.start(T(start)); o.stop(T(end + 0.05));
  };

  // 0–5  cold open: ECG over darkness
  pad([38, 45, 53], 0, 6, 0.035, 500);
  for (let t = 0.6; t < 5; t += 0.9) beep(t);
  // 5–14 graduation: warm major
  pad([41, 48, 57, 60], 5, 14.5, 0.045, 1400, 'triangle');
  bell(5.2, 72, 0.06, 2.5); bell(9.5, 76, 0.05, 2.5);
  // 14–27 career montage: hopeful, steady monitor
  pad([46, 53, 58, 62], 14, 27.5, 0.045, 1500, 'triangle');
  for (let t = 14.4; t < 18.4; t += 0.8) beep(t, 980, 0.07, 0.06);
  for (let t = 23.2; t < 27; t += 0.8) beep(t, 980, 0.07, 0.06);
  // 27–40 the operation: tension builds, rhythm falters, flatline
  pad([38, 44, 50, 51], 27, 40.5, 0.05, 700);
  const beats = [27.6, 28.4, 29.2, 30.0, 30.8, 31.5, 32.2, 32.8, 33.3, 33.7, 34.3, 34.6, 35.4, 35.7];
  beats.forEach((t) => beep(t, 980, 0.07, 0.09));
  beep(36.0, 980, 3.2, 0.08); // flatline
  hit(36.0, 0.35, 45);
  // 40–49 the fall: hollow, low
  pad([33, 40, 45], 40, 49.5, 0.05, 420);
  for (let t = 40.5; t < 49; t += 1.5) hit(t, 0.06, 70);
  // 49–58 family: fragile then dark
  pad([45, 52, 57], 49, 53.5, 0.035, 900, 'triangle');
  pad([34, 41, 46], 53, 58.5, 0.05, 380);
  hit(53.2, 0.45, 40);
  bell(56.2, 79, 0.08, 2.4); // coin
  // 58–68 the detective: rain, resolve
  rain(58, 68.5, 0.05);
  pad([33, 40, 48, 52], 58, 68.5, 0.05, 650);
  for (let t = 62; t < 68; t += 0.5) bass(t, t % 2 < 1 ? 33 : 36, 0.3, 0.1);
  // 68–71 match-cut into space: riser
  pad([33, 40, 45, 52], 67.5, 71.4, 0.05, 900);
  sweep(68.2, 71.0, 400, 5200, 0.07);
  // 71–75.5 space approach, atmospheric entry whoosh
  pad([33, 45, 52, 57, 64], 71, 75.8, 0.05, 1600);
  bell(71.1, 69, 0.07, 3); bell(72.6, 76, 0.05, 3);
  sweep(74.2, 75.9, 300, 3000, 0.12);
  // 75.5–80.25 landing in Zixel: engine hum, touchdown
  hum(75.5, 79.2, 0.05);
  pad([36, 43, 48, 55], 75.5, 80.4, 0.045, 1100);
  hit(78.6, 0.35, 42);
  // 80.25–88.5 gameplay montage: 120 bpm drive, a hit on every cut (1.375 s)
  pad([33, 40, 45, 52], 80.1, 88.7, 0.04, 1200);
  for (let t = 80.25; t < 88.45; t += 0.25) { bass(t, [33, 33, 45, 33, 36, 33, 43, 33][Math.round((t - 80.25) * 4) % 8], 0.18, 0.12); if (Math.round(t * 4) % 2 === 1) tick(t); }
  for (let i = 0; i < 6; i++) hit(80.25 + i * 1.375, 0.3, 50);
  // 88.5–92 title
  pad([33, 45, 52, 57, 64], 88.4, 92, 0.055, 1800);
  hit(88.6, 0.6, 38);
  bell(88.6, 57, 0.14, 3.4); bell(88.6, 69, 0.08, 3.4);
}

/** Render the score offline and return a 16-bit PCM WAV (for the MP4 export). */
export async function renderScoreWav(sampleRate = 44100): Promise<ArrayBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(INTRO_LENGTH * sampleRate), sampleRate);
  scheduleScore(ctx, ctx.destination, 0);
  const buf = await ctx.startRendering();
  const n = buf.length, ch = [buf.getChannelData(0), buf.getChannelData(1)];
  const out = new ArrayBuffer(44 + n * 4), v = new DataView(out);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 4, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) { const s = Math.max(-1, Math.min(1, ch[c][i])); v.setInt16(o, s * 0x7fff, true); o += 2; }
  return out;
}
