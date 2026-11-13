// Image loading, like the Folder DAT + Replicator + Movie File In TOPs in TouchDesigner.
// Three sources, one at a time:
//   - 'server': images/manifest.json (served live by serve.mjs, or written by build-manifest.mjs), re-checked every few seconds
//   - 'local':  a folder or files the viewer picks or drops onto the page (read in the browser, never uploaded)
//   - 'arena':  a public Are.na channel (no key needed), re-checked so new blocks appear
// Each image is decoded once into a small card texture and a larger copy for the featured view,
// so switching the featured image never re-reads a file (the stutter fixed in TD).

const CARD_RES = 640;       // long side of card textures (TD 'settings' texres)
const FEATURED_RES = 1600;  // long side of the featured copy
const SERVER_POLL_MS = 3000;
const ARENA_POLL_MS = 20000;
const IMAGE_TYPE = /\.(jpe?g|png|gif|webp|avif|bmp)$/i;

let items = [];             // [{ key, name, aspect, card: HTMLCanvasElement, full: ImageBitmap }]
let onChange = () => {};
let onStatus = () => {};
let source = null;          // which source is active, so a slow load from an old source is ignored
let timer = null;
let busy = false;           // a sync is running: skip polls until it finishes

export function initImages(changed, status, { server = true } = {}) {
  onChange = changed;
  onStatus = status;
  if (server) useServer();
}

export function getItems() { return items; }

// ---------- sources ----------

function setSource(name, poll, every) {
  clearInterval(timer);
  source = name;
  const run = async (first) => {
    if (busy) {
      if (!first) return;   // a repeat check can skip; the first load waits for the running one
      while (busy) await new Promise((r) => setTimeout(r, 50));
    }
    if (source !== name) return;
    busy = true;
    try { await poll(name); } catch (err) { onStatus(err.message); } finally { busy = false; }
  };
  timer = every ? setInterval(run, every) : null;
  return run(true);
}

function useServer() {
  return setSource('server', async (me) => {
    const res = await fetch('images/manifest.json', { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) return;   // no manifest: wait for a folder or Are.na link
    const names = (await res.json()).images || [];
    await sync(me, names.map((n) => ({ key: 'url:' + n, name: n, load: () => fetch('images/' + encodeURIComponent(n)).then((r) => r.blob()) })));
  }, SERVER_POLL_MS);
}

// Folder picker / drag-and-drop: a list of File objects
export function useLocalFiles(files) {
  const list = [...files].filter((f) => IMAGE_TYPE.test(f.name));
  if (!list.length) { onStatus('No images in that folder'); return; }
  const me = 'local:' + Date.now();
  return setSource(me, () => sync(me, list.map((f) => ({
    key: 'file:' + (f.webkitRelativePath || f.name) + ':' + f.size + ':' + f.lastModified, name: f.name, load: async () => f,
  }))));
}

// ---------- Are.na ----------
// Public channels can be read with Are.na's API without any key.

// Accepts a channel link (are.na/<user>/<channel>, are.na/channel/<channel>) or a bare channel slug
export function arenaChannelSlug(text) {
  const t = text.trim();
  if (/^[\w-]+$/.test(t)) return t;
  try {
    const url = new URL(/^https?:\/\//.test(t) ? t : 'https://' + t);
    if (!/(^|\.)are\.na$/.test(url.hostname)) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length === 2 && !['block', 'about', 'search', 'explore', 'settings'].includes(parts[0])) return parts[1];
    return null;
  } catch { return null; }
}

export function useArenaChannel(slug) {
  return setSource('arena:' + slug, async (me) => {
    const blocks = await listArenaChannel(slug);
    await sync(me, blocks.map((b) => ({
      key: 'arena:' + b.id + ':' + b.updated_at,
      name: b.title || b.generated_title || String(b.id),
      load: async () => {
        const img = b.image;
        const r = await fetch((img.large || img.display || img.original).url);
        if (!r.ok) throw new Error(`Are.na image download failed (${r.status})`);
        return r.blob();
      },
    })), { keepOrder: true });
    onStatus(blocks.length ? '' : 'No images in that Are.na channel');
  }, ARENA_POLL_MS);
}

async function listArenaChannel(slug) {
  const blocks = [];
  for (let page = 1; ; page++) {
    const res = await fetch(`https://api.are.na/v2/channels/${encodeURIComponent(slug)}/contents?per=100&page=${page}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status === 404 || res.status === 401 || res.status === 403 ? 'Are.na channel not found, or not public' : `Are.na: error ${res.status}`);
    const contents = (await res.json()).contents || [];
    blocks.push(...contents.filter((b) => b.class === 'Image' && b.image));
    if (contents.length < 100) break;
  }
  return blocks;   // in the channel's own order
}

// ---------- shared ----------

function sortByName(a, b) { return a.localeCompare(b, undefined, { sensitivity: 'base' }); }

// Add new images, drop removed ones, keep the rest (already decoded).
// Files are sorted by name, like TD's Folder DAT; Are.na keeps the channel's order.
async function sync(me, sources, { keepOrder = false } = {}) {
  if (!keepOrder) sources.sort((a, b) => sortByName(a.name, b.name));
  const wanted = new Set(sources.map((s) => s.key));
  const known = new Map(items.map((it) => [it.key, it]));
  const toLoad = sources.filter((s) => !known.has(s.key));
  const unchanged = items.length === sources.length && items.every((it, i) => it.key === sources[i].key);
  if (!toLoad.length && unchanged) return;

  const loaded = await Promise.all(toLoad.map(async (s) => {
    try { return { key: s.key, name: s.name, ...(await decode(await s.load())) }; }
    catch (err) { console.warn('Could not load image', s.name, err); return null; }
  }));
  if (source !== me) { loaded.forEach((it) => it?.full.close?.()); return; }   // switched sources meanwhile

  for (const it of loaded) if (it) known.set(it.key, it);
  const next = sources.map((s) => known.get(s.key)).filter(Boolean);
  const keep = new Set(next.map((it) => it.key));
  const removed = items.filter((it) => !keep.has(it.key));
  removed.forEach((it) => it.full.close?.());
  items = next;
  onChange(items, removed);
}

async function decode(blob) {
  const bmp = await createImageBitmap(blob);
  const aspect = bmp.width / bmp.height;
  const fit = (max) => (bmp.width >= bmp.height
    ? { w: Math.min(max, bmp.width), h: Math.round(Math.min(max, bmp.width) / aspect) }
    : { h: Math.min(max, bmp.height), w: Math.round(Math.min(max, bmp.height) * aspect) });

  const c = fit(CARD_RES);
  const card = document.createElement('canvas');
  card.width = c.w; card.height = c.h;
  const ctx = card.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, c.w, c.h);

  const f = fit(FEATURED_RES);
  const full = (f.w === bmp.width) ? bmp : await createImageBitmap(bmp, { resizeWidth: f.w, resizeHeight: f.h, resizeQuality: 'high' });
  if (full !== bmp) bmp.close();
  return { aspect, card, full };
}
