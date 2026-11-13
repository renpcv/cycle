// Wires everything into one frame loop (the TD timeline).

import { PARAMS, values, ui, clampSet, initKeyboard, updateKeyboard } from './params.js';
import { initImages, useLocalFiles, useArenaChannel, arenaChannelSlug } from './images.js';
import { initWheel, setItems, setLayout, featuredIndex, render } from './wheel.js';
import { hand, GESTURE, initHands, startCamera } from './hands.js';
import { isSheet, readSheet, findFilenameColumn, columnNames, chooseColumns, notice, buildCaptions, imageKey } from './captions.js';

const $ = (sel) => document.querySelector(sel);
const wheelCanvas = $('#wheel');
const featuredBox = $('#featured');
const featuredCanvas = $('#featured canvas');
const cameraBox = $('#camera');
const video = $('#camera video');
const startBtn = $('#start-camera');
const hud = $('#hud pre');
const status = $('#status');
const cameraNotes = $('#camera-notes');
const gestureHelp = $('#gesture-help');
const helpNote = $('#help-note');
const gNote = $('#g-note');

let items = [];
let shownIndex = -2;     // featured image currently drawn
let shownKey = null;

// ---------- images ----------
initWheel(wheelCanvas);
const startArena = new URLSearchParams(location.search).get('arena');
initImages((list, removed) => {
  items = list;
  setItems(list, removed);
  shownIndex = -2;
  status.textContent = list.length ? '' : 'No images yet';
}, (message) => { status.textContent = message; }, { server: !startArena });

// the address remembers an Are.na channel (?arena=<channel>), so a bookmark or shared link opens that image set
function setArenaParam(slug) {
  const url = new URL(location.href);
  if (slug) url.searchParams.set('arena', slug); else url.searchParams.delete('arena');
  history.replaceState(null, '', url);
}

// ---------- captions from a spreadsheet in a local folder ----------
const captionBox = $('#caption');
const dialog = $('#caption-dialog');
let captions = null;     // imageKey -> { title, extras }, or null for images only

function setCaptions(map) { captions = map; shownIndex = -2; }

// A picked or dropped folder: show its images, then offer captions if it holds a spreadsheet
async function useFolder(files) {
  setArenaParam(null);
  setCaptions(null);
  const all = [...files];
  const sheets = all.filter(isSheet).sort((a, b) => a.name.localeCompare(b.name));
  const images = all.filter((f) => !isSheet(f));
  const loading = useLocalFiles(images);
  if (!sheets.length) return;
  const sheet = sheets[0];
  let rows;
  try { rows = await readSheet(sheet); } catch (err) {
    console.error(err);
    return notice(dialog, 'Couldn’t read the spreadsheet', `${sheet.name} couldn’t be opened, so images are shown without titles.`);
  }
  const names = images.map((f) => f.name);
  const found = rows.length ? findFilenameColumn(rows, names) : null;
  if (!found) {
    return notice(dialog, 'No filename column found',
      `None of the columns in ${sheet.name} contain the names of the image files, so images are shown without titles. Add a column with each image’s filename (e.g. photo01.jpg) to use the spreadsheet.`);
  }
  const columns = columnNames(rows, found.hasHeader);
  const choice = await chooseColumns(dialog, { sheetName: sheet.name, names: columns, fileCol: found.col, matches: found.matches, total: names.length });
  await loading;
  if (choice) setCaptions(buildCaptions(rows, { fileCol: found.col, hasHeader: found.hasHeader, names: columns }, choice));
}

// instructions open under their link; the link toggles them, "hide" at the end closes them
const help = $('#help');
$('#show-help').addEventListener('click', () => { help.hidden = !help.hidden; });
$('#hide-help').addEventListener('click', () => { help.hidden = true; });

const folderInput = $('#folder-input');
$('#choose-folder').addEventListener('click', () => folderInput.click());
folderInput.addEventListener('change', () => { useFolder(folderInput.files); folderInput.value = ''; });

const arenaForm = $('#arena-form');
const arenaLink = $('#arena-link');
$('#choose-arena').addEventListener('click', () => { arenaForm.hidden = !arenaForm.hidden; if (!arenaForm.hidden) arenaLink.focus(); });
arenaForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const slug = arenaChannelSlug(arenaLink.value);
  if (!slug) { status.textContent = 'That doesn’t look like an Are.na channel link'; return; }
  arenaForm.hidden = true;
  setArenaParam(slug);
  setCaptions(null);
  useArenaChannel(slug);
});
if (startArena) useArenaChannel(startArena);

// drag and drop: files, or a whole folder
window.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('dragging'); });
window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  document.body.classList.remove('dragging');
  const entries = [...e.dataTransfer.items].map((it) => it.webkitGetAsEntry?.()).filter(Boolean);
  const files = (await Promise.all(entries.map(readEntry))).flat();
  useFolder(files.length ? files : e.dataTransfer.files);
});
async function readEntry(entry) {
  if (entry.isFile) return new Promise((res) => entry.file((f) => res([f]), () => res([])));
  if (!entry.isDirectory) return [];
  const reader = entry.createReader();
  const all = [];
  for (;;) {   // readEntries returns results in batches
    const batch = await new Promise((res) => reader.readEntries(res, () => res([])));
    if (!batch.length) break;
    all.push(...batch);
  }
  return (await Promise.all(all.filter((e2) => e2.isFile).map(readEntry))).flat();
}

// ---------- hands ----------
const handsReady = initHands({
  videoEl: video,
  overlayEl: $('#camera .overlay'),
  spin: (delta) => clampSet('spin', values.spin + delta),
});
handsReady.catch((err) => { console.error(err); status.textContent = 'Hand tracking failed to load'; });

async function camera() {
  startBtn.disabled = true;
  startBtn.textContent = 'Loading hand model…';
  try {
    await handsReady;
    await startCamera();
    cameraBox.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
    startBtn.remove();
  } catch (err) {
    console.error(err);
    startBtn.disabled = false;
    startBtn.textContent = 'Start camera';
    status.textContent = window.isSecureContext ? `Camera unavailable: ${err.name || err.message}` : 'Camera needs https:// or localhost';
  }
}
startBtn.addEventListener('click', camera);
// start straight away if this site already has camera permission
navigator.permissions?.query({ name: 'camera' }).then((p) => { if (p.state === 'granted') camera(); }).catch(() => {});

// ---------- keyboard + HUD ----------
initKeyboard({ onToggleHud: (visible) => { document.body.classList.toggle('hud-hidden', !visible); placeNotes(); } });

function fmt(v) { return Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/0+$/, '').replace(/\.$/, ''); }
function drawHud() {
  const rows = PARAMS.map((p, i) => `${i === ui.selected ? '>' : ' '} ${p.key}  ${(p.label || p.name).padEnd(10)} ${fmt(values[p.name])}`);
  // hand status always fits on one line, so nothing below it moves
  const state = hand.locked ? 'LOCKED' : 'unlocked';
  const detail = !hand.active ? 'no hand'
    : hand.hold > 0 ? `palm ${hand.hold.toFixed(1)}s`
    : hand.engaged ? `dial  spread ${hand.spread.toFixed(2)}  gain ${hand.gain.toFixed(2)}`
    : 'clutch';
  hud.textContent = `1-9 select · ←/→ adjust (shift ×10) · R reset\n\n${rows.join('\n')}\n\n${state} · ${detail}\n${items.length} images`;
}

// ---------- layout: wheel sits left of the featured image, above the camera view ----------
// hand notes: right of the video, lined up with its top; moved up only as far as needed
// to keep the opened gesture instructions on screen
function placeNotes() {
  const c = cameraBox.getBoundingClientRect();
  const left = c.right + 20;
  // "Press G" line: level with the bottom of the video
  Object.assign(gNote.style, { left: `${left}px`, top: `${c.bottom - gNote.offsetHeight}px` });
  const gShown = gNote.offsetHeight > 0;
  // stop short of the featured image so the notes never run under it or its caption
  const width = Math.max(200, Math.min(560, featuredBox.getBoundingClientRect().left - 24 - left));
  cameraNotes.style.width = `${width}px`;
  gestureHelp.style.maxWidth = `${window.innerWidth - left - 16}px`;   // instructions may run past the column, not off screen
  // top-aligned with the video, moved up only as far as needed to stay above the G line / screen edge
  const floor = gShown ? c.bottom - gNote.offsetHeight - 12 : window.innerHeight - 16;
  const top = Math.min(c.top, floor - cameraNotes.offsetHeight);
  Object.assign(cameraNotes.style, { left: `${left}px`, top: `${Math.max(8, top)}px` });
}

// G hides or shows the hand notes and its own line (the 5-second palm instructions still appear)
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || document.querySelector('dialog[open]')) return;
  if (e.key === 'g' || e.key === 'G') {
    cameraNotes.classList.toggle('notes-hidden');
    gNote.classList.toggle('g-hidden', cameraNotes.classList.contains('notes-hidden'));
    placeNotes();
  }
});

function layout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const f = featuredBox.getBoundingClientRect();
  const c = cameraBox.getBoundingClientRect();
  setLayout(Math.min(0.5, f.left / 2 / vw), Math.min(0.5, c.top / 2 / vh));
  placeNotes();
  const dpr = window.devicePixelRatio;
  featuredCanvas.width = Math.round(f.width * dpr);
  featuredCanvas.height = Math.round(f.height * dpr);
  shownIndex = -2;
}
window.addEventListener('resize', layout);
new ResizeObserver(layout).observe(cameraBox);
layout();

// ---------- featured image: drawn to fit its box, only when it changes ----------
function drawFeatured(i) {
  const it = items[i];
  if (i === shownIndex && it?.key === shownKey) return;
  shownIndex = i; shownKey = it?.key;
  const g = featuredCanvas.getContext('2d');
  g.clearRect(0, 0, featuredCanvas.width, featuredCanvas.height);
  captionBox.hidden = true;
  if (!it) return;
  const W = featuredCanvas.width, H = featuredCanvas.height;
  const s = Math.min(W / it.full.width, H / it.full.height);
  const w = it.full.width * s, h = it.full.height * s;
  g.imageSmoothingQuality = 'high';
  g.drawImage(it.full, (W - w) / 2, (H - h) / 2, w, h);
  drawCaption(captions?.get(imageKey(it.name)), w, h);
}

// Title and extra lines under the featured image, aligned to the drawn image (canvas px -> CSS px)
function drawCaption(cap, w, h) {
  if (!cap) return;
  const k = featuredCanvas.clientWidth / featuredCanvas.width;
  const left = (featuredCanvas.width - w) / 2 * k, top = ((featuredCanvas.height + h) / 2) * k;
  Object.assign(captionBox.style, { left: `${left}px`, top: `${top + 12}px`, width: `${w * k}px` });
  const lines = [];
  if (cap.title) lines.push(Object.assign(document.createElement('div'), { className: 'title', textContent: cap.title }));
  for (const x of cap.extras) {
    const line = Object.assign(document.createElement('div'), { className: 'extra' });
    line.append(Object.assign(document.createElement('span'), { className: 'label', textContent: x.label }), x.value);
    lines.push(line);
  }
  captionBox.replaceChildren(...lines);
  captionBox.hidden = false;
}

// ---------- frame loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  updateKeyboard(dt);
  render(values);
  drawFeatured(featuredIndex(values));
  cameraNotes.classList.toggle('unlocked', !hand.locked);  // white while locked, grey while unlocked
  gNote.classList.toggle('unlocked', !hand.locked);
  if (gestureHelp.hidden === hand.showHelp) {             // open palm held for over 5 seconds
    gestureHelp.hidden = !hand.showHelp;
    placeNotes();
  }
  // the 5-second note: appears after 1 s of open palm, fading in until the instructions open at 5 s
  const fade = Math.min(1, Math.max(0, (hand.hold - 1) / (GESTURE.helphold - 1)));
  if (helpNote.hidden === hand.hold > 1) {
    helpNote.hidden = !(hand.hold > 1);
    placeNotes();
  }
  helpNote.style.opacity = fade;
  if (ui.hudVisible) drawHud();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
