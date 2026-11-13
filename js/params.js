// Every adjustable value, like the 'params' Table DAT in TouchDesigner.
// Keys 1-9 pick a row, left/right step it (shift = 10x, hold to repeat), R resets it.
// Key 0 picks 'image': left/right snap the wheel to the previous/next image instead.
// Defaults are the values the TD project had when this was ported.
// 'label' (optional) is what the HUD shows; 'name' stays the internal key.

export const PARAMS = [
  // name        key  default  step   hold/frame  min   max
  { name: 'spin',      key: '1', default: 0,     step: 0.005, hold: 0.002, min: null, max: null },
  { name: 'fine',      key: '2', default: 0,     step: 1,     hold: 0.25,  min: null, max: null },
  { name: 'radius_x',  key: '3', default: 1.33,  step: 0.05,  hold: 0.02,  min: 0.1,  max: null },
  { name: 'radius_z',  key: '4', default: 2.21,  step: 0.05,  hold: 0.02,  min: 0.1,  max: null },
  { name: 'card_yaw',  key: '5', default: 13,    step: 1,     hold: 0.5,   min: -180, max: 180 },
  { name: 'elevation', key: '6', default: 35.5,  step: 1,     hold: 0.5,   min: 0,    max: 90,  label: 'camera_lat' },
  { name: 'azimuth',   key: '7', default: 32.56, step: 1,     hold: 0.5,   min: -180, max: 180, label: 'camera_azi' },
  { name: 'zoom',      key: '8', default: 10,    step: 0.25,  hold: 0.1,   min: 1,    max: null },
  { name: 'focus_dir', key: '9', default: 109,   step: 5,     hold: 1,     min: -180, max: 180 },
  { name: 'image',     key: '0', snap: true },   // not a stored value: arrows snap the wheel image by image
];

const HOLD_DELAY = 0.35;   // seconds before a held arrow starts repeating
const SNAP_RATE = 8;       // images per second while an arrow is held on 'image'

// every load starts from the defaults; nothing is remembered between visits
export const values = Object.fromEntries(PARAMS.filter((p) => !p.snap).map((p) => [p.name, p.default]));
export const ui = { selected: 0, hudVisible: true };

// clear values an earlier version of the page saved in this browser
try { localStorage.removeItem('cycle.params'); } catch { /* storage unavailable */ }

export function clampSet(name, v) {
  const p = PARAMS.find((q) => q.name === name);
  if (p.min !== null) v = Math.max(p.min, v);
  if (p.max !== null) v = Math.min(p.max, v);
  values[name] = v;
}

let snap = () => {};   // set by initKeyboard: snap(steps) moves the wheel 'steps' images (0 = line up the nearest)

function nudge(amount) {
  const p = PARAMS[ui.selected];
  clampSet(p.name, values[p.name] + amount);
}

const held = { left: false, right: false, shift: false, pressedAt: 0, snapClock: 0 };

export function initKeyboard({ onToggleHud, onSnap } = {}) {
  if (onSnap) snap = onSnap;
  window.addEventListener('keydown', (e) => {
    // leave keys to text fields, dropdowns and open dialogs
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || document.querySelector('dialog[open]')) return;
    held.shift = e.shiftKey;
    const i = PARAMS.findIndex((p) => p.key === e.key);
    if (i >= 0) { ui.selected = i; return; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      if (e.repeat) return;   // holding is handled per frame in update()
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      if (dir > 0) held.right = true; else held.left = true;
      held.pressedAt = performance.now() / 1000;
      held.snapClock = 0;
      const p = PARAMS[ui.selected];
      if (p.snap) snap(dir * (e.shiftKey ? 10 : 1));
      else nudge(dir * p.step * (e.shiftKey ? 10 : 1));
    } else if (e.key === 'r' || e.key === 'R') {
      const p = PARAMS[ui.selected];
      if (p.snap) snap(0);
      else values[p.name] = p.default;
    } else if (e.key === 'h' || e.key === 'H') {
      ui.hudVisible = !ui.hudVisible;
      onToggleHud?.(ui.hudVisible);
    }
  });
  window.addEventListener('keyup', (e) => {
    held.shift = e.shiftKey;
    if (e.key === 'ArrowLeft') held.left = false;
    if (e.key === 'ArrowRight') held.right = false;
  });
  window.addEventListener('blur', () => { held.left = held.right = false; });
}

// Call once per frame: keeps stepping while an arrow is held (like hold_execute).
export function updateKeyboard(dt) {
  const d = (held.right ? 1 : 0) - (held.left ? 1 : 0);
  if (d && performance.now() / 1000 - held.pressedAt > HOLD_DELAY) {
    const p = PARAMS[ui.selected];
    if (p.snap) {
      // step image by image at a steady rate
      held.snapClock += dt;
      while (held.snapClock >= 1 / SNAP_RATE) { held.snapClock -= 1 / SNAP_RATE; snap(d * (held.shift ? 10 : 1)); }
    } else {
      // TD stepped 'hold' per frame at 60 fps; scale by dt so speed doesn't depend on frame rate
      nudge(d * p.hold * (held.shift ? 10 : 1) * dt * 60);
    }
  }
}
