// Кадры лепки Воина (src/ui/heroes/warrior.ts) в PNG — посмотреть каждый кадр без браузера.
//
//   node tools/hero-proto/sheet.mjs                          → hero-preview/warrior.png: все клипы и сводка
//   node tools/hero-proto/sheet.mjs --clips attack,block --zoom 3
//
// Ряд на клип (покой — каждый второй кадр из 24), кадр контакта подчёркнут золотом, коричневая черта — линия земли.
// В сводке — рост в покое против HERO_BODY_HEIGHT (если покой в списке) и касание края листа (мало `pad`).
import { build } from 'esbuild';
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const Z = Number(opt('zoom', 2));
const OUT = resolve(opt('out', join(ROOT, 'hero-preview')));
const ONLY = opt('clips', '');
const D = Number(opt('d', 1.5)); // пиксель героя — 1,5 (решение пользователя)

const bundle = await build({
  stdin: {
    contents: [
      "export { warriorModel } from './src/ui/heroes/warrior';",
      "export { HERO_CLIPS, renderHeroClip } from './src/ui/heroes/clips';",
      "export { HERO_BODY_HEIGHT } from './src/data/characterSizes';",
      "export { MOB_STYLE } from './src/ui/mobs/styles';",
    ].join('\n'),
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'warning',
});
const { warriorModel, HERO_CLIPS, renderHeroClip, HERO_BODY_HEIGHT, MOB_STYLE } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  const head = Buffer.alloc(13);
  head.writeUInt32BE(w, 0);
  head.writeUInt32BE(h, 4);
  head[8] = 8;
  head[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync(OUT, { recursive: true });
const BG = [34, 38, 34], GROUND = [110, 84, 56], KEY = [255, 209, 102];
const GAP = 4;
const clips = Object.keys(HERO_CLIPS).filter((c) => !ONLY || ONLY.split(',').includes(c));

{
  const model = warriorModel();
  const t0 = performance.now();
  const rows = clips.map((c) => ({ clip: c, sh: renderHeroClip(model, c, { ...MOB_STYLE, d: D }) }));
  const ms = performance.now() - t0;
  const { w, h, d } = rows[0].sh;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  const edge = new Set();
  for (const { clip, sh } of rows) for (const f of sh.frames) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (f[(j * w + i) * 4 + 3] === 0) continue;
      x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, j); y1 = Math.max(y1, j);
      if (i === 0 || i === w - 1 || j === 0) edge.add(clip);
    }
  }
  x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2); x1 = Math.min(w - 1, x1 + 2); y1 = Math.min(h - 1, y1 + 2);
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const pick = rows.map(({ clip, sh }) => (clip === 'idle' ? sh.frames.filter((_, k) => k % 2 === 0) : sh.frames));
  const cols = Math.max(...pick.map((r) => r.length));
  const W = cols * (bw * Z + GAP) + GAP, H = rows.length * (bh * Z + GAP + 3) + GAP;
  const out = new Uint8Array(W * H * 4);
  for (let k = 0; k < W * H; k++) out.set([...BG, 255], k * 4);
  const ground = h - rows[0].sh.foot;
  pick.forEach((frames, r) => frames.forEach((f, c) => {
    const ox = GAP + c * (bw * Z + GAP), oy = GAP + r * (bh * Z + GAP + 3);
    for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
      const s = ((y0 + j) * w + x0 + i) * 4, a = f[s + 3] / 255;
      const floor = y0 + j === ground;
      for (let dy = 0; dy < Z; dy++) for (let dx = 0; dx < Z; dx++) {
        const t = ((oy + j * Z + dy) * W + ox + i * Z + dx) * 4;
        for (let ch = 0; ch < 3; ch++) {
          const under = floor && dy === 0 ? GROUND[ch] : BG[ch];
          out[t + ch] = Math.round(under * (1 - a) + f[s + ch] * a);
        }
      }
    }
    if (HERO_CLIPS[rows[r].clip].contact === c) {
      for (let x = ox; x < ox + bw * Z; x++) for (let y = oy + bh * Z + 1; y < oy + bh * Z + 3; y++) out.set([...KEY, 255], (y * W + x) * 4);
    }
  }));
  const file = join(OUT, 'warrior.png');
  writeFileSync(file, png(W, H, out));
  const idle = rows.find((r) => r.clip === 'idle')?.sh;
  const body = idle ? (ground - idle.top) * d : 0;
  const want = HERO_BODY_HEIGHT.warrior;
  console.log(`Воин: рост ${idle ? body : '—'} (таблица ${want}), кадр ${w * d}×${h * d}, ${Math.round(ms)} мс${edge.size ? `, ⚠ край листа: ${[...edge].join(', ')}` : ''} → ${file}`);
}
