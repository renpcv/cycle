// Writes images/manifest.json: the list of image files the page loads.
// serve.mjs builds this list live, so you only need to run this for static hosting
// (GitHub Pages, Netlify, ...), after adding or removing images:  node build-manifest.mjs

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp)$/i;

export async function listImages(dir) {
  const names = (await fs.readdir(dir, { withFileTypes: true }))
    .filter((e) => e.isFile() && IMAGE_EXT.test(e.name))
    .map((e) => e.name);
  return names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'images');
  const images = await listImages(dir);
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ images }, null, 2));
  console.log(`Wrote images/manifest.json (${images.length} images)`);
}
