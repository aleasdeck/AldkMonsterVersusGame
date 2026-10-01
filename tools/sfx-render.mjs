// Звуки действий в звуковые файлы — послушать без игры (docs/zvuki.md, «Проверка»).
//
//   node tools/sfx-render.mjs all                 → sfx-preview/<звук>-<вариант>.wav и сводка в консоли
//   node tools/sfx-render.mjs hit_blade,crit --mp3 → только эти звуки, ещё и MP3 (ffmpeg в PATH)
//   node tools/sfx-render.mjs strike --spec       → вся группа (strike, magic, ui…) и спектрограммы PNG
//   node tools/sfx-render.mjs crit --alone        → надстройка без звука, поверх которого играет
//   node tools/sfx-render.mjs shot_arrow --env    → громкость по окнам 50 мс: видно, какая часть звука громче (свист
//                                                    против попадания, полёт против взрыва) — уши Claude
//
// Тот же синтезатор, что у музыки и в игре: esbuild собирает src/ui/sfx и src/ui/music в памяти. WAV — 32-битный float,
// 44,1 кГц, стерео. Сводка: длина, момент удара, громкость самого громкого окна 50 мс и пик после сведения, громкость
// до сведения (насколько звук пришлось тянуть) и тревоги: не числа, постоянная составляющая, пик у потолка, тишина.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);
const which = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1] === '--out')) ?? '';
if (!which) {
  console.log('node tools/sfx-render.mjs <all | группа | звук,звук> [--mp3] [--spec] [--alone] [--out sfx-preview]');
  process.exit(1);
}
const OUT = resolve(opt('out', join(ROOT, 'sfx-preview')));

const bundle = await build({
  stdin: {
    contents: ["export { SFX_LIST, SFX_GROUPS, sfxTake } from './src/ui/sfx/sounds';", "export { renderTake } from './src/ui/sfx/render';"].join('\n'),
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'warning',
});
const { SFX_LIST, SFX_GROUPS, sfxTake, renderTake } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

/** WAV с 32-битными float-отсчётами. */
export function wav(r) {
  const n = r.left.length;
  const buf = Buffer.alloc(44 + n * 8);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 8, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(3, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(r.sampleRate, 24);
  buf.writeUInt32LE(r.sampleRate * 8, 28);
  buf.writeUInt16LE(8, 32);
  buf.writeUInt16LE(32, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 8, 40);
  for (let i = 0; i < n; i++) {
    buf.writeFloatLE(r.left[i], 44 + i * 8);
    buf.writeFloatLE(r.right[i], 48 + i * 8);
  }
  return buf;
}

const groups = new Set(SFX_GROUPS.map((g) => g.id));
const ids = which.split(',');
const defs = SFX_LIST.filter((d) => which === 'all' || ids.includes(d.id) || (ids.some((x) => groups.has(x)) && ids.includes(d.group)));
if (!defs.length) {
  console.log(`Нет звуков «${which}». Группы: ${[...groups].join(', ')}`);
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });
const db = (x) => (x >= 0 ? '+' : '') + x.toFixed(1);
for (const def of defs) {
  for (const v of def.variants) {
    const t0 = performance.now();
    const { take, room, hit } = sfxTake(def, v.key, flag('alone'));
    const r = renderTake(def.id, take, room, def.level ?? 0);
    const ms = Math.round(performance.now() - t0);
    const n = r.left.length;
    let bad = 0;
    let dc = 0;
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(r.left[i]) || !Number.isFinite(r.right[i])) bad++;
      dc += r.left[i] + r.right[i];
    }
    dc /= 2 * n;
    const warn = [];
    if (bad) warn.push(`НЕ ЧИСЛА ${bad}`);
    if (Math.abs(dc) > 0.002) warn.push(`постоянная ${dc.toFixed(4)}`);
    if (r.peak > -0.3) warn.push('пик у потолка');
    if (r.loud < (def.level ?? 0) - 15 - 3) warn.push('тише цели — упёрся в пик');
    const name = `${def.id}-${v.key}`;
    const file = join(OUT, `${name}.wav`);
    writeFileSync(file, wav(r));
    if (flag('mp3')) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-codec:a', 'libmp3lame', '-b:a', '160k', join(OUT, `${name}.mp3`)]);
    if (flag('spec')) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-lavfi', 'showspectrumpic=s=800x300:legend=1:scale=log:fscale=log', join(OUT, `${name}.png`)]);
    if (flag('env')) {
      const w = Math.round(0.05 * r.sampleRate);
      const env = [];
      for (let a = 0; a < n; a += w) {
        let s = 0;
        const e = Math.min(n, a + w);
        for (let i = a; i < e; i++) s += (r.left[i] ** 2 + r.right[i] ** 2) / 2;
        env.push(String(Math.round(10 * Math.log10(s / (e - a) + 1e-12))).padStart(4));
      }
      console.log(`  дБ по 50 мс: ${env.slice(0, 48).join('')}`);
    }
    console.log(
      `${name.padEnd(18)} «${def.name} — ${v.title}» ${(n / r.sampleRate).toFixed(2)} с, удар ${hit.toFixed(2)} — громкость ${db(r.loud)} дБ (цель ${db((def.level ?? 0) - 15)}), пик ${db(r.peak)}, до сведения ${db(r.raw)}, ${ms} мс${warn.length ? '  ⚠ ' + warn.join(', ') : ''}`,
    );
  }
}
if (!flag('keep-wav') && flag('mp3')) for (const def of defs) for (const v of def.variants) rmSync(join(OUT, `${def.id}-${v.key}.wav`), { force: true });
