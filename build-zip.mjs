// Builds cycle-source.zip: the whole tool in two forms, for the page's "Download source code" link.
//   cycle-source/README.txt   how to use it (from source-readme.txt)
//   cycle-source/local/       run on your own computer: page + serve.mjs + start.bat / start.command
//   cycle-source/web/         upload to any static host: page + images/manifest.json + .nojekyll
// Run before publishing:  node build-manifest.mjs && node build-zip.mjs

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const OUT = 'cycle-source.zip';
const TOP = 'cycle-source/';

const IMAGE = /\.(jpe?g|png|gif|webp|avif|bmp)$/i;
const page = ['index.html', 'style.css', ...fs.readdirSync(path.join(root, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f)];
const images = fs.readdirSync(path.join(root, 'images')).filter((f) => IMAGE.test(f)).sort().map((f) => 'images/' + f);

const entries = [
  [TOP + 'README.txt', 'source-readme.txt'],
  ...[...page, ...images, 'serve.mjs', 'build-manifest.mjs', 'start.bat', 'start.command'].map((f) => [TOP + 'local/' + f, f]),
  ...[...page, ...images, 'images/manifest.json', '.nojekyll'].map((f) => [TOP + 'web/' + f, f]),   // ready-made manifest, so nothing to run
];

// line endings that work after unzipping: CRLF for Windows files, LF for the Mac script
function contents(src) {
  let data = fs.readFileSync(path.join(root, src));
  if (src.endsWith('.bat') || src.endsWith('.txt')) data = Buffer.from(data.toString('utf8').replace(/\r?\n/g, '\r\n'));
  if (src.endsWith('.command')) data = Buffer.from(data.toString('utf8').replace(/\r\n/g, '\n'));
  return data;
}

// ---------- minimal zip writer (deflate, Unix permissions so start.command stays executable) ----------

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

const now = new Date();
const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

const local = [], central = [];
let offset = 0;
for (const [name, src] of entries) {
  const data = contents(src);
  const packed = zlib.deflateRawSync(data, { level: 9 });
  const store = packed.length >= data.length;            // already-compressed files (PNG) are stored as-is
  const body = store ? data : packed;
  const nameBuf = Buffer.from(name, 'utf8');
  const crc = crc32(data);
  const mode = name.endsWith('.command') ? 0o100755 : 0o100644;

  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6);   // UTF-8 names
  lh.writeUInt16LE(store ? 0 : 8, 8); lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12);
  lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22);
  lh.writeUInt16LE(nameBuf.length, 26);
  local.push(lh, nameBuf, body);

  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE((3 << 8) | 20, 4); ch.writeUInt16LE(20, 6);   // made on Unix: keeps permissions
  ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(store ? 0 : 8, 10); ch.writeUInt16LE(dosTime, 12); ch.writeUInt16LE(dosDate, 14);
  ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24);
  ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE((mode << 16) >>> 0, 38); ch.writeUInt32LE(offset, 42);
  central.push(ch, nameBuf);

  offset += lh.length + nameBuf.length + body.length;
}
const cd = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
fs.writeFileSync(path.join(root, OUT), Buffer.concat([...local, cd, end]));
console.log(`Wrote ${OUT} (${entries.length} files, ${(fs.statSync(path.join(root, OUT)).size / 1024).toFixed(0)} KB)`);
