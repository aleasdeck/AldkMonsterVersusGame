// Страница обсуждения «Подсветка цели»: пять вариантов вместо рамки вокруг врага, живые поля и снимки из игры.
//
//   node tools/hl-proto/build.mjs             → hl-preview/podsvetka.html
//
// Поля страницы — те же модели лепки (src/ui/mobs, src/ui/heroes), тот же CSS вариантов (секция «Подсветка цели» в
// src/style.css, вырезается целиком) и те же фильтры света, обводки и тонировки (src/ui/tint.ts), кольца — targetMark.ts.
// Снимки из игры (бой с `&hl=a…e`, DPR 2) кладутся в hl-preview/shots/<сцена>-<вариант>.webp — их снимает Playwright
// по живому dev-серверу; каких нет, тех на странице нет. Тексты вариантов — в template.html.
import { build } from 'esbuild';
import { deflateSync } from 'node:zlib';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const OUT = join(ROOT, 'hl-preview');

/** Враги полей и героя: Лес, как на снимках, — Гоблин первый в ряду, Головорез, Волк. */
const MOBS = ['goblin', 'cutthroat', 'wolf'];
const HERO = 'mage';
const LOC = 'forest';

const bundle = await build({
  stdin: {
    contents: [
      "export { renderSheet } from './src/ui/mobs/pixel';",
      "export { MOB_STYLE } from './src/ui/mobs/styles';",
      "export { MOB_MODELS } from './src/ui/mobs/index';",
      "export { HERO_MODELS } from './src/ui/heroes';",
      "export { renderHeroClip, HERO_STYLE } from './src/ui/heroes/clips';",
      "export { ringSize, ringCells, RING_CELL, RING_COLORS } from './src/ui/targetMark';",
      "export { LIFT, LIFT_ID, OUTLINES, tintMatrix } from './src/ui/tint';",
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
  return 'data:image/png;base64,' + Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}

/** Кадры в одну строку: лист покоя, как ряд листа лепки в игре (mobs/index.ts). */
function strip(sh) {
  const { w, h, frames } = sh;
  const n = frames.length;
  const out = new Uint8Array(w * n * h * 4);
  frames.forEach((f, k) => {
    for (let j = 0; j < h; j++) out.set(f.subarray(j * w * 4, (j + 1) * w * 4), (j * w * n + k * w) * 4);
  });
  return png(w * n, h, out);
}

const hex = (s) => [1, 3, 5, 7].map((i) => (i < s.length - 1 ? parseInt(s.slice(i, i + 2), 16) : 255));

/** Кольцо варианта «Круг» клетками, как ringUrl в игре: картинка клетка-на-пиксель, CSS растягивает без сглаживания. */
function ring(w, h, color) {
  const cw = w / M.RING_CELL, ch = h / M.RING_CELL;
  const cells = M.ringCells(cw, ch);
  const rgba = new Uint8Array(cw * ch * 4);
  const c = hex(color);
  cells.forEach((v, k) => v && rgba.set(c, k * 4));
  return png(cw, ch, rgba);
}

// ─── Враги и герой ───

const mobs = {};
for (const id of MOBS) {
  const model = M.MOB_MODELS[id];
  if (!model) throw new Error(`Нет лепки: ${id}`);
  const sh = M.renderSheet(model, M.MOB_STYLE);
  const d = sh.d;
  // Те же мерки, что у enemySize/enemySizeStyle (characterSize.ts) и mobSprite (mobs/index.ts).
  const m = { w: sh.w * d, h: sh.h * d, top: sh.top * d, foot: sh.foot * d, left: sh.left * d, right: sh.right * d };
  const width = m.w - m.left - m.right;
  const r = M.ringSize(width);
  mobs[id] = {
    sheet: strip(sh), n: sh.frames.length, dur: Math.round((sh.frames.length / sh.fps) * 1000),
    w: m.w, h: m.h, top: m.top, foot: m.foot, bodyW: width, dx: (m.left - m.right) / 2,
    ring: { w: r.w, h: r.h, ok: ring(r.w, r.h, M.RING_COLORS.ok), target: ring(r.w, r.h, M.RING_COLORS.target) },
  };
}

// Герой — кадры покоя, обрезанные по фигуре (как на странице «Проклятья»): он только стоит слева.
const hsh = M.renderHeroClip(M.HERO_MODELS[HERO], 'idle');
let x0 = hsh.w, x1 = -1, y0 = hsh.h;
for (const f of hsh.frames) for (let j = 0; j < hsh.h; j++) for (let i = 0; i < hsh.w; i++) {
  if (!f[(j * hsh.w + i) * 4 + 3]) continue;
  x0 = Math.min(x0, i);
  x1 = Math.max(x1, i);
  y0 = Math.min(y0, j);
}
const ground = hsh.h - hsh.foot;
const hw = x1 - x0 + 1, hh = ground - y0 + 1;
const hframes = hsh.frames.map((f) => {
  const o = new Uint8ClampedArray(hw * hh * 4);
  for (let j = 0; j < hh; j++) for (let i = 0; i < hw; i++) o.set(f.subarray(((y0 + j) * hsh.w + x0 + i) * 4, ((y0 + j) * hsh.w + x0 + i) * 4 + 4), (j * hw + i) * 4);
  return o;
});
const hero = { sheet: strip({ w: hw, h: hh, frames: hframes }), n: hframes.length, dur: Math.round((hframes.length / hsh.fps) * 1000), w: hw * hsh.d, h: hh * hsh.d };

// ─── Фильтры: тонировка Леса, свет цели, обводка — та же разметка, что кладёт tint.ts ───

const box = 'x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB"';
const gamma = (result) => `<feComponentTransfer in="SourceGraphic" result="${result}">${['R', 'G', 'B'].map((c) => `<feFunc${c} type="gamma" exponent="${M.LIFT.exponent}" amplitude="${M.LIFT.amplitude}"/>`).join('')}</feComponentTransfer>`;
const defs = [
  `<filter id="mv-tint-${LOC}" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${M.tintMatrix(LOC)}"/></filter>`,
  `<filter id="${M.LIFT_ID}" ${box}>${gamma('lit')}</filter>`,
  ...M.OUTLINES.map((o) => `<filter id="${o.id}" ${box}><feComponentTransfer in="SourceAlpha" result="a"><feFuncA type="discrete" tableValues="0 1"/></feComponentTransfer><feMorphology in="a" operator="dilate" radius="2" result="d"/><feFlood flood-color="${o.color}"/><feComposite in2="d" operator="in" result="ol"/>${o.lift ? gamma('src') : ''}<feMerge><feMergeNode in="ol"/><feMergeNode in="${o.lift ? 'src' : 'SourceGraphic'}"/></feMerge></filter>`),
].join('\n');

// ─── CSS вариантов — секция style.css целиком ───

const css = readFileSync(join(ROOT, 'src/style.css'), 'utf8');
const from = css.indexOf('/* ─── Подсветка цели');
const to = css.indexOf('/* ─── конец подсветки цели ─── */');
if (from < 0 || to < 0) throw new Error('Нет секции «Подсветка цели» в style.css');
const hlCss = css.slice(from, to);

// ─── Фон и снимки ───

const bg = 'data:image/png;base64,' + readFileSync(join(ROOT, `src/assets/backgrounds/${LOC}-wide.png`)).toString('base64');
const shotsDir = join(OUT, 'shots');
const shots = {};
if (existsSync(shotsDir)) {
  for (const f of readdirSync(shotsDir).filter((f) => f.endsWith('.webp')).sort()) {
    shots[f.replace(/\.webp$/, '')] = 'data:image/webp;base64,' + readFileSync(join(shotsDir, f)).toString('base64');
  }
}

const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
const html = readFileSync(join(HERE, 'template.html'), 'utf8')
  .replace('/*__HL_CSS__*/', () => hlCss)
  .replace('<!--__DEFS__-->', () => defs)
  .replace('__DATA__', () => json({ mobs, hero, bg, tint: `url(#mv-tint-${LOC})` }))
  .replace('__SHOTS__', () => json(shots));
mkdirSync(OUT, { recursive: true });
const file = join(OUT, 'podsvetka.html');
writeFileSync(file, html);
console.log(`${file} — ${Math.round(html.length / 1024)} КБ, снимков ${Object.keys(shots).length}`);
