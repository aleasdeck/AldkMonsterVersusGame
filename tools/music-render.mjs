// Музыка локаций в звуковые файлы — послушать трек без игры (docs/muzyka.md, «Проверка»).
//
//   node tools/music-render.mjs forest             → music-preview/forest.wav и сводка в консоли
//   node tools/music-render.mjs all --mp3          → все шесть, ещё и MP3 (нужен ffmpeg в PATH)
//   node tools/music-render.mjs crypt --loops 2    → петля дважды подряд — слышно стык
//   node tools/music-render.mjs swamp --solo гобой,колокол   → только эти партии
//   node tools/music-render.mjs all --parts --clash          → громкость партий и резкие созвучия
//
// Тот же синтезатор и те же треки, что в игре: esbuild собирает src/ui/music в памяти. WAV — 32-битный float, 44,1 кГц,
// стерео, как в игре. Сводка: длина петли, время рендера, пик и RMS в дБ, скачок на стыке петли против обычного шага
// соседних отсчётов (стык с большим скачком щёлкает); `--parts` — громкость каждой партии в миксе, чтобы сводить
// баланс числами; `--clash` — малые секунды и большие септимы между партиями, звучащие вместе дольше 0.4 доли: почти
// всегда это проходящая нота мелодии над аккордом (норма), но опечатка в ноте или аккорде вылезает здесь же.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const VALUED = ['--loops', '--solo', '--out'];
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);
const which = args.find((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.includes(args[i - 1])));
if (!which) {
  console.log('node tools/music-render.mjs <локация | all>[,…] [--mp3] [--loops 2] [--solo партия,партия] [--parts] [--clash] [--out music-preview]');
  process.exit(1);
}
const OUT = resolve(opt('out', join(ROOT, 'music-preview')));
const LOOPS = Math.max(1, Number(opt('loops', 1)) || 1);
const SOLO = opt('solo', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const bundle = await build({
  stdin: {
    contents: ["export { SONGS } from './src/ui/music/songs';", "export { renderSong, songSeconds } from './src/ui/music/synth';"].join('\n'),
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'warning',
});
const { SONGS, renderSong, songSeconds } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const ids = which.split(',').flatMap((w) => (w === 'all' ? Object.keys(SONGS) : [w]));
const missing = ids.filter((id) => !SONGS[id]);
if (missing.length) {
  console.log(`Нет трека: ${missing.join(', ')}. Есть: ${Object.keys(SONGS).join(', ')}`);
  process.exit(1);
}

/** WAV с 32-битными float-отсчётами (формат 3). */
function wav(r, loops) {
  const n = r.left.length;
  const frames = n * loops;
  const buf = Buffer.alloc(44 + frames * 8);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + frames * 8, 4);
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
  buf.writeUInt32LE(frames * 8, 40);
  let o = 44;
  for (let k = 0; k < loops; k++)
    for (let i = 0; i < n; i++) {
      buf.writeFloatLE(r.left[i], o);
      buf.writeFloatLE(r.right[i], o + 4);
      o += 8;
    }
  return buf;
}

const db = (x) => (x > 0 ? (20 * Math.log10(x)).toFixed(1) : '−∞');

function levels(r) {
  let peak = 0;
  let sum = 0;
  let step = 0;
  const n = r.left.length;
  for (let i = 0; i < n; i++) {
    const l = r.left[i];
    const rr = r.right[i];
    peak = Math.max(peak, Math.abs(l), Math.abs(rr));
    sum += l * l + rr * rr;
    if (i) step += Math.abs(r.left[i] - r.left[i - 1]);
  }
  const seam = Math.abs(r.left[0] - r.left[n - 1]);
  return { peak, rms: Math.sqrt(sum / (2 * n)), seam, step: step / (n - 1) };
}

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const noteName = (m) => NAMES[m % 12] + (Math.floor(m / 12) - 1);

/** Малые секунды и большие септимы между разными партиями (без барабанов), звучащие вместе от 0.4 доли. */
function clashes(song) {
  const all = song.parts.filter((p) => p.inst !== 'drums').flatMap((p) => p.seq.items.map((n) => ({ ...n, part: p.name })));
  const found = new Map();
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];
      if (a.part === b.part) continue;
      const over = Math.min(a.t + a.len, b.t + b.len) - Math.max(a.t, b.t);
      const iv = Math.abs(a.midi - b.midi) % 12;
      if (over < 0.4 || (iv !== 1 && iv !== 11)) continue;
      const t = Math.max(a.t, b.t);
      const bar = Math.floor(t / song.beatsPerBar) + 1;
      const beat = +(t - (bar - 1) * song.beatsPerBar + 1).toFixed(2);
      const key = `такт ${bar}, доля ${beat}: ${a.part} ${noteName(a.midi)} × ${b.part} ${noteName(b.midi)}`;
      found.set(key, Math.max(found.get(key) ?? 0, over));
    }
  return [...found.entries()];
}

mkdirSync(OUT, { recursive: true });
for (const id of ids) {
  const song = SONGS[id];
  const t0 = performance.now();
  const r = renderSong(song, SOLO.length ? { only: SOLO } : {});
  const ms = performance.now() - t0;
  const lv = levels(r);
  const name = SOLO.length ? `${id}-${SOLO.join('+')}` : id;
  const file = join(OUT, `${name}.wav`);
  writeFileSync(file, wav(r, LOOPS));
  console.log(
    `${id} «${song.title}»: ${songSeconds(song).toFixed(1)} с, ${song.bpm} уд/мин, рендер ${Math.round(ms)} мс — пик ${db(lv.peak)} дБ, RMS ${db(lv.rms)} дБ, стык ${lv.seam.toFixed(3)} при среднем шаге ${lv.step.toFixed(3)} → ${file}`,
  );
  if (flag('mp3')) {
    const mp3 = file.replace(/\.wav$/, '.mp3');
    try {
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-codec:a', 'libmp3lame', '-b:a', '160k', mp3]);
      console.log(`  → ${mp3}`);
    } catch (e) {
      console.log(`  MP3 не вышел (нужен ffmpeg с libmp3lame): ${e.message.split('\n')[0]}`);
    }
  }
  if (flag('clash')) {
    const list = clashes(song);
    console.log(`  резких созвучий: ${list.length}`);
    for (const [k, v] of list) console.log(`    ${k} (${v.toFixed(2)} доли)`);
  }
  // Громкость каждой партии в миксе: сведение поднимает трек множителем `gain`, поэтому RMS до сведения — RMS / gain;
  // доля партии — её RMS до сведения против RMS всего трека до сведения, в дБ (0 — партия громкая, как весь трек).
  // Партия, которая звучит только часть трека, на RMS выходит тише, чем слышна.
  if (flag('parts')) {
    const full = lv.rms / r.gain;
    for (const p of song.parts) {
      const solo = renderSong(song, { sr: 16000, only: [p.name] });
      const part = levels(solo).rms / solo.gain;
      console.log(`  ${p.name.padEnd(16)} нот ${String(p.seq.items.length).padStart(4)}  ${db(part / full).padStart(6)} дБ к треку`);
    }
  }
}
