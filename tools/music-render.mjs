// Музыка локаций в звуковые файлы — послушать трек без игры (docs/muzyka.md, «Проверка»).
//
//   node tools/music-render.mjs forest             → music-preview/forest.wav и сводка в консоли
//   node tools/music-render.mjs all --mp3          → все шесть, ещё и MP3 (нужен ffmpeg в PATH)
//   node tools/music-render.mjs crypt --loops 2    → петля дважды подряд — слышно стык
//   node tools/music-render.mjs swamp --solo гобой,колокол   → только эти партии
//   node tools/music-render.mjs all --parts --clash          → громкость партий и резкие созвучия
//   node tools/music-render.mjs --from src/ui/music/tracks/forest.ts --mp3   → черновики: все треки, которые отдают
//                                                    функции файла без аргументов (Song или Song[]), — по их id
//   node tools/music-render.mjs --inst              → громкость пресетов instruments.ts на общей фразе (выравнивание `gain`)
//
// Тот же синтезатор и те же треки, что в игре: esbuild собирает src/ui/music в памяти. WAV — 32-битный float, 44,1 кГц,
// стерео, как в игре. Сводка: длина петли, время рендера, пик и RMS в дБ, скачок на стыке петли против обычного шага
// соседних отсчётов (стык с большим скачком щёлкает); `--parts` — громкость каждой партии в миксе, чтобы сводить
// баланс числами; `--clash` — малые секунды и большие септимы между партиями, звучащие вместе дольше 0.4 доли: почти
// всегда это проходящая нота мелодии над аккордом (норма), но опечатка в ноте или аккорде вылезает здесь же.
//
// `--from` — рецепт трека, шаг «варианты» (docs/muzyka.md): черновик живёт рядом с треком локации или в любом файле
// и слушается, не трогая реестр SONGS и игру. `--inst` — шаг «новый инструмент»: сведение тянет любой трек к одному
// уровню, поэтому подъём сведения на одной и той же фразе и есть тихость пресета; `gain` пресетов подобран под 0 дБ,
// и пресет, который ушёл от нуля больше чем на 3 дБ, получает подсказку нового `gain`.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const VALUED = ['--loops', '--solo', '--out', '--from'];
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);
const FROM = opt('from', '');
const which = args.find((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.includes(args[i - 1]))) ?? (FROM || flag('inst') ? 'all' : '');
if (!which) {
  console.log('node tools/music-render.mjs <локация | all>[,…] [--from файл.ts] [--mp3] [--loops 2] [--solo партия,партия] [--parts] [--clash] [--out music-preview]');
  console.log('node tools/music-render.mjs --inst [ПРЕСЕТ,…]');
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
    contents: [
      "export { SONGS } from './src/ui/music/songs';",
      "export { renderSong, songSeconds } from './src/ui/music/synth';",
      "export { score } from './src/ui/music/score';",
      "export * as INSTRUMENTS from './src/ui/music/instruments';",
      FROM ? `export * as DRAFTS from ${JSON.stringify(resolve(FROM))};` : 'export const DRAFTS = null;',
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
const { renderSong, songSeconds, score, INSTRUMENTS } = lib;

/** Треки черновика: всё, что отдают функции файла без аргументов, если это трек (есть `parts`) или список треков. */
function draftsOf(mod) {
  const out = {};
  for (const [name, fn] of Object.entries(mod)) {
    if (typeof fn !== 'function' || fn.length) continue;
    const songs = [fn()].flat().filter((song) => song && Array.isArray(song.parts));
    if (!songs.length) console.log(`  ${name}() — не трек, пропущено`);
    for (const song of songs) out[song.id] = song;
  }
  return out;
}

const db = (x) => (x > 0 ? (20 * Math.log10(x)).toFixed(1) : '−∞');

if (flag('inst')) {
  // Фраза на все регистры: мелодия в середине, аккорд, низкая нота и высокая. Зал как у типичной партии.
  const m = score(4);
  const seq = m.line('C4 - E4 - G4 - - - | C3+G3+E4 - - - - - - - | A2 - - - E5 - - -', 2);
  console.log('Подъём сведения на общей фразе: `gain` пресета подобран так, чтобы фраза выходила на уровень сведения без подъёма (0 дБ);');
  console.log('плюс — пресет тише остальных, минус — громче, допуск ±3 дБ.');
  const names = which === 'all' ? Object.keys(INSTRUMENTS).filter((k) => INSTRUMENTS[k]?.env) : which.split(',');
  let limited = 0;
  for (const name of names) {
    const inst = INSTRUMENTS[name];
    if (!inst) throw new Error(`Нет пресета ${name}. Есть: ${Object.keys(INSTRUMENTS).join(', ')}`);
    const song = { id: name, location: 'forest', title: name, mood: '', key: '', bpm: 90, beatsPerBar: 4, reverb: { size: 0.8, damp: 0.5, wet: 0.3 }, parts: [{ name, inst, seq, vol: 1, pan: 0, rev: 0.3 }] };
    const r = renderSong(song);
    const lv = levels(r);
    const bad = r.left.filter((v) => !Number.isFinite(v)).length;
    const boost = 20 * Math.log10(r.gain);
    // Сведение берёт меньший из подъёмов «до TARGET_RMS» и «до запаса над пиком». Короткий щипок и колокол упираются
    // в пик: средняя громкость у затухающего звука ниже слышимой, и подсказка по ней сделала бы его громче нужного.
    // Признак — трек после сведения тише уровня сведения (TARGET_RMS 0.133 в synth.ts) больше чем на 0,5 дБ.
    const byPeak = lv.rms < 0.133 * 10 ** (-0.5 / 20);
    if (byPeak) limited++;
    const hint = Math.abs(boost) > 3 && !byPeak ? `  → gain ${inst.gain} → ${+(inst.gain * 10 ** (boost / 20)).toFixed(2)}` : '';
    const shown = Math.abs(boost) < 0.05 ? '0.0' : (boost > 0 ? '+' : '') + boost.toFixed(1);
    console.log(`  ${name.padEnd(13)} ${shown.padStart(5)} дБ${byPeak ? ' (по пику)' : ''}${bad ? '  НЕ ЧИСЛА!' : ''}${hint}`);
  }
  if (limited) console.log('  «по пику» — подъём ограничен пиком: щипок, колокол, удар. Их выравнивают на слух в треке, а не по этой цифре.');
  process.exit(0);
}

const SONGS = lib.DRAFTS ? draftsOf(lib.DRAFTS) : lib.SONGS;
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
