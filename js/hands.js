// Handerkennung über die Kamera (MediaPipe Hand Landmarker).
// Das Kamerabild wird gespiegelt betrachtet: linke Bildhälfte = Spieler 1, rechte = Spieler 2.

import { PLAYER_COLORS } from './planes.js';

const MODEL_LOCAL = 'models/hand_landmarker.task';
const MODEL_REMOTE = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const PALM = [0, 5, 9, 13, 17];
const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11],
  [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

const MAX_ROLL = 38 * Math.PI / 180;  // Lenkradwinkel für vollen Ausschlag
const DEAD_ROLL = 4 * Math.PI / 180;
const PITCH_RANGE = 0.16;             // Hand-Höhe (Anteil Bildhöhe) für vollen Steig-/Sinkausschlag

function makeControl() {
  return {
    steer: 0, pitch: 0, tracked: false, handCount: 0, lastSeen: -1e9,
    neutralY: 0.55, calibSamples: 0, hands: [],
  };
}

export class HandTracker {
  constructor(video, overlay) {
    this.video = video;
    this.overlay = overlay;
    this.octx = overlay.getContext('2d');
    this.landmarker = null;
    this.ready = false;
    this.status = 'aus';
    this.lastVideoTime = -1;
    this.players = [makeControl(), makeControl()];
    this.rawHands = [];
  }

  async start(onStatus = () => {}) {
    const say = (s) => { this.status = s; onStatus(s); };
    say('Kamera wird gestartet …');
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Kamera nicht verfügbar. Seite muss über https:// oder localhost geöffnet werden.');
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    this.video.srcObject = stream;
    await this.video.play();

    say('Handerkennung wird geladen …');
    const { FilesetResolver, HandLandmarker } = await import('../vendor/mediapipe/vision_bundle.mjs');
    const fileset = await FilesetResolver.forVisionTasks(new URL('../vendor/mediapipe/wasm', import.meta.url).href);
    const opts = (modelAssetPath, delegate) => ({
      baseOptions: { modelAssetPath, delegate },
      runningMode: 'VIDEO',
      numHands: 4,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    const attempts = [[MODEL_LOCAL, 'GPU'], [MODEL_LOCAL, 'CPU'], [MODEL_REMOTE, 'GPU'], [MODEL_REMOTE, 'CPU']];
    let lastErr;
    for (const [path, delegate] of attempts) {
      try {
        this.landmarker = await HandLandmarker.createFromOptions(fileset, opts(path, delegate));
        break;
      } catch (e) { lastErr = e; }
    }
    if (!this.landmarker) throw lastErr;
    this.ready = true;
    say('bereit');
  }

  update(nowSec) {
    if (!this.ready || this.video.readyState < 2) return;
    if (this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      const res = this.landmarker.detectForVideo(this.video, performance.now());
      this.process(res.landmarks || [], nowSec);
    }
    for (const c of this.players) {
      if (nowSec - c.lastSeen > 0.4) {
        c.tracked = false;
        c.steer *= 0.9;
        c.pitch *= 0.9;
      }
    }
    this.drawOverlay();
  }

  process(landmarks, nowSec) {
    const aspect = (this.video.videoWidth || 16) / (this.video.videoHeight || 9);
    // gespiegelte Koordinaten: mx = 1 - x
    const hands = landmarks.map((lm) => {
      let x = 0, y = 0;
      for (const i of PALM) { x += 1 - lm[i].x; y += lm[i].y; }
      return { x: x / PALM.length, y: y / PALM.length, lm };
    });
    this.rawHands = hands;
    const sides = [[], []];
    for (const h of hands) sides[h.x < 0.5 ? 0 : 1].push(h);

    sides.forEach((list, pi) => {
      const c = this.players[pi];
      // höchstens zwei Hände pro Spieler: die, die am nächsten an der Mitte seiner Bildhälfte sind
      const center = pi === 0 ? 0.25 : 0.75;
      list.sort((a, b) => Math.abs(a.x - center) - Math.abs(b.x - center));
      const use = list.slice(0, 2).sort((a, b) => a.x - b.x);
      for (const h of hands) if (!use.includes(h) && sides[pi].includes(h)) h.ignored = true;
      c.hands = use;
      c.handCount = use.length;
      if (use.length === 0) return;
      c.lastSeen = nowSec;

      const avgY = use.reduce((s, h) => s + h.y, 0) / use.length;
      let targetSteer = c.steer * 0.95;
      if (use.length === 2) {
        const [l, rh] = use;
        const ang = Math.atan2(rh.y - l.y, (rh.x - l.x) * aspect);
        const a = Math.abs(ang) < DEAD_ROLL ? 0 : ang - Math.sign(ang) * DEAD_ROLL;
        targetSteer = Math.max(-1, Math.min(1, a / (MAX_ROLL - DEAD_ROLL)));
        c.tracked = true;
      }
      const targetPitch = Math.max(-1, Math.min(1, (c.neutralY - avgY) / PITCH_RANGE));
      c.steer += (targetSteer - c.steer) * 0.45;
      c.pitch += (targetPitch - c.pitch) * 0.35;
      c.avgY = avgY;
    });
  }

  // Während der Startphase: Neutralhöhe der Hände lernen
  calibrate() {
    for (const c of this.players) {
      if (c.tracked && c.avgY !== undefined) {
        c.calibSamples++;
        const k = 1 / Math.min(c.calibSamples, 30);
        c.neutralY += (c.avgY - c.neutralY) * k;
      }
    }
  }

  resetCalibration() {
    for (const c of this.players) c.calibSamples = 0;
  }

  drawOverlay() {
    const cv = this.overlay;
    const w = cv.clientWidth, h = cv.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const ctx = this.octx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
    ctx.setLineDash([]);
    for (const h0 of this.rawHands) {
      const color = h0.ignored ? '#999' : PLAYER_COLORS[h0.x < 0.5 ? 0 : 1];
      const P = (i) => [(1 - h0.lm[i].x) * w, h0.lm[i].y * h];
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (const [a, b] of CONNECTIONS) {
        const [ax, ay] = P(a), [bx, by] = P(b);
        ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
      }
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(h0.x * w, h0.y * h, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillStyle = PLAYER_COLORS[0];
    ctx.fillText('SPIELER 1', 8, 18);
    ctx.fillStyle = PLAYER_COLORS[1];
    ctx.textAlign = 'right';
    ctx.fillText('SPIELER 2', w - 8, 18);
    ctx.textAlign = 'left';
  }
}
