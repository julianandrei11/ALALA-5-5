/**
 * Removes outer near-white background from ALALA_logo.png via edge flood-fill,
 * so transparent pixels show through outside the purple circle.
 */
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const target = join(root, 'src', 'assets', 'ALALA_logo.png');

function isOuterBackground(r, g, b) {
  // Near-white / very light gray / light lavender halo outside the ring
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 218) return false;
  if (max - min > 55) return false;
  return r + g + b > 620;
}

const buf = readFileSync(target);
const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const w = info.width;
const h = info.height;
const ch = 4;
const visited = new Uint8Array(w * h);
const queue = [];

function tryPush(x, y) {
  if (x < 0 || x >= w || y < 0 || y >= h) return;
  const p = y * w + x;
  if (visited[p]) return;
  const i = p * ch;
  if (!isOuterBackground(data[i], data[i + 1], data[i + 2])) return;
  visited[p] = 1;
  queue.push(p);
}

for (let x = 0; x < w; x++) {
  tryPush(x, 0);
  tryPush(x, h - 1);
}
for (let y = 0; y < h; y++) {
  tryPush(0, y);
  tryPush(w - 1, y);
}

while (queue.length) {
  const p = queue.pop();
  const x = p % w;
  const y = (p / w) | 0;
  const nbs = [
    [x + 1, y],
    [x - 1, y],
    [x, y + 1],
    [x, y - 1]
  ];
  for (const [nx, ny] of nbs) {
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
    const np = ny * w + nx;
    if (visited[np]) continue;
    const i = np * ch;
    if (!isOuterBackground(data[i], data[i + 1], data[i + 2])) continue;
    visited[np] = 1;
    queue.push(np);
  }
}

for (let p = 0; p < w * h; p++) {
  if (visited[p]) {
    const i = p * ch;
    data[i + 3] = 0;
  }
}

const out = await sharp(Buffer.from(data), { raw: { width: w, height: h, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toBuffer();

writeFileSync(target, out);
console.log('Updated', target, `${w}x${h}`, 'bytes', out.length);
