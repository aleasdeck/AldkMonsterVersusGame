// Листы лепки эффектов в PNG — посмотреть каждый кадр без браузера (docs/lepka.md, «Лепка эффектов»).
//
//   node tools/fx-sheet.mjs                      → fx-preview/<клип>.png и fx-preview/plates-<враг>.png, сводка в консоли
//   node tools/fx-sheet.mjs --zoom 4 --out /tmp/fx
//   node tools/fx-sheet.mjs --plates wolf,troll  → латы блока на силуэтах этих врагов (по умолчанию wolf, goblin, troll)
//
// Клипы — из реестра FX_CLIPS (src/ui/fx/clips.ts): ряд кадров на тёмном поле, пунктир — рамка клипа; предупреждение,
// если рисунок упирается в рамку (эффект срежется прямой линией). Латы — фазы по времени поверх силуэта врага
// (кадр покоя из его листа лепки): встают, лязг, стоят, удар, ломаются, тают.
import { build } from 'esbuild';
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const Z = Number(opt('zoom', 3));
const OUT = resolve(opt('out', join(ROOT, 'fx-preview')));
const FOES = opt('plates', 'wolf,goblin,troll').split(',');

// Те же модули, что в игре: esbuild собирает их в память; картинки героев модулям лепки не нужны — пустышки.
const bundle = await build({
  stdin: {
    contents: [
      "export { bakeRgba } from './src/ui/fx/bake';",
      "export { FX_CLIPS } from './src/ui/fx/clips';",
      "export { drawPlates, PLATE_MS } from './src/ui/fx/plates';",
      "export { renderSheet } from './src/ui/mobs/pixel';",
      "export { MOB_STYLE } from './src/ui/mobs/styles';",
      "export { MOB_MODELS } from './src/ui/mobs/index';",
    ].join('\n'),
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'warning',
  loader: { '.png': 'empty' },
});
const { bakeRgba, FX_CLIPS, drawPlates, PLATE_MS, renderSheet, MOB_STYLE, MOB_MODELS } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

// ─── PNG без зависимостей ───

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

const BG = [28, 26, 34], FRAME = [70, 66, 84], BODY = [60, 72, 58];
const GAP = 4;

/** Холст листа: клетки кадров ×Z с полями, фон и пунктир рамки. */
function sheet(cols, cw, ch) {
  const W = cols * (cw * Z + GAP) + GAP, H = ch * Z + 2 * GAP;
  const out = new Uint8Array(W * H * 4);
  for (let k = 0; k < W * H; k++) out.set([...BG, 255], k * 4);
  const cell = (c, i, j, rgb, a = 1) => {
    const ox = GAP + c * (cw * Z + GAP), oy = GAP;
    for (let dy = 0; dy < Z; dy++) for (let dx = 0; dx < Z; dx++) {
      const t = ((oy + j * Z + dy) * W + ox + i * Z + dx) * 4;
      for (let k = 0; k < 3; k++) out[t + k] = Math.round(out[t + k] * (1 - a) + rgb[k] * a);
    }
  };
  for (let c = 0; c < cols; c++) {
    for (let i = 0; i < cw; i += 2) { cell(c, i, 0, FRAME); cell(c, i, ch - 1, FRAME); }
    for (let j = 0; j < ch; j += 2) { cell(c, 0, j, FRAME); cell(c, cw - 1, j, FRAME); }
  }
  return { W, H, out, cell };
}

mkdirSync(OUT, { recursive: true });

// ─── Клипы ───

for (const [name, c] of Object.entries(FX_CLIPS)) {
  const t0 = performance.now();
  const frames = bakeRgba(c.w, c.h, c.n, c.draw, c.opts);
  const ms = performance.now() - t0;
  const { W: cw, H: ch } = frames[0];
  const s = sheet(frames.length, cw, ch);
  let edge = false;
  frames.forEach((f, k) => {
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
      const p = (j * cw + i) * 4, a = f.px[p + 3] / 255;
      if (!a) continue;
      if (i === 0 || j === 0 || i === cw - 1 || j === ch - 1) edge = true;
      s.cell(k, i, j, [f.px[p], f.px[p + 1], f.px[p + 2]], a);
    }
  });
  const file = join(OUT, `${name.replace(/[:]/g, '_')}.png`);
  writeFileSync(file, png(s.W, s.H, s.out));
  console.log(`${name.padEnd(12)} ${frames.length} кадров ${cw}×${ch} клеток  ${Math.round(ms)} мс  → ${file}${edge ? `\n${''.padEnd(13)}⚠ упирается в рамку клипа: расширить w/h` : ''}`);
}

// ─── Латы по фазам ───

const PHASES = [
  ['build', 40], ['build', 200], ['build', PLATE_MS.BUILD_UP + 30], ['build', PLATE_MS.BUILD_UP + PLATE_MS.CLANK + 120], ['hold', 0],
  ['hit', 40], ['hit', 200], ['break', 200], ['break', 380], ['melt', 150], ['melt', 330],
];
for (const id of FOES.filter((i) => MOB_MODELS[i])) {
  const idle = renderSheet(MOB_MODELS[id], MOB_STYLE);
  const f = idle.frames[0], w = idle.w, h = idle.h;
  const M = { x0: 0, y0: 0, w, h, m: Uint8Array.from({ length: w * h }, (_, k) => (f[k * 4 + 3] === 255 ? 1 : 0)) };
  const s = sheet(PHASES.length, w, h);
  PHASES.forEach(([phase, t], c) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (M.m[j * w + i]) s.cell(c, i, j, BODY);
    drawPlates((x, y, color, a = 1) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const n = parseInt(color.slice(1, 7), 16);
      s.cell(c, Math.round(x), Math.round(y), [(n >> 16) & 255, (n >> 8) & 255, n & 255], a);
    }, M, phase, t, -1);
  });
  const file = join(OUT, `plates-${id}.png`);
  writeFileSync(file, png(s.W, s.H, s.out));
  console.log(`латы ${id.padEnd(10)} ${PHASES.map(([p, t]) => `${p} ${t}`).join(' · ')}  → ${file}`);
}
