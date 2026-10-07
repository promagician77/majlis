// Tiny procedural sound kit (WebAudio): no audio files to license or download.
let ctx = null, master = null, muted = false;
try { muted = localStorage.getItem('majlis-mute') === '1'; } catch {}

export function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ctx.destination);
}
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; try { localStorage.setItem('majlis-mute', m ? '1' : '0'); } catch {} }
export const isMuted = () => muted;

function noise(dur, freq, q, gain, when = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + when;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.value = gain;
  src.connect(f).connect(g).connect(master); src.start(t);
}
function tone(freq, dur, gain, when = 0, type = 'sine') {
  if (!ctx || muted) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
}

export const sfx = {
  card: () => noise(0.09, 2600, 0.9, 0.9),
  deal: () => { for (let i = 0; i < 8; i++) noise(0.06, 2400 + Math.random() * 600, 1, 0.45, i * 0.13); },
  sweep: () => noise(0.25, 1400, 0.6, 0.5),
  coin: (n = 1) => { for (let i = 0; i < n; i++) { const w = i * 0.07; tone(2350, 0.18, 0.12, w, 'triangle'); tone(3520, 0.12, 0.06, w + 0.01); } },
  turn: () => { tone(660, 0.35, 0.12); tone(990, 0.4, 0.08, 0.09); },
  reject: () => { tone(160, 0.22, 0.25, 0, 'square'); },
  win: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.5, 0.1, i * 0.09, 'triangle')); },
};
