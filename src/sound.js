// افکت‌های صوتی ساخته‌شده با WebAudio — بدون فایل صوتی
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('radpa.mute') === '1'; } catch {}

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, { at = 0, dur = 0.12, type = 'sine', vol = 0.18, slide = 0, attack = 0.005 } = {}) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.15, vol = 0.12, freq = 2000 } = {}) {
  const c = ac();
  if (!c) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(c.destination);
  src.start();
}

const SFX = {
  tap: () => tone(620, { dur: 0.05, vol: 0.08, type: 'triangle' }),
  select: () => { tone(520, { dur: 0.08, type: 'triangle' }); tone(780, { at: 0.05, dur: 0.1, type: 'triangle' }); },
  submit: () => { tone(440, { dur: 0.09, type: 'triangle' }); tone(660, { at: 0.07, dur: 0.09, type: 'triangle' }); tone(880, { at: 0.14, dur: 0.14, type: 'triangle' }); },
  strike: () => noise({ dur: 0.18, freq: 3200, vol: 0.2 }),
  unstrike: () => tone(500, { dur: 0.08, slide: 300, type: 'triangle', vol: 0.1 }),
  join: () => { tone(660, { dur: 0.08 }); tone(990, { at: 0.08, dur: 0.12 }); },
  phase: () => { tone(330, { dur: 0.25, slide: 330, type: 'sine', vol: 0.14 }); },
  reveal: () => { [523, 659, 784].forEach((f, i) => tone(f, { at: i * 0.07, dur: 0.18, type: 'triangle', vol: 0.14 })); },
  tick: () => tone(1200, { dur: 0.03, vol: 0.07, type: 'square' }),
  urgent: () => tone(880, { dur: 0.06, vol: 0.12, type: 'square' }),
  correct: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, { at: i * 0.09, dur: 0.25, type: 'triangle', vol: 0.18 })); },
  wrong: () => { tone(300, { dur: 0.22, type: 'sawtooth', vol: 0.09, slide: -120 }); tone(220, { at: 0.18, dur: 0.3, type: 'sawtooth', vol: 0.09, slide: -80 }); },
  win: () => { [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, { at: i * 0.12, dur: 0.3, type: 'triangle', vol: 0.18 })); },
};

export function play(name) {
  if (muted) return;
  try { SFX[name]?.(); } catch {}
}
export function isMuted() { return muted; }
export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('radpa.mute', muted ? '1' : '0'); } catch {}
  if (!muted) play('tap');
  return muted;
}
export function unlock() { if (!muted) ac(); }
