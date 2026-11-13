// Titles and extra info for images, from a spreadsheet in a local image folder.
//   readSheet()           CSV / TSV as text, Excel / LibreOffice files with SheetJS (loaded only when needed)
//   findFilenameColumn()  the column whose values match the folder's image files
//   chooseColumns()       dialog: pick the title column and up to 4 extra columns
//   buildCaptions()       image -> { title, extras: [{ label, value }] }

const SHEET_TYPE = /\.(csv|tsv|xlsx|xls|ods)$/i;
const SHEETJS = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/xlsx.mjs';
const MAX_EXTRAS = 4;

export const isSheet = (file) => SHEET_TYPE.test(file.name) && !file.name.startsWith('~$');   // skip Excel lock files

// Image name -> matching key: no folders, no extension, case-insensitive
export function imageKey(name) {
  const base = String(name).trim().split(/[\\/]/).pop();
  return base.replace(/\.[a-z0-9]{2,5}$/i, '').toLowerCase();
}

// ---------- reading ----------

export async function readSheet(file) {
  let rows;
  if (/\.(csv|tsv)$/i.test(file.name)) {
    rows = parseDelimited((await file.text()).replace(/^﻿/, ''));
  } else {
    const XLSX = await import(SHEETJS);
    const book = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheet = book.Sheets[book.SheetNames[0]];   // first sheet
    rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  }
  rows = rows.map((r) => r.map((c) => String(c ?? '').trim()));
  return rows.filter((r) => r.some((c) => c !== ''));   // drop empty rows
}

// Comma, semicolon or tab separated, with "quoted" fields that may contain separators, quotes ("") and line breaks
function parseDelimited(text) {
  const nl = text.indexOf('\n');
  const firstLine = nl < 0 ? text : text.slice(0, nl);
  const sep = ['\t', ';', ','].reduce((best, s) => (firstLine.split(s).length > firstLine.split(best).length ? s : best), ',');
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === sep) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ---------- matching ----------

// Returns { col, matches, hasHeader } for the column that names the most images, or null if none do
export function findFilenameColumn(rows, imageNames) {
  const keys = new Set(imageNames.map(imageKey));
  const width = Math.max(...rows.map((r) => r.length));
  let best = null;
  for (let c = 0; c < width; c++) {
    const matches = new Set(rows.map((r) => imageKey(r[c] ?? '')).filter((k) => k && keys.has(k))).size;
    if (matches && (!best || matches > best.matches)) best = { col: c, matches };
  }
  if (!best) return null;
  best.hasHeader = !keys.has(imageKey(rows[0][best.col] ?? ''));   // first row is data if it names an image
  return best;
}

export function columnNames(rows, hasHeader) {
  const width = Math.max(...rows.map((r) => r.length));
  return Array.from({ length: width }, (_, c) => {
    const letter = c < 26 ? String.fromCharCode(65 + c) : `${c + 1}`;
    return (hasHeader && rows[0][c]) || `Column ${letter}`;
  });
}

// ---------- dialog ----------

// Resolves to { title, extras } (column indexes, title may be -1) or null for "Images only"
export function chooseColumns(dialog, { sheetName, names, fileCol, matches, total }) {
  const guessTitle = names.findIndex((n, c) => c !== fileCol && /title|name|caption/i.test(n));
  const titleDefault = guessTitle >= 0 ? guessTitle : names.findIndex((_, c) => c !== fileCol);

  dialog.replaceChildren();
  const form = el('form', { method: 'dialog' });
  form.append(
    el('h2', {}, 'Captions from spreadsheet'),
    el('p', { className: 'muted' }, `${sheetName}: filenames in “${names[fileCol]}”, ${matches} of ${total} images matched.`),
  );
  // one row: a name, a column dropdown and (for info lines) a "show heading" toggle
  const pick = (label, value, withHeading) => {
    const select = el('select', { title: label || 'Additional info' });
    select.append(el('option', { value: '-1' }, '—'));
    names.forEach((n, c) => select.append(el('option', { value: String(c) }, n)));
    select.value = String(value);
    const heading = withHeading ? el('input', { type: 'checkbox', title: 'Show the column name before the value' }) : null;
    form.append(el('div', { className: 'row' },
      el('span', {}, label), select,
      heading ? el('label', { className: 'toggle' }, heading, 'show heading') : el('span')));
    return { select, heading };
  };
  const titleSel = pick('Title', titleDefault, false).select;
  const extraSels = Array.from({ length: MAX_EXTRAS }, (_, i) => pick(i ? '' : 'Additional info', -1, true));
  // the toggle only matters once a column is picked
  for (const x of extraSels) {
    const sync = () => { x.heading.disabled = x.select.value === '-1'; x.heading.parentElement.style.opacity = x.heading.disabled ? 0.35 : 1; };
    x.select.addEventListener('change', sync);
    sync();
  }
  const buttons = el('div', { className: 'buttons' },
    el('button', { value: 'none', type: 'submit' }, 'Images only'),
    el('button', { value: 'ok', type: 'submit', className: 'primary' }, 'Show captions'));
  form.append(buttons);
  dialog.append(form);
  dialog.showModal();

  return new Promise((resolve) => {
    dialog.addEventListener('close', () => {
      if (dialog.returnValue !== 'ok') return resolve(null);
      resolve({
        title: Number(titleSel.value),
        extras: extraSels.map((x) => ({ col: Number(x.select.value), heading: x.heading.checked })).filter((x) => x.col >= 0),
      });
    }, { once: true });
  });
}

// A notice in the same dialog, e.g. when no column matches the images
export function notice(dialog, title, text) {
  dialog.replaceChildren();
  const form = el('form', { method: 'dialog' },
    el('h2', {}, title), el('p', { className: 'muted' }, text),
    el('div', { className: 'buttons' }, el('button', { value: 'ok', type: 'submit', className: 'primary' }, 'OK')));
  dialog.append(form);
  dialog.showModal();
}

// ---------- captions ----------

export function buildCaptions(rows, { fileCol, hasHeader, names }, choice) {
  const captions = new Map();
  for (const r of hasHeader ? rows.slice(1) : rows) {
    const key = imageKey(r[fileCol] ?? '');
    if (!key || captions.has(key)) continue;
    const title = choice.title >= 0 ? (r[choice.title] ?? '') : '';
    const extras = choice.extras.map((x) => ({ label: names[x.col], value: r[x.col] ?? '', heading: x.heading })).filter((x) => x.value);
    if (title || extras.length) captions.set(key, { title, extras });
  }
  return captions;
}

// ---------- helpers ----------

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}
