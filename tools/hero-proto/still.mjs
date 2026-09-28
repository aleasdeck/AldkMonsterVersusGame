// Первый кадр покоя черновых моделей в PNG в пикселях поля (1 : 1): сравнение с референсом и между обликами.
//   node tools/hero-proto/still.mjs --look A,B,C --d 2,1 --out hero-preview/still
import { build } from 'esbuild';
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const OUT = resolve(opt('out', join(ROOT, 'hero-preview/still')));
const LOOKS = opt('look', 'A,B,C').split(',');
const DS = opt('d', '2').split(',').map(Number);
const WEAPON = opt('weapon', 'sword');
const FRAME = Number(opt('frame', 0));
// Во сколько раз крупнее поля: 2 — как кадр 960 × 540 на экране FullHD (пиксель 1.5 даёт ровно 3 точки экрана).
const SCALE = Number(opt('scale', 1));

const bundle = await build({
  stdin: { contents: "export { warriorModel } from './tools/hero-proto/warrior';\nexport { renderHeroClip } from './tools/hero-proto/hero';\nexport { MOB_STYLE } from './src/ui/mobs/styles';", resolveDir: ROOT, loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'warning',
});
const { warriorModel, renderHeroClip, MOB_STYLE } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  const head = Buffer.alloc(13); head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
mkdirSync(OUT, { recursive: true });
for (const look of LOOKS) for (const d of DS) {
  const style = { ...MOB_STYLE, d };
  const sh = renderHeroClip(warriorModel(look, WEAPON), 'idle', style);
  const f = sh.frames[FRAME];
  // В пиксели поля: каждый пиксель рисунка — d×d.
  const k = d * SCALE;
  const W = Math.round(sh.w * k), H = Math.round(sh.h * k), out = new Uint8Array(W * H * 4);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const s = (Math.min(sh.h - 1, Math.floor(j / k)) * sh.w + Math.min(sh.w - 1, Math.floor(i / k))) * 4, t = (j * W + i) * 4;
    out[t] = f[s]; out[t + 1] = f[s + 1]; out[t + 2] = f[s + 2]; out[t + 3] = f[s + 3];
  }
  const file = join(OUT, `${look}-d${String(d).replace('.', '_')}${SCALE === 1 ? '' : `-x${SCALE}`}${WEAPON === 'sword' ? '' : '-' + WEAPON}.png`);
  writeFileSync(file, png(W, H, out));
  console.log(`${file} ${W}×${H}, земля ${Math.round(H - sh.foot * k)}, верх ${Math.round(sh.top * k)}`);
}
