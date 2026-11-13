// Tiny local server for the cycle web page. No dependencies: `node serve.mjs`.
// Serves this folder, and answers images/manifest.json with a live listing of the
// images folder, so dropping files in works like TouchDesigner's Folder DAT.
//
//   node serve.mjs                 -> http://localhost:8080, images from ./images
//   node serve.mjs 9000 D:\photos  -> another port and/or image folder

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listImages } from './build-manifest.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2]) || 8080;
const imagesDir = path.resolve(root, process.argv[3] || 'images');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
  '.avif': 'image/avif', '.bmp': 'image/bmp',
};

http.createServer(async (req, res) => {
  try {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (url === '/images/manifest.json') {
      const images = await listImages(imagesDir);
      res.writeHead(200, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ images }));
    }
    let file = url.startsWith('/images/')
      ? path.join(imagesDir, url.slice('/images/'.length))
      : path.join(root, url === '/' ? 'index.html' : url);
    const base = url.startsWith('/images/') ? imagesDir : root;
    if (!path.resolve(file).startsWith(base)) { res.writeHead(403); return res.end(); }
    const data = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}).listen(port, () => {
  console.log(`cycle: http://localhost:${port}   (images from ${imagesDir})`);
});
