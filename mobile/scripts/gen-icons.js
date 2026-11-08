// Draws the Scam Guardian icon set from the app's own brand mark (shield + check, primary #0B3D91).
// Pure Node (zlib) PNG encoder, no dependencies:  node scripts/gen-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PRIMARY = [0x0B, 0x3D, 0x91];
const WHITE = [255, 255, 255];
const OUT = path.join(__dirname, '..', 'assets');

/* shield outline from the app icon path: M12 3l8 3v6c0 5-3.4 8.3-8 9-4.6-.7-8-4-8-9V6z (24x24 box) */
function cubic(p0, p1, p2, p3, n = 24) {
  const pts = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
              u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
  }
  return pts;
}
const SHIELD = [[12, 3], [20, 6], [20, 12],
  ...cubic([20, 12], [20, 17], [16.6, 20.3], [12, 21]),
  ...cubic([12, 21], [7.4, 20.3], [4, 17], [4, 12]),
  [4, 6]];
const CHECK = [[8.5, 12.2], [10.9, 14.6], [15.5, 9.8]];

function inPoly(x, y, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function distSeg(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
function nearLine(px, py, pts, w) { for (let i = 0; i < pts.length - 1; i++) if (distSeg(px, py, pts[i], pts[i + 1]) <= w) return true; return false; }

/* scale: size of the 24-unit icon box in pixels; bg: colour or null; shield/check colours */
function draw(size, { scale, bg, shield, check, checkW = 1.25 }) {
  const px = Buffer.alloc(size * size * 4), SS = 4, off = (size - scale) / 2, k = scale / 24;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const ux = (x + (sx + 0.5) / SS - off) / k, uy = (y + (sy + 0.5) / SS - off) / k;
      let col = bg, al = bg ? 1 : 0;
      if (inPoly(ux, uy, SHIELD)) { col = shield; al = 1; if (check && nearLine(ux, uy, CHECK, checkW)) col = check; }
      if (al) { r += col[0]; g += col[1]; b += col[2]; a += 1; }
    }
    const n = SS * SS, i = (y * size + x) * 4;
    px[i] = a ? Math.round(r / a) : 0; px[i + 1] = a ? Math.round(g / a) : 0; px[i + 2] = a ? Math.round(b / a) : 0; px[i + 3] = Math.round(255 * a / n);
  }
  return png(size, size, px);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = buf => { let c = 0xFFFFFFFF; for (const b of buf) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const jobs = {
  'icon.png': [1024, { scale: 760, bg: PRIMARY, shield: WHITE, check: PRIMARY }],
  'android-icon-foreground.png': [1024, { scale: 600, bg: null, shield: WHITE, check: PRIMARY }],
  'android-icon-background.png': [1024, { scale: 0, bg: PRIMARY, shield: PRIMARY }],
  'android-icon-monochrome.png': [1024, { scale: 600, bg: null, shield: WHITE, check: null }],
  'splash-icon.png': [512, { scale: 400, bg: null, shield: WHITE, check: PRIMARY }],
  'favicon.png': [48, { scale: 40, bg: PRIMARY, shield: WHITE, check: PRIMARY }],
};
for (const [file, [size, opts]] of Object.entries(jobs)) {
  fs.writeFileSync(path.join(OUT, file), draw(size, opts));
  console.log('✓', file, size + 'px');
}
