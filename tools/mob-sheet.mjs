// Листы клипов пиксельной лепки в PNG — посмотреть каждый кадр без браузера (docs/lepka.md, «Проверка»).
//
//   node tools/mob-sheet.mjs wolf,boar              → mob-preview/<id>.png и сводка в консоли
//   node tools/mob-sheet.mjs forest                 → все модели локации (гномы-воры числятся за лесом)
//   node tools/mob-sheet.mjs all --zoom 2 --out /tmp/mobs
//
// Лист модели: ряд покоя (каждый второй из 24 кадров), ряд удара (8 кадров, кадр контакта подчёркнут золотом)
// и ряд урона (5 кадров); все кадры обрезаны одной рамкой, коричневая черта — линия земли.
// Сводка: рост против ENEMY_BODY_HEIGHT, размер кадра, время отрисовки и предупреждения — рост мимо таблицы
// больше чем на 12 % (кроме моделей с `ownHeight`) и фигура, упёртая в край листа (замах обрезан — нужен больше `pad`).
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
const which = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!which) {
  console.log('node tools/mob-sheet.mjs <id,id… | локация | all> [--zoom 3] [--out mob-preview]');
  process.exit(1);
}
const Z = Number(opt('zoom', 3));
const OUT = resolve(opt('out', join(ROOT, 'mob-preview')));

// Движок и модели — те же модули, что в игре: esbuild собирает их в один ESM-модуль в памяти.
const bundle = await build({
  stdin: {
    contents: [
      "export { renderSheet } from './src/ui/mobs/pixel';",
      "export { MOB_STYLE } from './src/ui/mobs/styles';",
      "export { MOB_MODELS } from './src/ui/mobs/index';",
      "export { ENEMY_LIST } from './src/data/enemies';",
      "export { ENEMY_BODY_HEIGHT } from './src/data/characterSizes';",
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
const { renderSheet, MOB_STYLE, MOB_MODELS, ENEMY_LIST, ENEMY_BODY_HEIGHT } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

const byLoc = (loc) => ENEMY_LIST.filter((e) => e.location === loc).map((e) => e.id);
const ids = which === 'all' ? Object.keys(MOB_MODELS) : ENEMY_LIST.some((e) => e.location === which) ? byLoc(which) : which.split(',');
const missing = ids.filter((id) => !MOB_MODELS[id]);
if (missing.length) console.log(`Без модели лепки: ${missing.join(', ')}`);

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

// ─── Листы ───

mkdirSync(OUT, { recursive: true });
const BG = [34, 38, 34], GROUND = [110, 84, 56], KEY = [255, 209, 102];
const GAP = 4;

for (const id of ids.filter((i) => MOB_MODELS[i])) {
  const model = MOB_MODELS[id];
  const t0 = performance.now();
  const rows = [renderSheet(model, MOB_STYLE), renderSheet(model, MOB_STYLE, 'attack'), renderSheet(model, MOB_STYLE, 'hurt')];
  const ms = performance.now() - t0;
  const [idle] = rows;
  const { w, h, d } = idle;
  // Общая рамка всех кадров всех клипов и касание края листа.
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  const edge = new Set();
  rows.forEach((sh, r) => sh.frames.forEach((f) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (f[(j * w + i) * 4 + 3] === 0) continue;
      x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, j); y1 = Math.max(y1, j);
      if (i === 0 || i === w - 1 || j === 0) edge.add(['покой', 'удар', 'урон'][r]);
    }
  }));
  x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2); x1 = Math.min(w - 1, x1 + 2); y1 = Math.min(h - 1, y1 + 2);
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const pick = [idle.frames.filter((_, k) => k % 2 === 0), rows[1].frames, rows[2].frames];
  const cols = Math.max(...pick.map((r) => r.length));
  const W = cols * (bw * Z + GAP) + GAP, H = 3 * (bh * Z + GAP + 3) + GAP;
  const out = new Uint8Array(W * H * 4);
  for (let k = 0; k < W * H; k++) out.set([...BG, 255], k * 4);
  const ground = h - idle.foot;
  const contact = MOB_STYLE.clips.attack.contact ?? 4;
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
    if (r === 1 && c === contact) {
      for (let x = ox; x < ox + bw * Z; x++) for (let y = oy + bh * Z + 1; y < oy + bh * Z + 3; y++) out.set([...KEY, 255], (y * W + x) * 4);
    }
  }));
  const file = join(OUT, `${id}.png`);
  writeFileSync(file, png(W, H, out));
  const body = (ground - idle.top) * d;
  const want = ENEMY_BODY_HEIGHT[id];
  const off = want ? Math.round(((body - want) / want) * 100) : 0;
  const notes = [];
  if (want && Math.abs(off) > 12 && !model.ownHeight) notes.push(`рост мимо таблицы на ${off} %`);
  if (edge.size) notes.push(`упирается в край листа (${[...edge].join(', ')}): увеличить pad`);
  const own = model.ownHeight ? ` — свой: ${model.ownHeight}` : '';
  console.log(`${id.padEnd(16)} рост ${String(body).padStart(3)} (таблица ${want ?? '—'}, ${off >= 0 ? '+' : ''}${off} %${own})  ширина ${(x1 - x0 - 3) * d}  кадр ${w * d}×${h * d}  ${Math.round(ms)} мс  → ${file}${notes.length ? `\n${''.padEnd(17)}⚠ ${notes.join('; ')}` : ''}`);
}
