// Flugzeugtypen, Farben und das Zeichnen eines Flugzeugs von hinten.

export const PLANE_TYPES = [
  { id: 'prop', name: 'Propeller', desc: 'Ausgewogen', speed: 1.0, handling: 1.0 },
  { id: 'jet', name: 'Jet', desc: 'Schnell, aber träge', speed: 1.1, handling: 0.82 },
  { id: 'bi', name: 'Doppeldecker', desc: 'Wendig, etwas langsamer', speed: 0.93, handling: 1.25 },
];

export const COLORS = [
  '#e63946', '#ff8c42', '#ffd23f', '#3ddc84', '#2ec4b6',
  '#3a86ff', '#8338ec', '#ff5d8f', '#f1f1f1', '#3d405b',
];

// Tempo in m/s: Start-Reisetempo und maximaler Bonus, wenn man lange ohne Treffer fliegt.
export const BASE_SPEED = 72;
export const SPEED_BONUS = 38;
export const topSpeedKmh = (spec) => Math.round(spec.speed * (BASE_SPEED + SPEED_BONUS) * 3.6);

// Spielerfarben für Hände, Lenkrad und HUD.
export const PLAYER_COLORS = ['#2f8cff', '#ff8a1f'];

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// amt < 0 dunkler, amt > 0 heller
export function shade(hex, amt) {
  const c = hexToRgb(hex);
  const t = amt < 0 ? [0, 0, 0] : [255, 255, 255];
  const a = Math.abs(amt);
  return `rgb(${c.map((v, i) => Math.round(v + (t[i] - v) * a)).join(',')})`;
}

function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}

function propDisc(ctx, cx, cy, r, t) {
  ctx.fillStyle = 'rgba(230,230,230,0.22)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,40,40,0.35)';
  ctx.lineWidth = 2.2;
  const a = t * 47;
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  ctx.lineTo(cx - Math.cos(a) * r, cy - Math.sin(a) * r);
  ctx.stroke();
}

function fuselage(ctx, cx, cy, rx, ry, color) {
  const g = ctx.createRadialGradient(cx - rx * 0.35, cy - ry * 0.4, 1, cx, cy, Math.max(rx, ry));
  g.addColorStop(0, shade(color, 0.45));
  g.addColorStop(0.6, color);
  g.addColorStop(1, shade(color, -0.45));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function canopy(ctx, cx, cy, rx, ry) {
  const g = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
  g.addColorStop(0, '#9fe3ff');
  g.addColorStop(1, '#1b3a5a');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, 0);
  ctx.fill();
}

function wing(ctx, pts, color) {
  poly(ctx, pts);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = shade(color, -0.5);
  ctx.lineWidth = 1;
  ctx.stroke();
}

function tipLights(ctx, lx, rx, y, t) {
  const blink = (t * 2) % 1 < 0.15;
  ctx.fillStyle = '#ff2b2b';
  ctx.beginPath(); ctx.arc(lx, y, 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#29ff6a';
  ctx.beginPath(); ctx.arc(rx, y, 2, 0, Math.PI * 2); ctx.fill();
  if (blink) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(lx, y, 3.5, 0, Math.PI * 2); ctx.arc(rx, y, 3.5, 0, Math.PI * 2); ctx.fill();
  }
}

// Zeichnet ein Flugzeug von hinten. span = Spannweite in Pixeln.
export function drawPlane(ctx, typeId, color, x, y, span, roll, t, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(roll);
  const k = span / 100;
  ctx.scale(k, k);
  const dark = shade(color, -0.35);
  const light = shade(color, 0.3);

  if (typeId === 'jet') {
    // gepfeilte Flügel
    wing(ctx, [-50, -5, -9, 1, 9, 1, 50, -5, 50, -2, 9, 7, -9, 7, -50, -2], color);
    wing(ctx, [-50, -2, -9, 7, 9, 7, 50, -2, 50, -1, 9, 8, -9, 8, -50, -1], dark);
    tipLights(ctx, -49, 49, -3.5, t);
    // Doppelleitwerk
    wing(ctx, [-4, -1, -8, -1, -15, -19, -12, -19], dark);
    wing(ctx, [4, -1, 8, -1, 15, -19, 12, -19], dark);
    fuselage(ctx, 0, 1, 10, 9, color);
    canopy(ctx, 0, -5, 5, 5);
    wing(ctx, [-24, 6, 24, 6, 24, 9, -24, 9], light);
    // Triebwerke mit Nachbrenner
    const flick = 0.75 + Math.sin(t * 60) * 0.12 + Math.random() * 0.1;
    for (const ex of [-4.5, 4.5]) {
      ctx.fillStyle = '#222';
      ctx.beginPath(); ctx.arc(ex, 5, 4, 0, Math.PI * 2); ctx.fill();
      const g = ctx.createRadialGradient(ex, 5, 0.5, ex, 5, 6 * flick);
      g.addColorStop(0, 'rgba(255,255,220,1)');
      g.addColorStop(0.4, 'rgba(255,170,40,0.9)');
      g.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(ex, 5, 6 * flick, 0, Math.PI * 2); ctx.fill();
    }
  } else if (typeId === 'bi') {
    propDisc(ctx, 0, -3, 15, t);
    // Oberflügel, Unterflügel, Streben
    wing(ctx, [-44, 4, 44, 4, 44, 8, -44, 8], dark);
    ctx.strokeStyle = '#3b2a1a';
    ctx.lineWidth = 1.6;
    for (const sx of [-32, -14, 14, 32]) {
      ctx.beginPath(); ctx.moveTo(sx, -11); ctx.lineTo(sx, 5); ctx.stroke();
    }
    wing(ctx, [-48, -15, 48, -15, 48, -10, -48, -10], color);
    ctx.fillStyle = '#fff';
    for (const rx of [-38, 38]) {
      ctx.beginPath(); ctx.arc(rx, -12.5, 2.3, 0, Math.PI * 2); ctx.fill();
    }
    tipLights(ctx, -47, 47, -12.5, t);
    fuselage(ctx, 0, 0, 7.5, 7.5, color);
    canopy(ctx, 0, -6, 4, 3);
    wing(ctx, [-17, 8, 17, 8, 17, 11, -17, 11], light);
    wing(ctx, [-1.8, 9, 1.8, 9, 1.2, -12, -1.2, -10], color);
    ctx.fillStyle = '#fff';
    ctx.fillRect(-1.5, -6, 3, 3);
  } else {
    propDisc(ctx, 0, -2, 16, t);
    wing(ctx, [-50, -2, -8, 3, 8, 3, 50, -2, 50, 2, 8, 7, -8, 7, -50, 2], color);
    // weißer Streifen auf den Flügeln
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    poly(ctx, [-36, -0.2, -28, 0.8, -28, 4.8, -36, 3.8]); ctx.fill();
    poly(ctx, [36, -0.2, 28, 0.8, 28, 4.8, 36, 3.8]); ctx.fill();
    tipLights(ctx, -49, 49, 0, t);
    fuselage(ctx, 0, 2, 8, 8, color);
    canopy(ctx, 0, -4, 5, 4);
    wing(ctx, [-20, 8, 20, 8, 20, 11, -20, 11], light);
    wing(ctx, [-2, 9, 2, 9, 1.4, -14, -1.4, -12], color);
    ctx.fillStyle = '#fff';
    ctx.fillRect(-1.7, -8, 3.4, 3);
  }
  ctx.restore();
}
