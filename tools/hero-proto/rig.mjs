// Риг руки героя-лепки по кадрам — для ревью риггинга (docs/lepka-geroev.md → «Ревью риггинга»).
//
//   node tools/hero-proto/rig.mjs --hero paladin --clips attack,heavy               → суставы по кадрам числами
//   node tools/hero-proto/rig.mjs --hero paladin --clips attack --frames attack:1,attack:4 --zoom 6
//                                                                                   → ещё кадры с костями в PNG
//
// Читает зонд модели (`probe`, src/ui/heroes/model.ts): таз, кисть, конец оружия и — если модель их отдаёт — плечевой
// сустав, локоть, другой конец оружия, угол запястья и сгиб локтя. По кадру печатает точки в единицах поля, сгиб
// локтя, угол оружия к предплечью и прыжок конца оружия от прошлого кадра; помечает то, что обычно ломает риг:
// запястье вне предела (`--wrist -125,-25`), локоть острее 55°, конец оружия под землёй. Кости на кадрах: плечо —
// голубая, предплечье — пурпурная, оружие — жёлтая, точка покоя плеча — белая. Картинка — hero-preview/<герой>-rig.png.
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
const HERO = opt('hero', 'warrior');
const Z = Number(opt('zoom', 5));
const [WR0, WR1] = opt('wrist', '-125,-25').split(',').map(Number);
const FRAMES = (opt('frames', '') || '').split(',').filter(Boolean).map((s) => {
  const [c, f] = s.split(':');
  return { c, f: Number(f) };
});

const bundle = await build({
  stdin: {
    contents: [
      "export { modelClips } from './src/ui/heroes/model';",
      existsSync(resolve(ROOT, `src/ui/heroes/${HERO}.ts`)) ? `export * as own from './src/ui/heroes/${HERO}';` : 'export const own = {};',
      "export { HERO_MODELS } from './src/ui/heroes';",
      "export { HERO_CLIPS, HERO_STYLE, renderHeroClip } from './src/ui/heroes/clips';",
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
const { own, modelClips, HERO_MODELS, HERO_CLIPS, HERO_STYLE, renderHeroClip } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const model = HERO_MODELS[HERO] ?? own[`${HERO}Model`]?.();
if (!model?.probe) throw new Error(`У героя «${HERO}» нет модели с зондом probe`);
const clips = (opt('clips', '') || modelClips(model).filter((c) => c !== 'idle').join(',')).split(',');
const r = (v, w = 5) => (v === undefined ? '—' : Math.round(v).toString()).padStart(w);
const sheets = {}, rigs = {};

for (const clip of clips) {
  const rows = [];
  model.probe.on = (o) => rows.push({ ...o });
  sheets[clip] = renderHeroClip(model, clip, HERO_STYLE);
  model.probe.on = undefined;
  rigs[clip] = rows;
  const spec = HERO_CLIPS[clip];
  console.log(`\n${clip} — ${spec.name} (${spec.frames} × ${spec.fps}, контакт ${spec.contact ?? '—'})`);
  console.log('  кадр  плечо x,y    локоть x,y   кисть x,y   конец x,y   локоть°  запястье°  Δконца');
  rows.forEach((o, f) => {
    const prev = rows[f - 1];
    const jump = prev ? Math.hypot(o.tipX - prev.tipX, o.tipY - prev.tipY) : 0;
    const warn = [];
    if (o.wrist !== undefined && (o.wrist < WR0 - 0.5 || o.wrist > WR1 + 0.5)) warn.push('запястье вне предела');
    if (o.elbow !== undefined && o.elbow < 55) warn.push('локоть сложен');
    if (o.tipY > o.ground + 1) warn.push(`конец в земле${model.probe.grounded.includes(clip) ? ' (нарочно)' : ''}`);
    console.log(`  ${String(f).padStart(2)}${f === spec.contact ? '*' : ' '} ${r(o.shX)}${r(o.shY)}   ${r(o.elX)}${r(o.elY)}   ${r(o.handX)}${r(o.handY)}  ${r(o.tipX)}${r(o.tipY)}   ${r(o.elbow, 6)}  ${r(o.wrist, 8)}   ${r(jump, 5)}${warn.length ? '  ← ' + warn.join(', ') : ''}`);
  });
}

if (FRAMES.length) {
  const d = HERO_STYLE.d, pad = model.pad ?? 22;
  const shots = FRAMES.map(({ c, f }) => {
    if (!sheets[c]) throw new Error(`Клип «${c}» не в --clips`);
    return { sh: sheets[c], fr: sheets[c].frames[f], rg: rigs[c][f] };
  });
  const { w, h } = shots[0].sh;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (const { fr } of shots) for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (fr[(j * w + i) * 4 + 3]) { x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, j); y1 = Math.max(y1, j); }
  x0 -= 3; y0 -= 3; x1 += 3; y1 += 3;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, G = 6;
  const W = shots.length * (bw * Z + G) + G, H = bh * Z + 2 * G;
  const out = new Uint8Array(W * H * 4);
  for (let k = 0; k < W * H; k++) out.set([40, 44, 40, 255], k * 4);
  const put = (X, Y, col) => {
    X = Math.round(X); Y = Math.round(Y);
    if (X < 0 || Y < 0 || X >= W || Y >= H) return;
    out.set([...col, 255], (Y * W + X) * 4);
  };
  shots.forEach(({ sh, fr, rg }, n) => {
    const ox = G + n * (bw * Z + G);
    const ground = h - sh.foot;
    for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
      const s = ((y0 + j) * w + x0 + i) * 4, a = fr[s + 3] / 255;
      const bg = y0 + j === ground ? [120, 90, 60] : [40, 44, 40];
      for (let dy = 0; dy < Z; dy++) for (let dx = 0; dx < Z; dx++) {
        const t = ((G + j * Z + dy) * W + ox + i * Z + dx) * 4;
        for (let c = 0; c < 3; c++) out[t + c] = Math.round(bg[c] * (1 - a) + fr[s + c] * a);
      }
    }
    // Точка поля → экран картинки.
    const SX = (x) => ((x + pad) / d - x0) * Z + ox, SY = (y) => ((y + pad) / d - y0) * Z + G;
    const line = (x1_, y1_, x2_, y2_, col) => {
      if ([x1_, y1_, x2_, y2_].some((v) => v === undefined)) return;
      const n2 = Math.ceil(Math.hypot(SX(x2_) - SX(x1_), SY(y2_) - SY(y1_)));
      for (let k = 0; k <= n2; k++) {
        const X = SX(x1_) + ((SX(x2_) - SX(x1_)) * k) / n2, Y = SY(y1_) + ((SY(y2_) - SY(y1_)) * k) / n2;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) put(X + a, Y + b, col);
      }
    };
    const dot = (x, y, col, rr = 3) => {
      if (x === undefined || y === undefined) return;
      for (let a = -rr; a <= rr; a++) for (let b = -rr; b <= rr; b++) if (a * a + b * b <= rr * rr) put(SX(x) + a, SY(y) + b, col);
    };
    line(rg.shX, rg.shY, rg.elX, rg.elY, [0, 255, 255]);
    line(rg.elX, rg.elY, rg.handX, rg.handY, [255, 0, 255]);
    line(rg.butX ?? rg.handX, rg.butY ?? rg.handY, rg.tipX, rg.tipY, [255, 255, 0]);
    dot(rg.shX, rg.shY, [0, 255, 255]);
    dot(rg.elX, rg.elY, [255, 0, 255]);
    dot(rg.handX, rg.handY, [255, 80, 80]);
    dot(rg.tipX, rg.tipY, [255, 255, 0]);
  });
  const CRC = new Int32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c;
  });
  const crc32 = (buf) => {
    let c = -1;
    for (const x of buf) c = CRC[(c ^ x) & 255] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const chunk = (t, dd) => {
    const l = Buffer.alloc(4);
    l.writeUInt32BE(dd.length);
    const td = Buffer.concat([Buffer.from(t, 'ascii'), dd]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc32(td));
    return Buffer.concat([l, td, c]);
  };
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) Buffer.from(out.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1);
  const hd = Buffer.alloc(13);
  hd.writeUInt32BE(W, 0);
  hd.writeUInt32BE(H, 4);
  hd[8] = 8;
  hd[9] = 6;
  const file = resolve(opt('out', join(ROOT, 'hero-preview', `${HERO}-rig.png`)));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', hd), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
  console.log(`\nкадры с костями → ${file}`);
}
