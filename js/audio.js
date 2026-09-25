// Einfache Arcade-Sounds mit WebAudio (keine Audiodateien nötig).

let ac = null;
let engine = null;

export function initAudio() {
  if (ac) { ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
  } catch { return; }
  const osc = ac.createOscillator();
  const osc2 = ac.createOscillator();
  const filter = ac.createBiquadFilter();
  const gain = ac.createGain();
  osc.type = 'sawtooth';
  osc2.type = 'square';
  filter.type = 'lowpass';
  filter.frequency.value = 420;
  gain.gain.value = 0;
  osc.connect(filter); osc2.connect(filter);
  filter.connect(gain); gain.connect(ac.destination);
  osc.start(); osc2.start();
  engine = { osc, osc2, gain, filter };
}

// level 0..1
export function setEngine(level, on) {
  if (!engine) return;
  const now = ac.currentTime;
  engine.osc.frequency.setTargetAtTime(55 + level * 70, now, 0.1);
  engine.osc2.frequency.setTargetAtTime(56.5 + level * 71, now, 0.1);
  engine.filter.frequency.setTargetAtTime(300 + level * 700, now, 0.1);
  engine.gain.gain.setTargetAtTime(on ? 0.05 + level * 0.04 : 0, now, 0.2);
}

export function beep(freq = 660, dur = 0.15, type = 'square', vol = 0.12) {
  if (!ac) return;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
  o.connect(g); g.connect(ac.destination);
  o.start(); o.stop(ac.currentTime + dur);
}

export function boom(vol = 0.35) {
  if (!ac) return;
  const len = 0.5;
  const buf = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
  const src = ac.createBufferSource();
  const f = ac.createBiquadFilter();
  const g = ac.createGain();
  src.buffer = buf;
  f.type = 'lowpass'; f.frequency.value = 900;
  g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(ac.destination);
  src.start();
}

export function fanfare() {
  [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.25, 'triangle', 0.15), i * 140));
}
