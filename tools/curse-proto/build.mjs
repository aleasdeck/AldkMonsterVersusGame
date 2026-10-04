// Страница обсуждения «Архетип «Проклятье»»: три варианта набора, референсы, поля боя с врагами из лепки игры.
//
//   node tools/curse-proto/build.mjs             → curse-preview/proklyatie.html
//
// Враги и герои на поле — те же модели, что в игре (src/ui/mobs, src/ui/heroes): кадры покоя (у героя ещё приёма) запекаются
// полосками PNG прямо в страницу, фоны локаций — из src/assets/backgrounds. Тексты и числа вариантов — в template.html.
import { build } from 'esbuild';
import { deflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const OUT = join(ROOT, 'curse-preview');

/** Кто стоит на полях вариантов: враги — модели лепки, герои — лепка героев. */
const MOBS = ['skeleton_warrior', 'ghoul', 'skeleton_archer', 'bear', 'wolf', 'bog_horror', 'leech'];
const HEROES = ['mage', 'paladin', 'archer'];
const BACKGROUNDS = ['crypt', 'forest', 'swamp'];

const bundle = await build({
  stdin: {
    contents: [
      "export { renderSheet } from './src/ui/mobs/pixel';",
      "export { MOB_STYLE } from './src/ui/mobs/styles';",
      "export { MOB_MODELS } from './src/ui/mobs/index';",
      "export { HERO_MODELS } from './src/ui/heroes';",
      "export { renderHeroClip, HERO_STYLE } from './src/ui/heroes/clips';",
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
const M = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

// ─── PNG без зависимостей (как в tools/mob-sheet.mjs) ───

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
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  const head = Buffer.alloc(13);
  head.writeUInt32BE(w, 0);
  head.writeUInt32BE(h, 4);
  head[8] = 8;
  head[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * Клипы одной модели → общая рамка всех кадров, полоска PNG на клип; низ рамки — линия земли. `body` — левый и правый край
 * фигуры в покое внутри рамки: по нему фигура встаёт на поле серединой тела, а не серединой рамки с замахом.
 */
function pack(sheets, d) {
  const { w, h } = sheets[0];
  const ground = h - sheets[0].foot;
  let x0 = w, y0 = h, x1 = -1;
  for (const sh of sheets) for (const f of sh.frames) for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (f[(j * w + i) * 4 + 3] === 0) continue;
    x0 = Math.min(x0, i);
    x1 = Math.max(x1, i);
    y0 = Math.min(y0, j);
  }
  let ix0 = w, ix1 = -1;
  for (const f of sheets[0].frames) for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (f[(j * w + i) * 4 + 3]) {
      ix0 = Math.min(ix0, i);
      ix1 = Math.max(ix1, i);
    }
  }
  const bw = x1 - x0 + 1, bh = ground - y0 + 1;
  const clips = sheets.map((sh) => {
    const n = sh.frames.length;
    const out = new Uint8Array(bw * n * bh * 4);
    sh.frames.forEach((f, k) => {
      for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
        const s = ((y0 + j) * w + x0 + i) * 4, t = (j * bw * n + k * bw + i) * 4;
        out[t] = f[s];
        out[t + 1] = f[s + 1];
        out[t + 2] = f[s + 2];
        out[t + 3] = f[s + 3];
      }
    });
    return { n, fps: sh.fps, src: 'data:image/png;base64,' + png(bw * n, bh, out).toString('base64') };
  });
  return { w: bw, h: bh, d, body: [ix0 - x0, ix1 - x0], clips };
}

const sprites = {};
for (const id of MOBS) {
  const model = M.MOB_MODELS[id];
  if (!model) throw new Error(`Нет лепки: ${id}`);
  // Врагам хватает покоя: на полях вариантов ходит только герой, приговорённого выдаёт свечение, а не клип.
  sprites[id] = pack([M.renderSheet(model, M.MOB_STYLE)], M.MOB_STYLE.d);
}
for (const id of HEROES) {
  const model = M.HERO_MODELS[id];
  if (!model) throw new Error(`Нет героя-лепки: ${id}`);
  sprites[`hero_${id}`] = pack([M.renderHeroClip(model, 'idle'), M.renderHeroClip(model, 'power')], M.HERO_STYLE.d);
}

const bgs = Object.fromEntries(
  BACKGROUNDS.map((loc) => [loc, 'data:image/png;base64,' + readFileSync(join(ROOT, `src/assets/backgrounds/${loc}-wide.png`)).toString('base64')]),
);

const html = readFileSync(join(HERE, 'template.html'), 'utf8')
  .replace('__SPRITES__', JSON.stringify(sprites).replace(/</g, '\\u003c'))
  .replace('__BACKGROUNDS__', JSON.stringify(bgs));
mkdirSync(OUT, { recursive: true });
const file = join(OUT, 'proklyatie.html');
writeFileSync(file, html);
console.log(`${file} — ${Math.round(html.length / 1024)} КБ, ${Object.keys(sprites).length} фигур`);
