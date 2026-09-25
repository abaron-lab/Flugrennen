// Spielablauf: Menü → Startbahn (Hände kalibrieren) → Countdown → Rennen (90 s) → Ergebnis.

import { PLANE_TYPES, COLORS, PLAYER_COLORS, drawPlane, BASE_SPEED, SPEED_BONUS, topSpeedKmh } from './planes.js';
import { generateTrack, updateObstacles, collides, CRUISE, ALT_RANGE, LANE, RACE_TIME } from './track.js';
import { renderView, renderGlobal } from './render.js';
import { HandTracker } from './hands.js';
import { initAudio, setEngine, beep, boom, fanfare } from './audio.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const menuEl = document.getElementById('menu');
const resultEl = document.getElementById('result');
const camWrap = document.getElementById('cam-wrap');
const video = document.getElementById('cam');
const overlay = document.getElementById('cam-overlay');

const tracker = new HandTracker(video, overlay);

const choice = [
  { type: 'prop', color: COLORS[0] },
  { type: 'jet', color: COLORS[5] },
];

const game = {
  state: 'menu',
  time: 0,
  raceT: 0,
  useCamera: false,
  track: generateTrack(1),
  players: [],
  banner: null,
  message: '',
  readyHold: 0,
  countdown: 0,
};

// ---------- Eingabe (Tastatur als Alternative / zum Testen) ----------
const keys = new Set();
const lastKey = [-1e9, -1e9];
const P_KEYS = [
  { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS' },
  { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' },
];
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  P_KEYS.forEach((k, i) => { if (Object.values(k).includes(e.code)) lastKey[i] = game.time; });
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  if (e.code === 'Space' && game.state === 'ready') startCountdown();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
canvas.addEventListener('pointerdown', () => { if (game.state === 'ready') startCountdown(); });

const kbCtl = [{ steer: 0, pitch: 0 }, { steer: 0, pitch: 0 }];
function keyboardControl(i, dt) {
  const k = P_KEYS[i];
  const ts = (keys.has(k.right) ? 1 : 0) - (keys.has(k.left) ? 1 : 0);
  const tp = (keys.has(k.up) ? 1 : 0) - (keys.has(k.down) ? 1 : 0);
  const c = kbCtl[i];
  c.steer += (ts - c.steer) * Math.min(1, dt * 6);
  c.pitch += (tp - c.pitch) * Math.min(1, dt * 3);
  return c;
}

// ---------- Spieler ----------
function makePlayer(i) {
  const spec = PLANE_TYPES.find((p) => p.id === choice[i].type);
  return {
    id: i, type: spec.id, spec, color: choice[i].color,
    x: i === 0 ? -12 : 12, y: 0.8, z: 0,
    speed: 0, lives: 5, alive: true, roll: 0,
    invuln: 0, hitFlash: 0, hitText: 0, shake: 0,
    cleanTime: 0, airborne: false, reachedCruise: false,
    smoke: [], ctl: { steer: 0, pitch: 0 }, handsTracked: false,
    finishZ: 0,
  };
}

function newRace() {
  game.track = generateTrack((Math.random() * 1e9) | 0);
  game.players = [makePlayer(0), makePlayer(1)];
  game.raceT = 0;
  game.readyHold = 0;
  game.banner = null;
  tracker.resetCalibration();
  game.state = 'ready';
  resultEl.classList.add('hidden');
  updateReadyMessage();
}

function updateReadyMessage() {
  game.message = game.useCamera
    ? 'Hände ans Steuer!\nBeide Spieler: Hände wie an ein Lenkrad halten\nStart automatisch, wenn beide erkannt sind (oder Leertaste/Tippen)'
    : 'Bereit zum Start!\nSpieler 1: W A S D  ·  Spieler 2: Pfeiltasten\nLeertaste oder Tippen zum Starten';
}

function startCountdown() {
  if (game.state !== 'ready') return;
  initAudio();
  game.state = 'countdown';
  game.countdown = 3;
  game.message = '';
  showBanner('3', 1, 22, '#fff');
  beep(440, 0.2);
}

function showBanner(text, dur, size, color, sub) {
  game.banner = { text, t: dur, dur, size, color, sub };
}

// ---------- Update ----------
function controlFor(p, dt) {
  const kb = keyboardControl(p.id, dt);
  const hc = tracker.players[p.id];
  p.handsTracked = hc.tracked;
  const keyboardActive = game.time - lastKey[p.id] < 1.2 || keys.size > 0 && Object.values(P_KEYS[p.id]).some((k) => keys.has(k));
  if (keyboardActive || !game.useCamera) return { steer: kb.steer, pitch: kb.pitch };
  if (hc.tracked || hc.handCount > 0) return { steer: hc.steer, pitch: hc.pitch };
  return { steer: 0, pitch: 0 };
}

function updatePlayer(p, dt) {
  p.invuln = Math.max(0, p.invuln - dt);
  p.hitFlash = Math.max(0, p.hitFlash - dt * 2);
  p.hitText = Math.max(0, p.hitText - dt);
  p.shake = Math.max(0, p.shake - dt * 2.5);
  for (const s of p.smoke) s.age += dt;
  p.smoke = p.smoke.filter((s) => s.age < 2);

  if (!p.alive) {
    // Absturz: trudeln und fallen
    p.speed = Math.max(20, p.speed - dt * 25);
    p.z += p.speed * dt;
    p.y = Math.max(0, p.y - dt * (20 + p.crashT * 25));
    p.crashT += dt;
    p.roll += dt * 5;
    if (p.y > 0 && Math.random() < 0.6) p.smoke.push({ x: p.x, y: p.y, z: p.z - 3, age: 0 });
    p.camOverride = p.camOverride || { x: p.x * 0.8, y: p.y + 7, z: p.z - 30 };
    p.camOverride.z += (p.z - 60 - p.camOverride.z) * dt;
    return;
  }

  const ctl = game.state === 'race' ? controlFor(p, dt) : { steer: 0, pitch: 0 };
  p.ctl = ctl;
  if (game.state !== 'race') return;

  const spec = p.spec;
  // Tempo: wird schneller, je länger man ohne Treffer fliegt
  p.cleanTime += dt;
  const cruiseSpeed = spec.speed * (BASE_SPEED + Math.min(SPEED_BONUS, p.cleanTime * 0.9));
  if (!p.airborne) {
    p.speed = Math.min(cruiseSpeed, p.speed + dt * 26);
    if (p.speed > 55) p.airborne = true;
  } else {
    p.speed += (cruiseSpeed - p.speed) * Math.min(1, dt * 0.8);
  }
  p.z += p.speed * dt;

  if (p.airborne && !p.reachedCruise) {
    // Steigflug nach dem Abheben
    const rate = Math.min(32, 6 + (p.speed - 55) * 1.5 + p.y * 0.25);
    p.y = Math.min(CRUISE, p.y + rate * dt);
    if (p.y >= CRUISE - 0.5) p.reachedCruise = true;
    p.roll += (0 - p.roll) * dt * 3;
  }
  if (p.reachedCruise) {
    const target = CRUISE + ctl.pitch * ALT_RANGE;
    const dy = target - p.y;
    p.y += Math.sign(dy) * Math.min(Math.abs(dy), Math.max(4, Math.abs(dy) * 2.2) * dt);
  }
  if (p.y > 20) {
    const vx = ctl.steer * 34 * spec.handling;
    p.x = Math.max(-LANE, Math.min(LANE, p.x + vx * dt));
    p.roll += (ctl.steer * 0.85 - p.roll) * Math.min(1, dt * 6);
  }

  // Kollisionen
  if (p.invuln <= 0) {
    for (const o of game.track.obstacles) {
      if (o.hit[p.id] || o.z > p.z + 80 || o.z + (o.d || 0) + 40 < p.z) continue;
      if (collides(o, p)) {
        o.hit[p.id] = true;
        hitPlayer(p);
        break;
      }
    }
  }
}

function hitPlayer(p) {
  p.lives--;
  p.invuln = 2;
  p.hitFlash = 1;
  p.hitText = 1;
  p.shake = 1;
  p.cleanTime = 0;
  p.speed *= 0.6;
  boom(0.3);
  if (p.lives <= 0) {
    p.alive = false;
    p.crashT = 0;
    p.finishZ = p.z;
    p.diedAt = game.raceT;
    boom(0.5);
  }
}

function update(dt) {
  game.time += dt;
  if (game.useCamera) tracker.update(game.time);
  if (game.banner) game.banner.t -= dt;

  if (game.state === 'ready') {
    for (const p of game.players) {
      p.ctl = game.useCamera ? tracker.players[p.id] : keyboardControl(p.id, dt);
      p.handsTracked = tracker.players[p.id].tracked;
    }
    if (game.useCamera && tracker.ready) {
      tracker.calibrate();
      const both = tracker.players.every((c) => c.tracked);
      game.readyHold = both ? game.readyHold + dt : 0;
      if (game.readyHold > 1.5) startCountdown();
    }
  } else if (game.state === 'countdown') {
    for (const p of game.players) {
      p.ctl = game.useCamera ? tracker.players[p.id] : keyboardControl(p.id, dt);
      p.handsTracked = tracker.players[p.id].tracked;
    }
    if (game.useCamera) tracker.calibrate();
    const before = Math.ceil(game.countdown);
    game.countdown -= dt;
    const now = Math.ceil(game.countdown);
    if (now !== before) {
      if (now > 0) { showBanner(String(now), 1, 22, '#fff'); beep(440, 0.2); }
      else {
        showBanner('LOS!', 1.2, 22, '#3ddc84');
        beep(880, 0.4);
        game.state = 'race';
        game.raceT = 0;
      }
    }
  } else if (game.state === 'race') {
    const prevT = game.raceT;
    game.raceT += dt;
    for (const p of game.players) updatePlayer(p, dt);
    const avgSpeed = game.players.reduce((s, p) => s + (p.alive ? p.speed : 0), 0) / 2;
    setEngine(Math.min(1, avgSpeed / 120), true);
    if (prevT < RACE_TIME - 10 && game.raceT >= RACE_TIME - 10) showBanner('NOCH 10 SEKUNDEN', 1.5, 7, '#ffd23f');
    if (game.raceT >= RACE_TIME || game.players.every((p) => !p.alive)) finishRace();
  } else if (game.state === 'finish') {
    for (const p of game.players) {
      if (!p.alive) updatePlayer(p, dt);
      else { p.z += p.speed * dt; p.roll *= 0.97; }
    }
  }
  updateObstacles(game.track, game.state === 'race' || game.state === 'finish' ? game.raceT : 0, game.time);
}

function finishRace() {
  game.state = 'finish';
  setEngine(0, false);
  fanfare();
  const [a, b] = game.players;
  for (const p of game.players) if (p.alive) p.finishZ = p.z;
  let winner;
  if (a.alive !== b.alive) winner = a.alive ? 0 : 1;
  else if (!a.alive) winner = a.diedAt > b.diedAt ? 0 : 1;
  else winner = a.z >= b.z ? 0 : 1;
  showBanner('ZIEL!', 2, 16, '#ffd23f');
  setTimeout(() => showResult(winner), 1800);
}

function showResult(winner) {
  const title = resultEl.querySelector('.winner');
  title.textContent = `Spieler ${winner + 1} gewinnt!`;
  title.style.color = PLAYER_COLORS[winner];
  const rows = game.players.map((p, i) => `
    <div class="stat" style="border-color:${PLAYER_COLORS[i]}">
      <h3 style="color:${PLAYER_COLORS[i]}">Spieler ${i + 1} ${i === winner ? '🏆' : ''}</h3>
      <p>${p.spec.name}</p>
      <p><b>${(p.finishZ / 1000).toFixed(2)} km</b> geflogen</p>
      <p>Leben übrig: ${'●'.repeat(Math.max(0, p.lives))}${'○'.repeat(5 - Math.max(0, p.lives))}</p>
      <p>${p.alive ? 'Im Ziel angekommen' : 'Abgestürzt'}</p>
    </div>`).join('');
  resultEl.querySelector('.stats').innerHTML = rows;
  resultEl.classList.remove('hidden');
}

// ---------- Rendering ----------
let W = 0, H = 0;
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

function render() {
  ctx.clearRect(0, 0, W, H);
  if (!game.players.length) game.players = [makePlayer(0), makePlayer(1)];
  const half = W / 2;
  renderView(ctx, { x: 0, y: 0, w: half, h: H }, game, 0);
  renderView(ctx, { x: half, y: 0, w: W - half, h: H }, game, 1);
  renderGlobal(ctx, W, H, game);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game.state === 'menu') {
    // Hintergrund im Menü: Flugzeuge rollen auf der Startbahn
    game.time += dt;
    for (const p of game.players) p.roll = Math.sin(game.time + p.id) * 0.05;
  } else {
    update(dt);
  }
  render();
  requestAnimationFrame(frame);
}

// ---------- Menü ----------
function buildMenu() {
  document.querySelectorAll('.pcard').forEach((card) => {
    const i = Number(card.dataset.player);
    card.style.setProperty('--pc', PLAYER_COLORS[i]);
    const types = card.querySelector('.types');
    const colors = card.querySelector('.colors');
    const refresh = () => {
      types.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.dataset.type === choice[i].type));
      colors.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.dataset.color === choice[i].color));
      const spec = PLANE_TYPES.find((p) => p.id === choice[i].type);
      card.querySelector('.desc').textContent = spec.desc;
      renderStats(card.querySelector('.plane-stats'), spec);
      game.players = [makePlayer(0), makePlayer(1)];
    };
    for (const pt of PLANE_TYPES) {
      const b = document.createElement('button');
      b.innerHTML = `${pt.name}<small>${topSpeedKmh(pt)} km/h</small>`;
      b.dataset.type = pt.id;
      b.onclick = () => { choice[i].type = pt.id; refresh(); };
      types.appendChild(b);
    }
    for (const c of COLORS) {
      const b = document.createElement('button');
      b.className = 'swatch';
      b.style.background = c;
      b.dataset.color = c;
      b.setAttribute('aria-label', 'Farbe ' + c);
      b.onclick = () => { choice[i].color = c; refresh(); };
      colors.appendChild(b);
    }
    refresh();
  });
  animatePreviews();
}

// Höchstgeschwindigkeit und Wendigkeit als Balken im Vergleich zu allen Flugzeugen
function renderStats(el, spec) {
  const maxTop = Math.max(...PLANE_TYPES.map(topSpeedKmh));
  const minTop = Math.min(...PLANE_TYPES.map(topSpeedKmh));
  const maxHand = Math.max(...PLANE_TYPES.map((t) => t.handling));
  const minHand = Math.min(...PLANE_TYPES.map((t) => t.handling));
  // Balken 45–100 %, damit Unterschiede gut sichtbar sind
  const pct = (v, lo, hi) => 45 + 55 * (hi === lo ? 1 : (v - lo) / (hi - lo));
  const top = topSpeedKmh(spec);
  el.innerHTML = `
    <div class="stat-row"><span>Höchstgeschw.</span>
      <div class="bar"><i style="width:${pct(top, minTop, maxTop)}%"></i></div><b>${top} km/h</b></div>
    <div class="stat-row"><span>Wendigkeit</span>
      <div class="bar"><i style="width:${pct(spec.handling, minHand, maxHand)}%"></i></div><b>${Math.round(spec.handling * 100)} %</b></div>`;
}

function animatePreviews() {
  const cards = [...document.querySelectorAll('.pcard')];
  const draw = (now) => {
    if (game.state === 'menu') {
      const t = now / 1000;
      cards.forEach((card) => {
        const i = Number(card.dataset.player);
        const cv = card.querySelector('canvas.preview');
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = cv.clientWidth, h = cv.clientHeight;
        if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
        const c = cv.getContext('2d');
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        const g = c.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#2a6fd0'); g.addColorStop(1, '#bfe0ff');
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
        drawPlane(c, choice[i].type, choice[i].color, w / 2, h / 2 + Math.sin(t * 1.3 + i) * 4, Math.min(w * 0.8, h * 1.6), Math.sin(t * 0.9 + i * 2) * 0.35, t);
      });
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}

async function start(withCamera) {
  initAudio();
  game.useCamera = withCamera;
  menuEl.classList.add('hidden');
  newRace();
  if (withCamera) {
    camWrap.classList.remove('hidden');
    if (!tracker.ready) {
      try {
        await tracker.start((s) => { if (s !== 'bereit') game.message = s; });
        const vw = video.videoWidth, vh = video.videoHeight;
        if (vw && vh) camWrap.style.aspectRatio = `${vw} / ${vh}`;
        updateReadyMessage();
      } catch (e) {
        console.error(e);
        game.useCamera = false;
        camWrap.classList.add('hidden');
        game.message = 'Kamera/Handerkennung nicht verfügbar\n' + (e.message || e) + '\nWeiter mit Tastatur – Leertaste zum Starten';
      }
    }
  } else {
    camWrap.classList.add('hidden');
  }
}

document.getElementById('btn-cam').onclick = () => start(true);
document.getElementById('btn-keys').onclick = () => start(false);
document.getElementById('btn-again').onclick = () => newRace();
document.getElementById('btn-menu').onclick = () => {
  resultEl.classList.add('hidden');
  menuEl.classList.remove('hidden');
  camWrap.classList.add('hidden');
  game.state = 'menu';
  game.message = '';
  game.banner = null;
  game.players = [makePlayer(0), makePlayer(1)];
};

window.__game = game; // für Tests/Debugging
buildMenu();
game.players = [makePlayer(0), makePlayer(1)];
requestAnimationFrame(frame);
