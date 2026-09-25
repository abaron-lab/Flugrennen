// Pseudo-3D-Rendering (Arcade-Stil): Welt, Hindernisse, Flugzeuge und HUD pro Bildschirmhälfte.

import { drawPlane, PLAYER_COLORS, PLANE_TYPES } from './planes.js';
import { CRUISE, ALT_RANGE, RACE_TIME } from './track.js';

const FAR = 2000;
const FOG_START = 1100;
const FIELDS = [
  [92, 168, 64], [118, 184, 74], [158, 188, 82], [206, 192, 104],
  [80, 146, 72], [136, 160, 64], [104, 176, 96],
];
const HAZE = [196, 220, 238];
const TILE_X = 90, TILE_Z = 110;

const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hash = (a, b) => {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function fogAlpha(dz) {
  return clamp(1 - (dz - FOG_START) / (FAR - FOG_START), 0, 1);
}

class View {
  constructor(cam, w, h) {
    this.cam = cam;
    this.w = w; this.h = h;
    this.cx = w / 2;
    this.hy = h * 0.36;
    this.f = Math.min(h * 0.95, w * 1.35);
  }
  // Projektion Welt → Bildschirm
  p(x, y, z) {
    const dz = Math.max(0.5, z - this.cam.z);
    const s = this.f / dz;
    return [this.cx + (x - this.cam.x) * s, this.hy - (y - this.cam.y) * s, s];
  }
}

function drawSky(ctx, v, t) {
  const { w, h, hy } = v;
  const g = ctx.createLinearGradient(0, -h * 0.5, 0, hy);
  g.addColorStop(0, '#1d5fbf');
  g.addColorStop(0.6, '#5ea6ee');
  g.addColorStop(1, rgb(HAZE));
  ctx.fillStyle = g;
  ctx.fillRect(-w, -h, w * 3, hy + h + 1);
  // Sonne
  const sx = w * 0.78 - v.cam.x * 0.05, sy = hy - v.h * 0.22;
  const sg = ctx.createRadialGradient(sx, sy, 2, sx, sy, h * 0.16);
  sg.addColorStop(0, 'rgba(255,255,230,1)');
  sg.addColorStop(0.15, 'rgba(255,250,200,0.9)');
  sg.addColorStop(1, 'rgba(255,240,200,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(sx - h * 0.2, sy - h * 0.2, h * 0.4, h * 0.4);
  // Ferne Bergkette am Horizont (nur seitliche Parallaxe)
  ctx.fillStyle = 'rgb(150,178,205)';
  ctx.beginPath();
  ctx.moveTo(-w, hy + 1);
  for (let x = -w; x <= w * 2; x += 10) {
    const a = (x - v.cx) / v.f + v.cam.x * 0.0015;
    const m = Math.max(0, Math.sin(a * 7.1) * 0.6 + Math.sin(a * 17.3 + 1) * 0.3 + Math.sin(a * 41 + 2) * 0.12);
    ctx.lineTo(x, hy - m * h * 0.07 - 2);
  }
  ctx.lineTo(w * 2, hy + 1);
  ctx.fill();
}

function drawGround(ctx, v, runway) {
  const { cam, cx, hy, f, w, h } = v;
  const x0 = -w * 0.5, x1 = w * 1.5, yEnd = h * 1.4;
  const camY = Math.max(1, cam.y);
  let step = 2;
  for (let sy = Math.floor(hy) + 1; sy < yEnd; sy += step) {
    const d = sy - hy;
    step = d < 20 ? 2 : d < 80 ? 3 : 4;
    const dz = camY * f / d;
    const fog = Math.min(1, dz / 3000);
    const wz = cam.z + dz;
    const tz = Math.floor(wz / TILE_Z);
    const tileW = TILE_X * f / dz;
    const hgt = step + 1;
    if (tileW < 9) {
      ctx.fillStyle = rgb(mixc(FIELDS[0], HAZE, Math.max(fog, 0.55)));
      ctx.fillRect(x0, sy, x1 - x0, hgt);
    } else {
      let k = Math.floor((cam.x + (x0 - cx) * dz / f) / TILE_X);
      for (let guard = 0; guard < 400; guard++, k++) {
        const a = cx + (k * TILE_X - cam.x) * f / dz;
        const b = a + tileW;
        ctx.fillStyle = rgb(mixc(FIELDS[hash(k, tz) % FIELDS.length], HAZE, fog));
        ctx.fillRect(Math.max(a, x0), sy, Math.min(b, x1) - Math.max(a, x0) + 1, hgt);
        if (b >= x1) break;
      }
    }
    // Landstraße entlang der Strecke
    const road = (xa, xb, col) => {
      const a = cx + (xa - cam.x) * f / dz, b = cx + (xb - cam.x) * f / dz;
      if (b - a < 0.6) return;
      ctx.fillStyle = col;
      ctx.fillRect(a, sy, b - a, hgt);
    };
    road(-6, 6, rgb(mixc([96, 96, 104], HAZE, fog)));
    if (Math.floor(wz / 24) % 2 === 0) road(-0.5, 0.5, rgb(mixc([240, 230, 150], HAZE, fog)));
    // Startbahn
    if (runway && wz > -80 && wz < 1100) {
      road(-32, 32, rgb(mixc([70, 72, 80], HAZE, fog)));
      road(-32, -30, '#eee'); road(30, 32, '#eee');
      if (Math.floor(wz / 30) % 2 === 0) road(-0.8, 0.8, '#fff');
      if (wz > 1060) road(-30, 30, 'rgba(255,255,255,0.8)');
    }
  }
}

function drawCloud(ctx, v, c) {
  const [sx, sy, s] = v.p(c.x, c.y, c.z);
  const r = c.size * s;
  if (r < 1) return;
  for (const [ox, oy, sc] of c.puffs) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(sx + ox * r, sy + oy * r, r * sc * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMountain(ctx, v, o) {
  const [lx, ly] = v.p(o.x - o.base, 0, o.z);
  const [rx, ry] = v.p(o.x + o.base, 0, o.z);
  const [px, py] = v.p(o.x, o.peak, o.z);
  const [mx, my] = v.p(o.x + o.base * 0.18, 0, o.z);
  ctx.fillStyle = '#8a7d6b';
  ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(px, py); ctx.lineTo(mx, my); ctx.fill();
  ctx.fillStyle = '#5e5448';
  ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(px, py); ctx.lineTo(rx, ry); ctx.fill();
  // Schneekappe
  const k = 0.22;
  const sl = [px + (lx - px) * k, py + (ly - py) * k];
  const sm = [px + (mx - px) * k, py + (my - py) * k];
  const sr = [px + (rx - px) * k, py + (ry - py) * k];
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(px, py); ctx.lineTo(sl[0], sl[1]);
  ctx.lineTo((sl[0] + sm[0]) / 2, (sl[1] + sm[1]) / 2 - (sm[1] - py) * 0.12);
  ctx.lineTo(sm[0], sm[1]); ctx.fill();
  ctx.fillStyle = '#d6e2f0';
  ctx.beginPath();
  ctx.moveTo(px, py); ctx.lineTo(sm[0], sm[1]);
  ctx.lineTo((sm[0] + sr[0]) / 2, (sm[1] + sr[1]) / 2 - (sm[1] - py) * 0.1);
  ctx.lineTo(sr[0], sr[1]); ctx.fill();
}

function towerColors(tint) {
  const palettes = [
    ['#6f8fb3', '#4b6485', '#9fb9d6'], ['#b9a58c', '#8a7862', '#d9c9b0'],
    ['#7aa39b', '#557a72', '#a8cdc5'], ['#9a8fb0', '#6d6385', '#c3b9d6'],
  ];
  return palettes[Math.floor(tint * palettes.length) % palettes.length];
}

function windowGrid(ctx, x0, y0, x1, y1, rows, cols, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, (x1 - x0) / cols * 0.18);
  ctx.beginPath();
  for (let i = 1; i < rows; i++) {
    const y = y0 + (y1 - y0) * i / rows;
    ctx.moveTo(x0, y); ctx.lineTo(x1, y);
  }
  for (let j = 1; j < cols; j++) {
    const x = x0 + (x1 - x0) * j / cols;
    ctx.moveTo(x, y0); ctx.lineTo(x, y1);
  }
  ctx.stroke();
}

function drawBox(ctx, v, xl, xr, top, z0, z1, cols) {
  const zf = Math.max(z0, v.cam.z + 2);
  const [fl, ft] = v.p(xl, top, zf);
  const [fr, fb] = v.p(xr, 0, zf);
  const [bl, bt] = v.p(xl, top, z1);
  const [br] = v.p(xr, 0, z1);
  const [, bb] = v.p(xr, 0, z1);
  // Seitenwand
  ctx.fillStyle = cols[1];
  if (v.cam.x < xl) {
    ctx.beginPath(); ctx.moveTo(fl, ft); ctx.lineTo(bl, bt); ctx.lineTo(bl, bb); ctx.lineTo(fl, fb); ctx.fill();
  } else if (v.cam.x > xr) {
    ctx.beginPath(); ctx.moveTo(fr, ft); ctx.lineTo(br, bt); ctx.lineTo(br, bb); ctx.lineTo(fr, fb); ctx.fill();
  }
  // Dach
  if (v.cam.y > top) {
    ctx.fillStyle = cols[2];
    ctx.beginPath(); ctx.moveTo(fl, ft); ctx.lineTo(fr, ft); ctx.lineTo(br, bt); ctx.lineTo(bl, bt); ctx.fill();
  }
  return { fl, fr, ft, fb };
}

function drawTower(ctx, v, o, t) {
  const cols = towerColors(o.tint);
  const { fl, fr, ft, fb } = drawBox(ctx, v, o.x - o.w / 2, o.x + o.w / 2, o.top, o.z, o.z + o.d, cols);
  const g = ctx.createLinearGradient(fl, 0, fr, 0);
  g.addColorStop(0, cols[0]);
  g.addColorStop(1, cols[1]);
  ctx.fillStyle = g;
  ctx.fillRect(fl, ft, fr - fl, fb - ft);
  if (fr - fl > 12) windowGrid(ctx, fl, ft, fr, fb, Math.round(o.top / 5), 6, 'rgba(20,30,50,0.35)');
  // Antenne mit Blinklicht
  const [ax, ay, s] = v.p(o.x, o.top + 14, o.z + o.d / 2);
  const [, aby] = v.p(o.x, o.top, o.z + o.d / 2);
  ctx.strokeStyle = '#333';
  ctx.lineWidth = Math.max(1, s * 0.6);
  ctx.beginPath(); ctx.moveTo(ax, aby); ctx.lineTo(ax, ay); ctx.stroke();
  if ((t * 1.5 + o.tint * 3) % 1 < 0.5) {
    ctx.fillStyle = '#ff2020';
    ctx.beginPath(); ctx.arc(ax, ay, Math.max(2, s * 1.2), 0, Math.PI * 2); ctx.fill();
  }
}

function drawGate(ctx, v, o, t) {
  const cols = towerColors(o.tint + 0.5);
  const xl = -o.halfW, xr = o.halfW;
  if (o.z + o.d < v.cam.z + 2) return;
  const { fl, fr, ft, fb } = drawBox(ctx, v, xl, xr, o.top, o.z, o.z + o.d, cols);
  const zf = Math.max(o.z, v.cam.z + 2);
  const [hl, ht] = v.p(o.hx - o.hw / 2, o.hy + o.hh / 2, zf);
  const [hr, hb] = v.p(o.hx + o.hw / 2, o.hy - o.hh / 2, zf);
  const [bl, bt] = v.p(o.hx - o.hw / 2, o.hy + o.hh / 2, o.z + o.d);
  const [br, bb] = v.p(o.hx + o.hw / 2, o.hy - o.hh / 2, o.z + o.d);
  // Fassade mit Loch (evenodd)
  ctx.fillStyle = cols[0];
  ctx.beginPath();
  ctx.rect(fl, ft, fr - fl, fb - ft);
  ctx.rect(hl, ht, hr - hl, hb - ht);
  ctx.fill('evenodd');
  ctx.save();
  ctx.beginPath();
  ctx.rect(fl, ft, fr - fl, fb - ft);
  ctx.rect(hl, ht, hr - hl, hb - ht);
  ctx.clip('evenodd');
  windowGrid(ctx, fl, ft, fr, fb, Math.round(o.top / 5), 40, 'rgba(20,30,50,0.3)');
  ctx.restore();
  // Tunnelwände im Loch
  const quad = (a, b, c, d, col) => {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.fill();
  };
  quad([hl, ht], [hr, ht], [br, bt], [bl, bt], '#2a2f3a');
  quad([hl, hb], [hr, hb], [br, bb], [bl, bb], '#555c6a');
  quad([hl, ht], [bl, bt], [bl, bb], [hl, hb], '#3a404c');
  quad([hr, ht], [br, bt], [br, bb], [hr, hb], '#3a404c');
  // Leuchtrahmen
  const pulse = 0.6 + 0.4 * Math.sin(t * 8);
  ctx.strokeStyle = `rgba(255,230,40,${pulse})`;
  ctx.lineWidth = Math.max(2, (hr - hl) * 0.06);
  ctx.strokeRect(hl, ht, hr - hl, hb - ht);
  // Pfeile zum Loch, solange weit weg
  if (o.z - v.cam.z > 250) {
    ctx.fillStyle = `rgba(255,230,40,${pulse})`;
    const cxh = (hl + hr) / 2, sz = Math.max(6, (hr - hl) * 0.35);
    ctx.beginPath();
    ctx.moveTo(cxh - sz, ht - sz * 1.8); ctx.lineTo(cxh + sz, ht - sz * 1.8); ctx.lineTo(cxh, ht - sz * 0.5);
    ctx.fill();
  }
}

function drawZeppelin(ctx, v, o) {
  // Rumpf aus Scheiben vom Heck (hinten, weit weg) zur Nase (vorne, uns zugewandt)
  const N = 9;
  const tail = v.p(o.x, o.y, o.z + o.len / 2);
  const tr = o.r * tail[2];
  // Heckflossen
  ctx.fillStyle = '#b3261e';
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    ctx.beginPath();
    ctx.moveTo(tail[0] + dy * tr * 0.3, tail[1] + dx * tr * 0.3);
    ctx.lineTo(tail[0] + dx * tr * 1.4, tail[1] + dy * tr * 1.4);
    ctx.lineTo(tail[0] - dy * tr * 0.3, tail[1] - dx * tr * 0.3);
    ctx.fill();
  }
  let sx = 0, sy = 0, r = 0;
  for (let i = 0; i <= N; i++) {
    const u = 1 - (2 * i) / N;                 // +1 Heck … -1 Nase
    if (o.z + u * o.len / 2 - v.cam.z < 4) continue;
    const prof = Math.sqrt(Math.max(0.04, 1 - Math.pow(Math.abs(u), 2.4)));
    const pp = v.p(o.x, o.y, o.z + u * o.len / 2);
    sx = pp[0]; sy = pp[1]; r = o.r * prof * pp[2];
    const shade = 150 + i * 9;
    ctx.fillStyle = `rgb(${shade},${shade + 3},${shade + 10})`;
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
    if (i === Math.round(N * 0.6)) {
      // Gondel unter dem Rumpf
      ctx.fillStyle = '#333';
      ctx.fillRect(sx - r * 0.3, sy + r * 0.95, r * 0.6, r * 0.35);
      ctx.fillStyle = '#ffe680';
      ctx.fillRect(sx - r * 0.22, sy + r * 1.02, r * 0.44, r * 0.12);
    }
  }
  // roter Ring und Glanz an der Nase
  if (r === 0) return;
  const nose = v.p(o.x, o.y, Math.max(v.cam.z + 4, o.z - o.len / 2 + o.len * 0.2));
  const nr = o.r * 0.8 * nose[2];
  ctx.strokeStyle = '#d62828';
  ctx.lineWidth = Math.max(1, nr * 0.14);
  ctx.beginPath(); ctx.arc(nose[0], nose[1], nr, 0, Math.PI * 2); ctx.stroke();
  const g = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.4, 1, sx, sy, r);
  g.addColorStop(0, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
}

function drawBalloon(ctx, v, o) {
  const [sx, sy, s] = v.p(o.x, o.y, o.z);
  const r = o.r * s;
  // Seile + Korb
  const by = sy + r * 1.75;
  ctx.strokeStyle = '#4a3b2a';
  ctx.lineWidth = Math.max(1, r * 0.04);
  ctx.beginPath();
  ctx.moveTo(sx - r * 0.55, sy + r * 0.8); ctx.lineTo(sx - r * 0.18, by);
  ctx.moveTo(sx + r * 0.55, sy + r * 0.8); ctx.lineTo(sx + r * 0.18, by);
  ctx.stroke();
  ctx.fillStyle = '#8b5a2b';
  ctx.fillRect(sx - r * 0.2, by, r * 0.4, r * 0.28);
  // Hülle mit Streifen
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(sx - r * 0.45, sy + r * 0.9);
  ctx.bezierCurveTo(sx - r * 1.3, sy + r * 0.2, sx - r * 1.1, sy - r * 1.05, sx, sy - r * 1.05);
  ctx.bezierCurveTo(sx + r * 1.1, sy - r * 1.05, sx + r * 1.3, sy + r * 0.2, sx + r * 0.45, sy + r * 0.9);
  ctx.closePath();
  ctx.clip();
  for (let i = -4; i < 4; i++) {
    ctx.fillStyle = o.colors[(i + 8) % 2];
    ctx.fillRect(sx + i * r * 0.28, sy - r * 1.2, r * 0.28 + 1, r * 2.3);
  }
  const g = ctx.createRadialGradient(sx - r * 0.4, sy - r * 0.5, r * 0.1, sx, sy, r * 1.3);
  g.addColorStop(0, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = g;
  ctx.fillRect(sx - r * 1.4, sy - r * 1.3, r * 2.8, r * 2.4);
  ctx.restore();
}

function drawObstacle(ctx, v, o, t) {
  switch (o.type) {
    case 'mountain': return drawMountain(ctx, v, o);
    case 'tower': return drawTower(ctx, v, o, t);
    case 'gate': return drawGate(ctx, v, o, t);
    case 'zeppelin': return drawZeppelin(ctx, v, o);
    case 'balloon': return drawBalloon(ctx, v, o);
  }
}

function drawPlaneInWorld(ctx, v, pl, t, alpha) {
  const [sx, sy, s] = v.p(pl.x, pl.y, pl.z);
  // Schatten auf der Startbahn
  if (pl.y < 40) {
    const [gx, gy, gs] = v.p(pl.x, 0, pl.z);
    ctx.fillStyle = `rgba(0,0,0,${0.35 * (1 - pl.y / 40)})`;
    ctx.beginPath(); ctx.ellipse(gx, gy, 5.5 * gs, 1.2 * gs, 0, 0, Math.PI * 2); ctx.fill();
  }
  if (!pl.alive) {
    // Rauchwolken
    for (const sm of pl.smoke) {
      const [mx, my, ms] = v.p(sm.x, sm.y, sm.z);
      ctx.fillStyle = `rgba(60,60,60,${0.5 * (1 - sm.age / 2)})`;
      ctx.beginPath(); ctx.arc(mx, my, (2 + sm.age * 4) * ms, 0, Math.PI * 2); ctx.fill();
    }
  }
  const blink = pl.invuln > 0 && Math.floor(pl.invuln * 12) % 2 === 0;
  drawPlane(ctx, pl.type, pl.color, sx, sy, 11 * s, pl.roll, t, blink ? alpha * 0.35 : alpha);
}

export function cameraFor(pl) {
  return { x: pl.x * 0.8, y: pl.y + 7, z: pl.z - 30 };
}

// Zeichnet die komplette Welt für einen Spieler in das Rechteck vp.
export function renderView(ctx, vp, game, pi) {
  const me = game.players[pi];
  const other = game.players[1 - pi];
  const cam = me.camOverride || cameraFor(me);
  const v = new View(cam, vp.w, vp.h);
  const t = game.time;

  ctx.save();
  ctx.beginPath(); ctx.rect(vp.x, vp.y, vp.w, vp.h); ctx.clip();
  ctx.translate(vp.x, vp.y);
  if (me.shake > 0) ctx.translate((Math.random() - 0.5) * me.shake * 18, (Math.random() - 0.5) * me.shake * 18);
  // Horizont neigt sich leicht mit der Querlage
  ctx.translate(v.cx, v.hy);
  ctx.rotate(-me.roll * 0.3);
  ctx.translate(-v.cx, -v.hy);

  drawSky(ctx, v, t);
  drawGround(ctx, v, true);

  // sichtbare Objekte sammeln und von hinten nach vorne zeichnen
  const items = [];
  for (const c of game.track.clouds) {
    const dz = c.z - cam.z;
    if (dz > 5 && dz < FAR) items.push({ dz, draw: () => drawCloud(ctx, v, c) });
  }
  for (const o of game.track.obstacles) {
    const back = o.z + (o.d || 0);
    const dz = o.z - cam.z;
    if (back - cam.z > 3 && dz < FAR) items.push({ dz: Math.max(dz, 3), draw: () => drawObstacle(ctx, v, o, t) });
  }
  for (const pl of [me, other]) {
    const dz = pl.z - cam.z;
    if (dz > 3 && dz < FAR) {
      const a = pl === me ? 1 : 0.9;
      items.push({ dz, draw: () => drawPlaneInWorld(ctx, v, pl, t, a), plane: pl });
    }
  }
  items.sort((a, b) => b.dz - a.dz);
  for (const it of items) {
    ctx.globalAlpha = fogAlpha(it.dz);
    it.draw();
    if (it.plane && it.plane !== me) {
      const [sx, sy] = v.p(it.plane.x, it.plane.y + 5, it.plane.z);
      ctx.fillStyle = PLAYER_COLORS[1 - pi];
      ctx.font = `bold ${Math.round(vp.h * 0.03)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`P${2 - pi}`, sx, sy);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Treffer-Blitz
  if (me.hitFlash > 0) {
    ctx.fillStyle = `rgba(255,40,40,${me.hitFlash * 0.5})`;
    ctx.fillRect(vp.x, vp.y, vp.w, vp.h);
  }
  drawHud(ctx, vp, game, pi);
}

function drawYoke(ctx, x, y, size, steer, pitch, color, tracked) {
  ctx.save();
  // Säule
  ctx.fillStyle = '#22252c';
  ctx.fillRect(x - size * 0.05, y, size * 0.1, size * 0.6);
  ctx.translate(x, y - pitch * size * 0.14);
  ctx.rotate(steer * 0.65);
  const bw = size, bh = size * 0.1, gh = size * 0.42, gw = size * 0.13;
  const R = (x0, y0, w, h, r) => { ctx.beginPath(); ctx.roundRect(x0, y0, w, h, r); ctx.fill(); };
  ctx.fillStyle = '#2d3139';
  R(-bw / 2, -bh / 2, bw, bh, bh / 2);
  ctx.fillStyle = '#3a3f49';
  R(-bw / 2 - gw / 2, -gh * 0.75, gw, gh, gw / 2);
  R(bw / 2 - gw / 2, -gh * 0.75, gw, gh, gw / 2);
  // Nabe
  ctx.fillStyle = '#1b1d22';
  ctx.beginPath(); ctx.arc(0, 0, size * 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(0, 0, size * 0.05, 0, Math.PI * 2); ctx.fill();
  // Hände
  for (const hx of [-bw / 2, bw / 2]) {
    ctx.save();
    if (tracked) {
      ctx.shadowColor = color;
      ctx.shadowBlur = size * 0.15;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(hx, -gh * 0.3, size * 0.085, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(hx, -gh * 0.3, size * 0.085, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

function outlinedText(ctx, text, x, y, size, fill, align = 'left') {
  ctx.font = `${size}px 'Russo One', system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size * 0.16);
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function drawHud(ctx, vp, game, pi) {
  const me = game.players[pi];
  const other = game.players[1 - pi];
  const color = PLAYER_COLORS[pi];
  const u = Math.min(vp.w, vp.h) / 100;
  const outer = pi === 0 ? vp.x + u * 4 : vp.x + vp.w - u * 4;
  const align = pi === 0 ? 'left' : 'right';
  const dir = pi === 0 ? 1 : -1;
  const top = vp.y + u * 5;

  // Leben (5 Punkte oben in der äußeren Ecke)
  for (let i = 0; i < 5; i++) {
    const x = outer + dir * (u * 2.6 + i * u * 5.6);
    ctx.beginPath(); ctx.arc(x, top + u * 2.4, u * 2.1, 0, Math.PI * 2);
    if (i < me.lives) {
      ctx.fillStyle = color; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }
  const typeName = PLANE_TYPES.find((p) => p.id === me.type)?.name || '';
  outlinedText(ctx, `SPIELER ${pi + 1}`, outer, top + u * 10.5, u * 4.2, color, align);
  outlinedText(ctx, typeName, outer, top + u * 14.5, u * 2.8, '#fff', align);

  // Position
  if (game.state === 'race' || game.state === 'finish') {
    const first = (me.alive && !other.alive) || (me.alive === other.alive && me.z >= other.z);
    outlinedText(ctx, first ? '1.' : '2.', outer, top + u * 24, u * 8, first ? '#ffd23f' : '#fff', align);
  }

  // Höhe und Tempo auf der Innenseite
  const inner = pi === 0 ? vp.x + vp.w - u * 4 : vp.x + u * 4;
  const ialign = pi === 0 ? 'right' : 'left';
  if (game.state === 'race' || game.state === 'finish') outlinedText(ctx, `${Math.round(me.y)} m`, inner, top + u * 20, u * 4.5, '#fff', ialign);
  if (game.state === 'race' || game.state === 'finish') outlinedText(ctx, `${Math.round(me.speed * 3.6)} km/h`, inner, top + u * 24.5, u * 3, '#dfe', ialign);
  // Höhenband
  if (me.y > CRUISE - ALT_RANGE - 15) {
    const bx = pi === 0 ? vp.x + vp.w - u * 5 : vp.x + u * 3;
    const by = top + u * 28, bh = u * 26;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(bx, by, u * 2, bh);
    const rel = clamp((me.y - (CRUISE - ALT_RANGE)) / (2 * ALT_RANGE), 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(bx - u * 0.5, by + bh / 2 - 1, u * 3, 2);
    ctx.fillStyle = color;
    ctx.fillRect(bx - u, by + bh * (1 - rel) - u * 0.8, u * 4, u * 1.6);
  }

  // Lenkrad unten in der Mitte
  const ctl = me.ctl || { steer: 0, pitch: 0 };
  const ysize = Math.min(vp.w * 0.42, vp.h * 0.36);
  drawYoke(ctx, vp.x + vp.w / 2, vp.y + vp.h - ysize * 0.32, ysize, ctl.steer, ctl.pitch, color,
    game.useCamera ? me.handsTracked : true);
  if (game.useCamera && !me.handsTracked && me.alive && game.state !== 'finish') {
    outlinedText(ctx, 'Beide Hände ins Bild!', vp.x + vp.w / 2, vp.y + vp.h - ysize * 0.72, u * 4, '#fff', 'center');
  }

  if (!me.alive) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(vp.x, vp.y + vp.h * 0.4, vp.w, vp.h * 0.14);
    outlinedText(ctx, 'ABGESTÜRZT', vp.x + vp.w / 2, vp.y + vp.h * 0.5, u * 9, '#ff5a4f', 'center');
  }
  if (me.hitText > 0) {
    outlinedText(ctx, 'AUTSCH! −1', vp.x + vp.w / 2, vp.y + vp.h * 0.3, u * 7 * (1 + (1 - me.hitText) * 0.2), '#ff5a4f', 'center');
  }
}

// Globales HUD über beiden Hälften: Zeit, Countdown, Meldungen.
export function renderGlobal(ctx, W, H, game) {
  const u = Math.min(W / 2, H) / 100;
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(W / 2 - 2, 0, 4, H);

  if (game.state === 'race' || game.state === 'finish') {
    const left = Math.max(0, RACE_TIME - game.raceT);
    const m = Math.floor(left / 60), s = Math.floor(left % 60);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.roundRect(W / 2 - u * 13, u * 2, u * 26, u * 10, u * 3); ctx.fill();
    outlinedText(ctx, `${m}:${String(s).padStart(2, '0')}`, W / 2, u * 10, u * 7.5, left < 10 ? '#ff5a4f' : '#ffd23f', 'center');
    // Fortschrittsbalken beider Spieler
    const bw = u * 60, bx = W / 2 - bw / 2, by = u * 14;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(bx, by, bw, u * 1.2);
    const maxZ = 10500;
    game.players.forEach((p, i) => {
      ctx.fillStyle = PLAYER_COLORS[i];
      const x = bx + clamp(p.z / maxZ, 0, 1) * bw;
      ctx.beginPath(); ctx.arc(x, by + u * 0.6, u * 1.6, 0, Math.PI * 2); ctx.fill();
    });
  }
  if (game.banner && game.banner.t > 0) {
    const b = game.banner;
    const scale = 1 + Math.max(0, b.t - (b.dur - 0.25)) * 3;
    outlinedText(ctx, b.text, W / 2, H * 0.3, u * b.size * scale, b.color, 'center');
    if (b.sub) outlinedText(ctx, b.sub, W / 2, H * 0.3 + u * 8, u * 4, '#fff', 'center');
  }
  if (game.message) {
    const lines = game.message.split('\n');
    lines.forEach((ln, i) => outlinedText(ctx, ln, W / 2, H * 0.22 + i * u * 6.5, u * (i === 0 ? 5 : 3.6), i === 0 ? '#ffd23f' : '#fff', 'center'));
  }
}
