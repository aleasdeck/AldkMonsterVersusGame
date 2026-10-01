// Страница обсуждения «Звуки действий»: все звуки и их варианты (src/ui/sfx/sounds.ts) в MP3 с волной и моментом удара,
// где какой звук звучит, рекомендации, заметки и строка выбора для чата; сверху — сцены: короткий бой поверх музыки
// локации, чтобы слышать звуки в миксе, а не по одному.
//
//   node tools/sfx-proto/build.mjs          → sfx-preview/zvuki.html, sfx-preview/snd/<звук>-<вариант>.mp3, sfx-preview/snd/scene-<сцена>.mp3
//   node tools/sfx-proto/build.mjs --page   → только HTML: MP3 и волны из прошлого запуска (sfx-preview/peaks.json)
//
// Звуки и музыку рендерит тот же синтезатор, что в игре (esbuild собирает src/ui/sfx и src/ui/music в памяти), MP3
// кодирует ffmpeg. Страница ссылается на MP3 относительными путями — так её и публикуют: HTML плюс папка snd рядом.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const OUT = join(ROOT, 'sfx-preview');
const SND = join(OUT, 'snd');
const PEAKS = 72;
const PAGE_ONLY = process.argv.includes('--page');
const PEAKS_FILE = join(OUT, 'peaks.json');
const cached = PAGE_ONLY ? JSON.parse(readFileSync(PEAKS_FILE, 'utf8')) : {};
const peaksById = {};

/** Цвет группы — цвет её анимации в игре (fx.ts, данные приёмов): сталь, стрела, магия, щит, кровь… */
const TINT = {
  strike: '#c9ccd1',
  shot: '#e9c46a',
  magic: '#b388ff',
  defense: '#8ecae6',
  status: '#ff6b7a',
  harm: '#ff8f5a',
  enemy: '#7ddc5a',
  turn: '#ffd166',
  ui: '#a9a9c8',
  loot: '#f9c74f',
  event: '#d9a46c',
  run: '#ffe9a0',
};

/**
 * Второй круг обсуждения: что пользователь выбрал в первом (у этих звуков остался один вариант) и его заметки к звукам,
 * которые сделаны заново, — заметка встаёт над их вариантами. Убранные звуки — строкой в разделе «Переделано».
 */
const PICKED = { hit_blade: 'Сталь', crit: 'Хруст', cast_orb: 'Тень', fire: 'Шар', block_up: 'Дерево и железо', heal: 'Хор', buff: 'Хор', hurt_hero: 'Без голоса', enemy_strike: 'Дубина', enemy_death: 'Падение', battle_start: 'Рог', turn_start: 'Стук', battle_win: 'Струны', ui_click: 'Кость' };
const FEEDBACK = {
  ice: 'На лёд совсем не похоже, там должен быть хруст льда или что-то такое',
  block_hit: 'Ничего не нравится, сильно звонкий',
  block_break: 'Что-то не то, не нравится',
  war_cry: 'Какой-то он не угрожающий, меняй',
  bleed: 'Не подходит, совсем не похоже на кровь',
  stun: 'Какой-то загадочный звук, не подходит',
  thorns: 'Не похоже, нужно что-то вроде укола о шип, а сейчас как будто по посуде ударили',
};
const REMOVED = [{ name: 'Волчий свисток', note: 'по заметке теперь звучит Призывом' }];

/**
 * Сцены: короткий бой или забег поверх трека локации — как это прозвучит в игре. Время в секундах; `id` — звук,
 * `key` — вариант (без него — рекомендованный), `hit` — поставить звук так, чтобы его удар пришёлся на это время,
 * `alone` — надстройку (крит) без звука-основы, `flip` — зеркально по панораме (снаряд врага летит в героя).
 */
const SCENES = [
  {
    id: 'forest',
    title: 'Бой в Лесу',
    desc: 'Воин против волка и бандита: удар, крит с кровью, замах и удары врага, лечение, гибель врага, победа.',
    music: 'forest',
    from: 0,
    len: 15,
    events: [
      { t: 0.2, id: 'battle_start' },
      { t: 1.9, id: 'turn_start' },
      { t: 2.4, id: 'ui_select' },
      { hit: 2.9, id: 'hit_blade' },
      { hit: 4.0, id: 'hit_blade' },
      { hit: 4.0, id: 'crit', alone: true },
      { t: 4.05, id: 'bleed' },
      { t: 5.0, id: 'ui_click' },
      { t: 5.5, id: 'windup' },
      { hit: 6.8, id: 'enemy_strike' },
      { t: 6.8, id: 'hurt_hero' },
      { hit: 7.8, id: 'enemy_strike' },
      { t: 7.8, id: 'block_hit' },
      { t: 8.8, id: 'turn_start' },
      { t: 9.0, id: 'wound_tick' },
      { t: 9.5, id: 'ui_select' },
      { hit: 9.9, id: 'heal' },
      { hit: 11.0, id: 'hit_blade' },
      { t: 11.05, id: 'enemy_death' },
      { t: 12.4, id: 'battle_win' },
    ],
  },
  {
    id: 'crypt',
    title: 'Маг в Склепе',
    desc: 'Огненный шар с горением, лёд до оцепенения, цепная молния; некромант поднимает скелета и бьёт тёмной стрелой, проклятие и вторая фаза.',
    music: 'crypt',
    from: 0,
    len: 16,
    events: [
      { t: 0.2, id: 'boss_start' },
      { t: 2.6, id: 'turn_start' },
      { hit: 3.3, id: 'fire' },
      { t: 3.35, id: 'burn' },
      { hit: 4.6, id: 'ice' },
      { t: 4.65, id: 'cold' },
      { hit: 5.8, id: 'ice' },
      { t: 5.85, id: 'freeze' },
      { hit: 7.0, id: 'bolt' },
      { t: 8.6, id: 'ui_click' },
      { t: 9.0, id: 'summon' },
      { hit: 10.6, id: 'cast_orb', flip: true },
      { t: 10.6, id: 'hurt_hero' },
      { t: 11.6, id: 'curse' },
      { t: 12.6, id: 'phase' },
    ],
  },
  {
    id: 'ship',
    title: 'Сундук и награда',
    desc: 'Карта Корабля: шаг в клетку, взлом сундука (штифт, отличная засечка, штифт), крышка, золото, вещи в сумку, кузнец.',
    music: 'ship',
    from: 0,
    len: 15,
    events: [
      { t: 0.3, id: 'ui_click' },
      { t: 0.6, id: 'step' },
      { t: 2.0, id: 'ui_open' },
      { t: 2.8, id: 'lock_pin' },
      { t: 3.6, id: 'lock_great' },
      { t: 4.3, id: 'lock_pin' },
      { t: 4.8, id: 'chest_open' },
      { t: 6.0, id: 'gold' },
      { t: 7.0, id: 'ui_select' },
      { t: 7.4, id: 'artifact' },
      { t: 8.6, id: 'gear' },
      { t: 9.6, id: 'potion_take' },
      { t: 10.8, id: 'ui_click' },
      { t: 11.4, id: 'buy' },
      { t: 12.2, id: 'forge' },
    ],
  },
];

const bundle = await build({
  stdin: {
    contents: [
      "export { SFX_LIST, SFX_GROUPS, sfxTake, sfxDef, sfxVariant } from './src/ui/sfx/sounds';",
      "export { renderTake, takeSeconds } from './src/ui/sfx/render';",
      "export { SONGS } from './src/ui/music/songs';",
      "export { renderSong } from './src/ui/music/synth';",
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
const { SFX_LIST, SFX_GROUPS, sfxTake, sfxDef, sfxVariant, renderTake, SONGS, renderSong, LOCATIONS } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

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

/** MP3 c запасом `gain` под пиком: кодер перескакивает пик между отсчётами, и звук у потолка хрипит. */
function mp3(r, name, kbps = 160, gain = 0.9) {
  const tmp = join(SND, `${name}.tmp.wav`);
  writeFileSync(tmp, wav(r));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-af', `volume=${gain}`, '-codec:a', 'libmp3lame', '-b:a', `${kbps}k`, join(SND, `${name}.mp3`)]);
  rmSync(tmp);
}

/**
 * Волна для страницы: пик по кускам, нормированный к самому громкому. У звука — в дБ от −48 до 0, чтобы видно было и
 * тихий хвост; у сцены — по амплитуде, иначе музыка под звуками рисуется сплошной стеной.
 */
function peaksOf(r, count = PEAKS, linear = false) {
  const n = r.left.length;
  const out = [];
  for (let k = 0; k < count; k++) {
    let m = 0;
    const a = Math.floor((k * n) / count);
    const b = Math.max(a + 1, Math.floor(((k + 1) * n) / count));
    for (let i = a; i < b; i += 2) m = Math.max(m, Math.abs(r.left[i]), Math.abs(r.right[i]));
    out.push(m);
  }
  const top = Math.max(...out) || 1;
  return out.map((v) => +(linear ? v / top : Math.max(0, 1 + (20 * Math.log10(v / top + 1e-9)) / 48)).toFixed(3));
}

const DUR_KEY = (id) => `${id}:sec`;
mkdirSync(SND, { recursive: true });

// ─── Звуки ───────────────────────────────────────────────────────────────
const groups = SFX_GROUPS.map((g) => ({ ...g, tint: TINT[g.id], sounds: [] }));
const byGroup = Object.fromEntries(groups.map((g) => [g.id, g]));
let variantCount = 0;
for (const def of SFX_LIST) {
  const variants = [];
  for (const v of def.variants) {
    const name = `${def.id}-${v.key}`;
    const t0 = performance.now();
    const { take, room, hit } = sfxTake(def, v.key);
    if (!PAGE_ONLY) {
      const r = renderTake(def.id, take, room, def.level ?? 0);
      mp3(r, name, 160);
      peaksById[name] = peaksOf(r);
      peaksById[DUR_KEY(name)] = +(r.left.length / r.sampleRate).toFixed(2);
    } else {
      peaksById[name] = cached[name];
      peaksById[DUR_KEY(name)] = cached[DUR_KEY(name)];
    }
    variants.push({ key: v.key, title: v.title, note: v.note, hit: +hit.toFixed(2), file: `snd/${name}.mp3`, seconds: peaksById[DUR_KEY(name)], peaks: peaksById[name] });
    variantCount++;
    if (!PAGE_ONLY) console.log(`${name} — ${Math.round(performance.now() - t0)} мс`);
  }
  byGroup[def.group].sounds.push({
    id: def.id,
    name: def.name,
    uses: def.uses,
    level: def.level ?? 0,
    over: def.over ? sfxDef(def.over).name : null,
    picked: PICKED[def.id] ?? null,
    feedback: FEEDBACK[def.id] ?? null,
    rec: def.variants.length > 1 ? (def.rec ?? def.variants[0].key) : null,
    why: def.why ?? null,
    variants,
  });
}

// ─── Сцены ───────────────────────────────────────────────────────────────
const scenes = [];
const SR = 44100;
for (const sc of SCENES) {
  const song = SONGS[sc.music];
  const loc = LOCATIONS.find((l) => l.id === sc.music);
  const name = `scene-${sc.id}`;
  const N = Math.round(sc.len * SR);
  const events = sc.events.map((e) => {
    const def = sfxDef(e.id);
    const v = sfxVariant(def, e.key);
    return { at: e.hit !== undefined ? e.hit - (v.hit ?? 0) : e.t, id: e.id, name: def.name, variant: v.key, hit: e.hit ?? e.t, alone: !!e.alone, flip: !!e.flip };
  });
  if (!PAGE_ONLY) {
    const t0 = performance.now();
    const music = renderSong(song);
    const L = new Float32Array(N);
    const R = new Float32Array(N);
    // Музыка и звуки — на одной громкости ползунков, как по умолчанию в игре (оба 50 %, по квадрату — четверть): поэтому
    // их отношение здесь то же, что услышит игрок. Музыка с начала петли входит за полсекунды, к концу гаснет.
    const fadeIn = 0.5 * SR;
    const fadeOut = 1.5 * SR;
    const m0 = Math.round(sc.from * SR);
    for (let i = 0; i < N; i++) {
      const j = (m0 + i) % music.left.length;
      const g = Math.min(1, i / fadeIn, (N - i) / fadeOut);
      L[i] = music.left[j] * g;
      R[i] = music.right[j] * g;
    }
    for (const e of events) {
      const def = sfxDef(e.id);
      const { take, room } = sfxTake(def, e.variant, e.alone);
      const r = renderTake(def.id, take, room, def.level ?? 0);
      const s0 = Math.round(e.at * SR);
      // Снаряд врага летит справа налево: звук героя зеркалится по панораме, как в игре зеркалится его рисунок.
      const [a, b] = e.flip ? [r.right, r.left] : [r.left, r.right];
      for (let i = 0; i < a.length && s0 + i < N; i++) {
        const g = Math.min(1, (N - s0 - i) / fadeOut);
        L[s0 + i] += a[i] * g;
        R[s0 + i] += b[i] * g;
      }
    }
    // Тот же мягкий лимитер, что у музыки: сумма музыки и ударов иногда выше нуля.
    const lim = (x) => {
      const a = Math.abs(x);
      if (a <= 0.75) return x;
      const y = 0.75 + 0.25 * Math.tanh((a - 0.75) / 0.25);
      return x < 0 ? -y : y;
    };
    // После лимитера — на 2 дБ ниже: MP3 перескакивает пик между отсчётами, и без запаса громкие удары хрипят.
    for (let i = 0; i < N; i++) {
      L[i] = lim(L[i]) * 0.8;
      R[i] = lim(R[i]) * 0.8;
    }
    const r = { left: L, right: R, sampleRate: SR };
    mp3(r, name, 192, 1);
    peaksById[name] = peaksOf(r, 240, true);
    console.log(`${name} «${sc.title}» — ${Math.round(performance.now() - t0)} мс`);
  } else peaksById[name] = cached[name];
  scenes.push({
    id: sc.id,
    title: sc.title,
    desc: sc.desc,
    music: `${loc?.name ?? sc.music} — «${song.title}»`,
    tint: TINT.turn,
    file: `snd/${name}.mp3`,
    seconds: sc.len,
    peaks: peaksById[name],
    events: events.map((e) => ({ t: +e.hit.toFixed(2), id: e.id, name: e.name })),
  });
}

if (!PAGE_ONLY) writeFileSync(PEAKS_FILE, JSON.stringify(peaksById));
const data = { groups, scenes, removed: REMOVED, stats: { sounds: SFX_LIST.length, variants: variantCount, choices: SFX_LIST.filter((d) => d.variants.length > 1).length } };
const page = readFileSync(join(HERE, 'page.html'), 'utf8').replace('/*DATA*/null', JSON.stringify(data));
const file = join(OUT, 'zvuki.html');
writeFileSync(file, page);
console.log(`→ ${file} (${SFX_LIST.length} звуков, ${variantCount} вариантов, ${scenes.length} сцены)`);
