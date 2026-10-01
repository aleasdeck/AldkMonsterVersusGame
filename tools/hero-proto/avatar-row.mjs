// Строка выбора героя из аватарок лепки — проверка, что новая аватарка стоит в ряду с соседями (docs/lepka-geroev.md, шаг 5).
//
//   node tools/hero-proto/avatar-row.mjs                                  → hero-preview/avatar-row.png
//   node tools/hero-proto/avatar-row.mjs --var mage=b,archer=c --zoom 2   → варианты аватарки героев не из HERO_MODELS
//
// Шесть плиток в порядке выбора героя, по 56 клеток (плитка 112, пиксель 2) ×Z. Герой из HERO_MODELS — как в игре;
// герой, чья модель ещё в работе, — из своего файла `<id>Model({ variants: { avatar } })` (без --var — вариант по умолчанию);
// героя без модели нет — плитка пустая, её закроет рисованный портрет на странице обсуждения.
// Ниже строки — все размеры игры (56, 40, 44 клетки) каждого героя с лепкой.
import { build } from 'esbuild';
import { deflateSync } from 'node:zlib';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
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
const VARS = Object.fromEntries(opt('var', '').split(',').filter(Boolean).map((s) => s.split('=')));
const NAME = opt('name', 'avatar-row');
const ORDER = ['warrior', 'mage', 'assassin', 'paladin', 'berserk', 'archer'];

const bundle = await build({
  stdin: {
    contents: [
      "export { HERO_MODELS, avatarCells } from './src/ui/heroes';",
      "export { renderAvatar } from './src/ui/heroes/avatar';",
      ...ORDER.filter((id) => existsSync(resolve(ROOT, `src/ui/heroes/${id}.ts`))).map((id) => `export * as own_${id} from './src/ui/heroes/${id}';`),
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
const lib = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const { HERO_MODELS, avatarCells, renderAvatar } = lib;

/** Модель героя: из игры, если её не просят вариантом, иначе из своего файла. */
function modelOf(id) {
  if (HERO_MODELS[id] && !VARS[id]) return HERO_MODELS[id];
  const make = lib[`own_${id}`]?.[`${id}Model`];
  return make ? make(VARS[id] ? { variants: { avatar: VARS[id] } } : undefined) : null;
}

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
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const GAP = 8, BG = [22, 20, 26];
const models = ORDER.map((id) => ({ id, model: modelOf(id) }));
const big = avatarCells(112), sizes = [112, 80, 44].map((px) => avatarCells(px));
const rowW = ORDER.length * (big * Z + GAP) + GAP;
const sculpted = models.filter((m) => m.model);
const smallW = sizes.reduce((a, n) => a + n * Z + GAP, 0);
const perLine = Math.max(1, Math.floor((rowW - GAP) / (smallW + GAP)));
const lines = Math.ceil(sculpted.length / perLine);
const W = rowW, H = GAP + big * Z + GAP + lines * (Math.max(...sizes) * Z + GAP) + GAP;
const out = new Uint8Array(W * H * 4);
for (let k = 0; k < W * H; k++) out.set([...BG, 255], k * 4);

function blit(a, n, x, y) {
  for (let j = 0; j < n * Z; j++) for (let i = 0; i < n * Z; i++) {
    const s = (Math.floor(j / Z) * n + Math.floor(i / Z)) * 4;
    out.set(a.subarray(s, s + 4), ((y + j) * W + x + i) * 4);
  }
}

models.forEach(({ model }, k) => {
  if (model) blit(renderAvatar(model, big), big, GAP + k * (big * Z + GAP), GAP);
});
sculpted.forEach(({ model }, k) => {
  let x = GAP + (k % perLine) * (smallW + GAP);
  const y = GAP + big * Z + GAP + GAP + Math.floor(k / perLine) * (Math.max(...sizes) * Z + GAP);
  for (const n of sizes) {
    blit(renderAvatar(model, n), n, x, y);
    x += n * Z + GAP;
  }
});

mkdirSync(OUT, { recursive: true });
const file = join(OUT, `${NAME}.png`);
writeFileSync(file, png(W, H, out));
console.log(`строка выбора: ${models.map(({ id, model }) => `${id}${VARS[id] ? `=${VARS[id]}` : ''}${model ? '' : ' (нет лепки)'}`).join(', ')} → ${file}`);
