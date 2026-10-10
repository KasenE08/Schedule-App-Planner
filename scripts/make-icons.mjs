// Generates the app icons (dark tile with three timeline blocks) as PNGs. Run: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function icon(size) {
  const bg = hex('#121417');
  // [x0, y0, x1, y1] in 0..1 units, rounded bars like timeline blocks
  const bars = [
    [0.22, 0.24, 0.78, 0.36, hex('#6f94c6')],
    [0.22, 0.44, 0.64, 0.56, hex('#6fa58c')],
    [0.22, 0.64, 0.72, 0.76, hex('#c4a066')],
  ];
  const r = 0.05;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size, v = (y + 0.5) / size;
      let col = bg;
      for (const [x0, y0, x1, y1, c] of bars) {
        const dx = Math.max(x0 + r - u, 0, u - (x1 - r));
        const dy = Math.max(y0 + r - v, 0, v - (y1 - r));
        if (u >= x0 && u <= x1 && v >= y0 && v <= y1 && dx * dx + dy * dy <= r * r) col = c;
      }
      raw.set(col, y * (size * 3 + 1) + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const s of [180, 192, 512]) writeFileSync(`public/icon-${s}.png`, icon(s));
