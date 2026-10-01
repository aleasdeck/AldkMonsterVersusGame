// Страница обсуждения «Тёмная музыка локаций»: все варианты треков (src/ui/music/tracks) в MP3 с волной, описанием
// и рекомендацией; выбор по локации и строка выбора для чата.
//
//   node tools/music-proto/build.mjs            → music-preview/muzyka-lokaciy.html, music-preview/<трек>.mp3, music-preview/bg/<локация>.png
//   node tools/music-proto/build.mjs --page     → только HTML: MP3 и волны из прошлого запуска (music-preview/peaks.json)
//
// Треки рендерит тот же синтезатор, что в игре (esbuild собирает src/ui/music в памяти), MP3 кодирует ffmpeg.
// Страница ссылается на MP3 и фоны относительными путями — так её и публикуют: HTML плюс эти файлы рядом.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const OUT = join(ROOT, 'music-preview');
const PEAKS = 140;
const PAGE_ONLY = process.argv.includes('--page');
const PEAKS_FILE = join(OUT, 'peaks.json');
const cached = PAGE_ONLY ? JSON.parse(readFileSync(PEAKS_FILE, 'utf8')) : {};
const peaksById = {};

/** Цвет локации — по свету, которым она тонирует бойцов (src/ui/tint.ts, TINTS), но насыщеннее: бледный на тёмном не читается. */
const TINT = { forest: '#b9e89a', swamp: '#d4ec8f', hive: '#ff7a50', ship: '#9fb0ff', caves: '#ff6442', crypt: '#ff9f87' };

/** Почему рекомендую выбранный в MUSIC_PICK вариант — по замыслу; решает слух. */
const WHY = {
  forest: 'Виолончель и марш сильнее всего звучат как тёмное фэнтези и держат бой; A — для карты, но в бою усыпит, C — самый бодрый.',
  swamp: 'Болото слышно с первого такта: банджо, сердце вместо бочки, вязкий блюз. A и B мрачнее, но ближе к эмбиенту других локаций.',
  hive: 'Ужас с ритмом: медь ползёт остинато с тритоном, хор и тремоло пугают. A почти без мелодии, C ближе к тёмному синтезатору.',
  ship: 'Мужской хор с морской песней — корабль-призрак узнаётся сразу. A — штиль без пульса, C — бодрый абордаж.',
  caves: 'Обряд культа: распев на один слог и тайко держат темп и пахнут серой. C (дум) ярче, но по жанру выбивается из остальных.',
  crypt: 'Готический орган — классика склепа. B (шкатулка) жутче, но на долгом забеге может утомить; A — почти тишина собора.',
};

const bundle = await build({
  stdin: {
    contents: [
      "export { VARIANTS, MUSIC_PICK } from './src/ui/music/songs';",
      "export { renderSong, songSeconds } from './src/ui/music/synth';",
      "export { LOCATIONS } from './src/data/locations';",
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
const { VARIANTS, MUSIC_PICK, renderSong, songSeconds, LOCATIONS } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

/** WAV с 32-битными float-отсчётами — вход для ffmpeg. */
function wav(r) {
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

/** Волна для страницы: пик по кускам, нормированный к самому громкому. */
function peaksOf(r) {
  const n = r.left.length;
  const out = [];
  for (let k = 0; k < PEAKS; k++) {
    let m = 0;
    const a = Math.floor((k * n) / PEAKS);
    const b = Math.floor(((k + 1) * n) / PEAKS);
    for (let i = a; i < b; i += 4) m = Math.max(m, Math.abs(r.left[i] + r.right[i]) / 2);
    out.push(m);
  }
  const top = Math.max(...out) || 1;
  return out.map((v) => +(v / top).toFixed(3));
}

mkdirSync(join(OUT, 'bg'), { recursive: true });
const locations = [];
for (const loc of LOCATIONS) {
  copyFileSync(join(ROOT, 'src/assets/backgrounds', `${loc.id}-wide.png`), join(OUT, 'bg', `${loc.id}.png`));
  const variants = [];
  for (const song of VARIANTS[loc.id]) {
    const t0 = performance.now();
    if (!PAGE_ONLY) {
      const r = renderSong(song);
      const tmp = join(OUT, `${song.id}.tmp.wav`);
      writeFileSync(tmp, wav(r));
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-codec:a', 'libmp3lame', '-b:a', '160k', join(OUT, `${song.id}.mp3`)]);
      rmSync(tmp);
      peaksById[song.id] = peaksOf(r);
    } else peaksById[song.id] = cached[song.id];
    variants.push({
      id: song.id,
      variant: song.variant,
      title: song.title,
      mood: song.mood,
      key: song.key,
      bpm: song.bpm,
      meter: song.meter ?? `${song.beatsPerBar}/4`,
      seconds: +songSeconds(song).toFixed(2),
      voices: song.parts.filter((p) => p.inst !== 'drums').map((p) => p.name),
      drums: song.parts.filter((p) => p.inst === 'drums').map((p) => p.name),
      file: `${song.id}.mp3`,
      peaks: peaksById[song.id],
      recommended: MUSIC_PICK[loc.id] === song.variant,
    });
    console.log(`${song.id} «${song.title}» — ${Math.round(performance.now() - t0)} мс`);
  }
  locations.push({ id: loc.id, name: loc.name, desc: loc.desc, tint: TINT[loc.id], bg: `bg/${loc.id}.png`, why: WHY[loc.id], variants });
}

if (!PAGE_ONLY) writeFileSync(PEAKS_FILE, JSON.stringify(peaksById));
const page = readFileSync(join(HERE, 'page.html'), 'utf8').replace('/*DATA*/null', JSON.stringify({ locations }));
const file = join(OUT, 'muzyka-lokaciy.html');
writeFileSync(file, page);
console.log(`→ ${file}`);
