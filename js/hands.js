// Hand tracking, ported from the TD chain:
//   MediaPipe plugin + hand_tracking  -> MediaPipe GestureRecognizer running in this page
//   hand_select + hand_filter (One Euro) -> OneEuro filters on 4 landmarks
//   gesture CHOP + gesture_execute    -> updateGesture(): dial, gap-as-gear, pinch clutch, open-palm lock
//   patched overlay script             -> drawOverlay(): dotted lines, squares, filled tips, X's

import { FilesetResolver, GestureRecognizer } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';

// Same values as 'gesture_settings' in TD
export const GESTURE = {
  close: 0.35,       // fingertip gap / hand size below which thumb + index count as touching (clutch)
  open: 0.5,         // ...and above which they count as apart again
  full: 1.3,         // gap at which the dial reaches full speed
  gainmin: 0.08,     // speed just before the clutch lets go
  gainmax: 1.0,      // wheel turns per hand turn at full spread
  curve: 0.6,        // < 1 keeps more speed as the fingers close
  direction: 1,      // set to -1 to reverse the dial
  maxstep: 45,       // ignore angle jumps bigger than this (tracking glitches)
  lockhold: 3,       // seconds of open palm to lock / unlock
  helphold: 5,       // seconds of open palm to show the gesture instructions (while the palm stays up)
  palmscore: 0.4,    // Open_Palm score that counts as an open palm
  palmgrace: 0.4,    // seconds of dropout allowed while holding the palm
  palmstraight: 1.15, // open hand by shape: each fingertip this much further from the wrist than its middle joint
  palmthumb: 0.55,   // ...and thumb tip at least this far from the index knuckle (x hand size)
};

// One Euro filter (same as TD's Filter CHOP 'oneeuro': cutoff 1, speed coefficient 2, slope cutoff 1)
class OneEuro {
  constructor(minCutoff = 1, beta = 2, dCutoff = 1) { Object.assign(this, { minCutoff, beta, dCutoff }); this.reset(); }
  reset() { this.x = null; this.dx = 0; this.t = 0; }
  static alpha(cutoff, dt) { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); }
  filter(x, t) {
    if (this.x === null) { this.x = x; this.t = t; return x; }
    const dt = Math.max(1e-3, t - this.t);
    const dx = (x - this.x) / dt;
    this.dx += OneEuro.alpha(this.dCutoff, dt) * (dx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuro.alpha(cutoff, dt) * (x - this.x);
    this.t = t;
    return this.x;
  }
}

const JOINTS = { wrist: 0, thumbTip: 4, indexMcp: 5, indexTip: 8 };
const filters = Object.fromEntries(Object.keys(JOINTS).flatMap((j) => [[j + 'x', new OneEuro()], [j + 'y', new OneEuro()]]));

// Live state, like the 'gesture' + 'gesture_state' CHOPs (shown in the HUD)
// starts locked: hold an open palm to unlock the gesture controls
export const hand = { active: false, spread: 0, angle: 0, palm: 0, palmShape: false, touching: false, engaged: false, gain: 0, locked: true, hold: 0, showHelp: false };
const mem = { prev: null, palmSeen: -99, fired: false, t: null };

let recognizer = null, video = null, overlay = null, ctx = null, onSpin = () => {}, landmarks = null;

export async function initHands({ videoEl, overlayEl, spin }) {
  video = videoEl; overlay = overlayEl; ctx = overlay.getContext('2d'); onSpin = spin;
  const vision = await FilesetResolver.forVisionTasks(WASM);
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: MODEL, delegate },
    runningMode: 'VIDEO',
    numHands: 1,
    minHandDetectionConfidence: 0.2,
    minHandPresenceConfidence: 0.2,
    minTrackingConfidence: 0.5,
    cannedGesturesClassifierOptions: { scoreThreshold: 0.2, maxResults: 2 },
  });
  try { recognizer = await GestureRecognizer.createFromOptions(vision, options('GPU')); }
  catch (err) { console.warn('GPU hand tracking unavailable, using CPU', err); recognizer = await GestureRecognizer.createFromOptions(vision, options('CPU')); }
}

export async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  video.srcObject = stream;
  await video.play();
  overlay.width = video.videoWidth; overlay.height = video.videoHeight;
  const step = () => { detect(); video.requestVideoFrameCallback(step); };   // once per camera frame
  video.requestVideoFrameCallback(step);
}

function detect() {
  if (!recognizer || video.readyState < 2) return;
  const now = performance.now();
  const res = recognizer.recognizeForVideo(video, now);
  landmarks = res.landmarks?.[0] || null;
  const palmCat = res.gestures?.[0]?.find((c) => c.categoryName === 'Open_Palm');
  updateGesture(now / 1000, landmarks, palmCat ? palmCat.score : 0);
  drawOverlay();
}

// Open hand by shape: all four fingers straight (tip well past the middle joint, seen from the wrist)
// and the thumb out to the side. The dial gesture curls three fingers, so it never counts.
function isOpenHand(lm, asp) {
  const d = (a, b) => Math.hypot((lm[a].x - lm[b].x) * asp, lm[a].y - lm[b].y);
  const size = Math.max(1e-4, d(0, 9));                       // wrist to middle-finger knuckle
  const straight = [[8, 6], [12, 10], [16, 14], [20, 18]]      // [tip, middle joint]
    .every(([tip, pip]) => d(0, tip) > d(0, pip) * GESTURE.palmstraight);
  const thumbOut = d(4, 5) / size > GESTURE.palmthumb;         // thumb tip away from the index knuckle
  return straight && thumbOut;
}

// Port of gesture_execute's onFrameStart
function updateGesture(now, lm, palmScore) {
  const s = GESTURE;
  const dt = mem.t === null ? 0 : now - mem.t;
  mem.t = now;
  hand.active = !!lm;

  if (lm) {
    // Mirror x and flip y, so angles are measured as the hand appears on screen (as in TD)
    const asp = video.videoWidth / video.videoHeight;
    const p = {};
    for (const [j, i] of Object.entries(JOINTS)) {
      p[j] = { x: filters[j + 'x'].filter((1 - lm[i].x) * asp, now), y: filters[j + 'y'].filter(1 - lm[i].y, now) };
    }
    const dx = p.indexTip.x - p.thumbTip.x, dy = p.indexTip.y - p.thumbTip.y;
    const hx = p.indexMcp.x - p.wrist.x, hy = p.indexMcp.y - p.wrist.y;
    hand.angle = Math.atan2(dy, dx) * 180 / Math.PI;
    hand.spread = Math.hypot(dx, dy) / Math.max(1e-4, Math.hypot(hx, hy));
    hand.palm = palmScore;
    hand.palmShape = isOpenHand(lm, asp);
  } else {
    Object.values(filters).forEach((f) => f.reset());
    hand.palm = 0;
    hand.palmShape = false;
  }

  // touching (clutch), with a gap between the close and open thresholds so it can't flicker
  if (!hand.active) hand.touching = false;
  else if (hand.touching && hand.spread > s.open) hand.touching = false;
  else if (!hand.touching && hand.spread < s.close) hand.touching = true;

  // open palm: held for lockhold seconds toggles the lock; held on past helphold seconds shows the
  // gesture instructions instead, undoing that toggle so a long hold leaves the lock as it was.
  // (either MediaPipe's Open_Palm score or the hand's shape counts, since the score alone runs close to its threshold)
  if (hand.active && (hand.palm > s.palmscore || hand.palmShape)) mem.palmSeen = now;
  const held = now - mem.palmSeen < s.palmgrace;     // bridge brief recognition dropouts
  if (held) {
    hand.hold += dt;                                  // seconds the palm has been up
    if (!mem.fired && hand.hold >= s.lockhold) { hand.locked = !hand.locked; mem.fired = true; }
    if (!hand.showHelp && hand.hold >= s.helphold) { hand.locked = !hand.locked; hand.showHelp = true; }
  } else { hand.hold = 0; mem.fired = false; hand.showHelp = false; }

  hand.engaged = hand.active && !hand.locked && !held && !hand.touching;
  hand.gain = 0;
  if (hand.engaged && mem.prev !== null) {
    const d = ((hand.angle - mem.prev + 540) % 360) - 180;     // change since last frame, wrapped to +-180
    if (Math.abs(d) < s.maxstep) {
      const t = Math.min(1, Math.max(0, (hand.spread - s.close) / Math.max(1e-4, s.full - s.close)));
      hand.gain = s.gainmin + (s.gainmax - s.gainmin) * t ** s.curve;
      onSpin((d / 360) * hand.gain * s.direction);
    }
  }
  mem.prev = hand.engaged ? hand.angle : null;
}

// The hand overlay from the patched MediaPipe page: dotted 1px lines that stop short of each joint,
// 1px square outlines, thumb + index tips filled (X while touching), every marker an X while locked.
// Sizes are screen pixels; k converts to canvas pixels since the canvas is scaled down to fit.
const FILLED = [4, 8];
function drawOverlay() {
  const W = overlay.width, H = overlay.height;
  ctx.clearRect(0, 0, W, H);
  if (!landmarks) return;
  const k = W / (overlay.getBoundingClientRect().width || W);
  const s = 4 * k, gap = 5 * k;
  const P = (q) => [(1 - q.x) * W, q.y * H];   // mirrored, to match the mirrored video
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = '#FFFFFF';
  ctx.lineWidth = 1 * k;
  ctx.lineCap = 'butt';

  ctx.beginPath();
  for (const c of GestureRecognizer.HAND_CONNECTIONS) {
    const [ax, ay] = P(landmarks[c.start]), [bx, by] = P(landmarks[c.end]);
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    if (len <= 2 * gap) continue;
    const ux = dx / len, uy = dy / len;
    ctx.moveTo(ax + ux * gap, ay + uy * gap);
    ctx.lineTo(bx - ux * gap, by - uy * gap);
  }
  ctx.setLineDash([1 * k, 2 * k]);   // 1px dot, 2px gap
  ctx.stroke();
  ctx.setLineDash([]);

  const cross = (x, y) => { ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.stroke(); };
  landmarks.forEach((q, i) => {
    const [x, y] = P(q);
    if (hand.locked) cross(x, y);
    else if (!FILLED.includes(i)) ctx.strokeRect(x - s, y - s, 2 * s, 2 * s);
    else if (!hand.touching) ctx.fillRect(x - s, y - s, 2 * s, 2 * s);
    else cross(x, y);
  });
  ctx.restore();
}
