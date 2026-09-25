// Streckengenerierung (für beide Spieler identisch) und Kollisionsprüfung.

export const CRUISE = 150;       // normale Flughöhe in Metern
export const ALT_RANGE = 20;     // +/- Meter, die man mit den Händen steigen/sinken kann
export const LANE = 55;          // seitlicher Spielraum in Metern
export const RACE_TIME = 90;     // Sekunden
export const HALF_SPAN = 4.5;    // halbe Spannweite für Kollision
export const HALF_HEIGHT = 1.8;

export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BALLOON_PALETTES = [
  ['#e63946', '#ffd23f'], ['#3a86ff', '#ffffff'], ['#8338ec', '#ff8c42'],
  ['#2ec4b6', '#ff5d8f'], ['#ff8c42', '#3d405b'],
];

export function generateTrack(seed) {
  const rnd = mulberry32(seed);
  const r = (a, b) => a + rnd() * (b - a);
  const obstacles = [];
  const clouds = [];
  let z = 800;
  let n = 0;

  while (z < 16000) {
    const diff = Math.min(1, z / 9000);
    n++;
    if (n % 8 === 0) {
      // Hochhaus mit Loch – man muss durchfliegen
      z += 120;
      obstacles.push({
        type: 'gate', z, d: 22, halfW: 100, top: CRUISE + 50,
        hx: r(-32, 32), hy: CRUISE + r(-12, 12), hw: 28, hh: 20,
        tint: r(0, 1),
      });
      z += 260;
      continue;
    }
    const t = rnd();
    if (t < 0.24) {
      const count = rnd() < 0.3 + diff * 0.4 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        obstacles.push({
          type: 'mountain', z: z + i * 25, x: r(-60, 60),
          peak: CRUISE + r(-8, 12), base: r(220, 340),
        });
      }
    } else if (t < 0.48) {
      const count = 1 + Math.floor(rnd() * (1.5 + diff * 1.8));
      const slots = [-45, -15, 15, 45].sort(() => rnd() - 0.5).slice(0, count);
      for (const sx of slots) {
        obstacles.push({
          type: 'tower', z: z + r(-10, 10), x: sx + r(-6, 6),
          w: r(22, 32), d: r(22, 32), top: CRUISE + r(-8, 12), tint: rnd(),
        });
      }
    } else if (t < 0.72) {
      obstacles.push({
        type: 'zeppelin', z0: z + 900, z: z + 900, vz: 22, x: r(-45, 45),
        y: CRUISE + r(4, 13), r: 11, len: 70,
      });
    } else {
      const count = rnd() < 0.35 + diff * 0.3 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        obstacles.push({
          type: 'balloon', z: z + i * 40, x: r(-48, 48), baseY: CRUISE + r(-12, 12),
          y: CRUISE, r: 10, phase: r(0, 6), colors: BALLOON_PALETTES[Math.floor(rnd() * BALLOON_PALETTES.length)],
        });
      }
    }
    z += r(170, 260) - diff * 60;
  }

  // Dekorative Wolken außerhalb der Flugbahn
  for (let cz = 200; cz < 17000; cz += r(120, 260)) {
    const side = rnd() < 0.5 ? -1 : 1;
    clouds.push({
      x: side * r(110, 500), y: r(60, 280), z: cz, size: r(25, 60),
      puffs: Array.from({ length: 5 }, () => [r(-1, 1), r(-0.3, 0.3), r(0.5, 0.9)]),
    });
  }

  for (const o of obstacles) o.hit = [false, false];
  obstacles.sort((a, b) => a.z - b.z);
  return { obstacles, clouds };
}

export function updateObstacles(track, raceT, t) {
  for (const o of track.obstacles) {
    if (o.type === 'zeppelin') o.z = o.z0 - o.vz * Math.max(0, raceT);
    else if (o.type === 'balloon') o.y = o.baseY + Math.sin(t * 0.8 + o.phase) * 2;
  }
}

export function collides(o, p) {
  const dz = p.z - o.z;
  const bottom = p.y - HALF_HEIGHT;
  switch (o.type) {
    case 'mountain': {
      if (Math.abs(dz) > 14 || bottom > o.peak) return false;
      const hw = o.base * (1 - bottom / o.peak);
      return Math.abs(p.x - o.x) < hw + HALF_SPAN;
    }
    case 'tower':
      return dz > -3 && dz < o.d + 3 && bottom < o.top && Math.abs(p.x - o.x) < o.w / 2 + HALF_SPAN;
    case 'gate': {
      if (dz < -2 || dz > o.d + 2 || bottom > o.top) return false;
      const inHole = Math.abs(p.x - o.hx) < o.hw / 2 - HALF_SPAN + 1 &&
        Math.abs(p.y - o.hy) < o.hh / 2 - HALF_HEIGHT;
      return !inHole;
    }
    case 'zeppelin':
      return Math.abs(dz) < o.len / 2 && Math.hypot(p.x - o.x, p.y - o.y) < o.r + 3.5;
    case 'balloon': {
      if (Math.abs(dz) > o.r) return false;
      if (Math.hypot(p.x - o.x, p.y - o.y) < o.r + 3.5) return true;
      return Math.abs(p.x - o.x) < 5 && p.y < o.y - o.r + 2 && p.y > o.y - o.r - 14;
    }
  }
  return false;
}
