/**
 * Звуки действий — каталог (docs/zvuki.md). Один звук на одно по смыслу действие: удар клинком звучит одинаково у
 * меча, топора и приёмов ближнего боя, лечение — одинаково у заклинания, отвара и зелья. У самых частых звуков —
 * два-три варианта на выбор пользователя (как у музыки локаций), после выбора остаётся один.
 *
 * Стиль — тот же, что у музыки (docs/muzyka.md): тёмное фэнтези в духе 32-битных приставок, 44,1 кГц float, зал.
 * Звуки с высотой стоят в ре миноре (тоника большинства треков) и берут его тёмные краски: тритон ре — соль-диез,
 * фригийский полутон ре — ми-бемоль, гармоническую доминанту ля мажор; светлых мажорных «плимов» и чиптюна нет.
 * Звуки удара собраны из физики: свист воздуха, моды металла, дерева и кости, глухой толчок тела, шум в полосе;
 * магия и события — из инструментов музыки (хоры, колокола, стекло, орган, медь, арфа) и её ударных (тайко, гонг).
 *
 * Панорама: герой слева (минус), враги справа (плюс). `hit` варианта — момент удара в звуке, с: к нему игра приурочит
 * звук (касание клинка, попадание снаряда), остальное — замах и полёт до него и отзвук после.
 */
import * as I from '../music/instruments';
import type { Instrument } from '../music/synth';
import { ARMOR, BONE, bubbles, burst, chirp, crackle, flame, GLASS_MODES, hiss, ICE, modal, rumble, scatter, scrape, SHIELD, squelch, STEEL, steps, thud, voice, whoosh, WOOD, zap, type Mode } from './gens';
import { Take, type Room } from './render';

// ─── Группы ──────────────────────────────────────────────────────────────

export type SfxGroupId = 'strike' | 'shot' | 'magic' | 'defense' | 'status' | 'harm' | 'enemy' | 'turn' | 'ui' | 'loot' | 'event' | 'run';

export const SFX_GROUPS: { id: SfxGroupId; name: string; desc: string }[] = [
  { id: 'strike', name: 'Удары оружием', desc: 'Удар героя оружием ближнего боя и приёмы им, крит и промах.' },
  { id: 'shot', name: 'Стрелы и броски', desc: 'Дальнее оружие и всё, что летит из руки: стрела, камень пращи, склянка, крюк, сеть.' },
  { id: 'magic', name: 'Магия и снаряды', desc: 'Заклинания героя и врагов: сгусток, огонь, лёд, молния; выстрелы капитана; призыв.' },
  { id: 'defense', name: 'Защита и поддержка', desc: 'Блок и удар в него, лечение, бафы, клич, дым, глоток зелья, заточка, Молот света.' },
  { id: 'status', name: 'Раны и состояния', desc: 'Наложение статуса на бойца и тик раны в начале хода.' },
  { id: 'harm', name: 'Урон и гибель', desc: 'Герой ранен, удар врага, гибель врага, босса и героя, взрыв.' },
  { id: 'enemy', name: 'Приёмы врагов', desc: 'Замах, вой, кража и побег вора, вытягивание маны, «прислушаться», вторая фаза босса.' },
  { id: 'turn', name: 'Ход боя', desc: 'Начало боя и боя с боссом, начало хода героя, победа в бою.' },
  { id: 'ui', name: 'Интерфейс и карта', desc: 'Кнопки, выбор приёма и вкладки, запрет, оверлеи, вход в клетку карты.' },
  { id: 'loot', name: 'Добыча', desc: 'Золото, покупка, взятый предмет, артефакт, зелье, переброс награды.' },
  { id: 'event', name: 'События', desc: 'Сундук и взлом замка, кузнец, алтарь, привал, достижение.' },
  { id: 'run', name: 'Забег', desc: 'Начало забега и победа в нём.' },
];

// ─── Описание ────────────────────────────────────────────────────────────

export type SfxKey = 'a' | 'b' | 'c';

export interface SfxVariant {
  key: SfxKey;
  /** Образ одним-двумя словами — как у вариантов музыки. */
  title: string;
  /** Из чего собран, словами для страницы обсуждения. */
  note: string;
  room?: Room;
  /** Момент удара в звуке, с (касание, попадание); без него — начало звука. */
  hit?: number;
  take: (s: Take) => void;
}

export interface SfxDef {
  id: string;
  name: string;
  group: SfxGroupId;
  /** Какие действия игры звучат этим звуком. */
  uses: string[];
  /** Громкость против других звуков, дБ (0 — удар в бою; кнопки тише, гибель босса громче). */
  level?: number;
  /** Звук-надстройка: играет поверх другого (крит — поверх удара); на странице слышен вместе с ним. */
  over?: string;
  /** Рекомендованный вариант и почему (если вариантов несколько). */
  rec?: SfxKey;
  why?: string;
  variants: SfxVariant[];
}

// ─── Залы ────────────────────────────────────────────────────────────────

/** Близко: кнопки, руки, мелочи. */
const CLOSE: Room = { size: 0.35, damp: 0.55, wet: 0.12, pre: 8 };
/** Поле боя: небольшое помещение, удары не висят в пустоте; зал по умолчанию. */
const FIELD: Room = { size: 0.5, damp: 0.5, wet: 0.16, pre: 10 };
/** Магия и большое: зал как у треков Леса и Пещер. */
const HALL: Room = { size: 0.72, damp: 0.45, wet: 0.24, pre: 18 };
/** Собор: босс, гибель, алтарь, победа — как у Склепа. */
const CHURCH: Room = { size: 0.92, damp: 0.42, wet: 0.32, pre: 30 };

// ─── Инструменты под короткий звук ───────────────────────────────────────

/** Хоры музыки вступают за секунду — для звука атака короче. */
const CHOIR_STAB: Instrument = { ...I.CHOIR_A, env: { a: 0.03, d: 0.5, s: 0.7, r: 0.5 } };
const CHOIR_SWELL: Instrument = { ...I.CHOIR_A, env: { a: 0.22, d: 0.8, s: 0.9, r: 0.8 } };
const CHOIR_SOFT: Instrument = { ...I.CHOIR_O, env: { a: 0.12, d: 0.6, s: 0.85, r: 0.7 } };
const CHOIR_HUM: Instrument = { ...I.CHOIR_U, env: { a: 0.06, d: 0.5, s: 0.8, r: 0.5 } };
/** Хор вниз: голоса съезжают в ноту сверху — вздох, проклятие, гибель. */
const CHOIR_FALL: Instrument = { ...I.CHOIR_U, env: { a: 0.08, d: 0.7, s: 0.8, r: 0.7 }, bend: { semis: 4, time: 0.7 } };
const CHOIR_DESCEND: Instrument = { ...I.CHOIR_A, env: { a: 0.15, d: 1, s: 0.85, r: 1 }, bend: { semis: 5, time: 1.4 } };
/** Хор вверх: из-под ноты — призыв, нарастание. */
const CHOIR_RISE: Instrument = { ...I.CHOIR_U, env: { a: 0.3, d: 0.7, s: 0.9, r: 0.5 }, bend: { semis: -3, time: 0.6 } };
const CHANT_STAB: Instrument = { ...I.CHANT, env: { a: 0.02, d: 0.3, s: 0.6, r: 0.3 } };
/** Колокол коротким звоном — не на шесть секунд. */
const BELL_SHORT: Instrument = { ...I.BELL, env: { a: 0.002, d: 1.6, s: 0, r: 0.9 } };
const BELL_TICK: Instrument = { ...I.BELL, index: 3, env: { a: 0.002, d: 0.8, s: 0, r: 0.4 } };
const KNELL: Instrument = { ...I.BELL, env: { a: 0.002, d: 3, s: 0, r: 1.5 } };
const GLASS_SHORT: Instrument = { ...I.GLASS, env: { a: 0.03, d: 0.6, s: 0.4, r: 0.6 } };
/** Стекло из-под ноты — сгусток набирает силу. */
const GLASS_RISE: Instrument = { ...I.GLASS, env: { a: 0.03, d: 0.5, s: 0.5, r: 0.3 }, bend: { semis: -5, time: 0.3 } };
/** Стекло на октаву вниз — вытягивание маны. */
const GLASS_FALL: Instrument = { ...I.GLASS, env: { a: 0.02, d: 0.5, s: 0.6, r: 0.3 }, bend: { semis: 12, time: 0.5 } };
/** Медь коротким тычком: дум-аккорд тритоном. */
const BRASS_STAB: Instrument = { ...I.LOW_BRASS, env: { a: 0.02, d: 0.4, s: 0.6, r: 0.35 } };
const HORN_CALL: Instrument = { ...I.HORN, env: { a: 0.06, d: 0.5, s: 0.85, r: 0.45 } };
/** Тремоло струнных нарастает — замах врага. */
const STRING_SWELL: Instrument = { ...I.TREMOLO, env: { a: 0.35, d: 0.5, s: 0.9, r: 0.2 } };
const STRING_STAB: Instrument = { ...I.STRINGS, env: { a: 0.03, d: 0.4, s: 0.8, r: 0.3 } };
/** Саб снизу вверх — жар бафа. */
const SUB_RISE: Instrument = { ...I.SUB, env: { a: 0.3, d: 0.3, s: 1, r: 0.15 }, bend: { semis: -7, time: 0.45 } };
const SUB_THUMP: Instrument = { ...I.SUB, env: { a: 0.005, d: 0.25, s: 0, r: 0.1 } };
/** Тетива: низкая глухая струна, гаснет за треть секунды. */
const BOWSTRING: Instrument = { wave: 'pluck', pluck: { bright: 0.35, decay: 0.35 }, cutoff: 1400, env: { a: 0.001, d: 1, s: 1, r: 0.06 }, gain: 0.9 };
/** Свист в пальцы или в манок: синус с дыханием, подъезд снизу. */
const WHISTLE: Instrument = { wave: 'sine', breath: 0.25, cutoff: 5000, env: { a: 0.02, d: 0.2, s: 0.9, r: 0.08 }, vib: { rate: 7, depth: 15, delay: 0.1 }, bend: { semis: -2, time: 0.06 }, gain: 0.35 };
/** Тошнотворный тон яда: два синуса врозь и широкое вибрато. */
const SICK: Instrument = { wave: 'sine', unison: { voices: 2, cents: 40 }, env: { a: 0.08, d: 0.4, s: 0.6, r: 0.25 }, vib: { rate: 6, depth: 60, delay: 0 }, gain: 0.4 };
const STRINGS_FAST: Instrument = { ...I.STRINGS, env: { a: 0.04, d: 0.5, s: 0.85, r: 0.5 } };

/** Монета: звонкий диск, три моды. */
const COIN: Mode[] = [[3150, 0.09, 1], [7180, 0.05, 0.45], [10200, 0.03, 0.25]];
/** Тонкий металл замка и защёлки. */
const LATCH: Mode[] = [[3100, 0.012, 1], [5200, 0.008, 0.6], [7400, 0.005, 0.3]];
/** Мелкие обломки лат. */
const SHARDS: Mode[] = [[900, 0.03, 1], [2100, 0.025, 0.7], [3600, 0.02, 0.4]];

// ─── Кирпичи ─────────────────────────────────────────────────────────────

/** Взмах от героя к врагу: шум, полоса которого взлетает к `f` и падает. */
function swing(s: Take, at: number, dur: number, f: number, vel: number): void {
  s.gen(at, whoosh({ dur, f0: f * 0.25, fPeak: f, f1: f * 0.4, q: 1.4, peak: 0.7 }), { vel, pan: -0.25, panTo: 0.2, rev: 0.12 });
}

/** Удар по телу: глухой толчок и шлепок. */
function flesh(s: Take, at: number, pan: number, vel: number): void {
  s.gen(at, thud({ f0: 150, f1: 55, tau: 0.08 }), { vel, pan, rev: 0.15 });
  s.gen(at, burst({ lo: 250, hi: 1400, tau: 0.03 }), { vel: vel * 0.75, pan, rev: 0.15 });
}

/** Взрыв: удар воздуха, тёмный выдох с падающим срезом, угли и раскат. */
function blast(s: Take, at: number, pan: number, vel: number): void {
  s.gen(at, thud({ f0: 85, f1: 28, tau: 0.3, drive: 2.2 }), { vel, pan, rev: 0.3 });
  s.gen(at, whoosh({ dur: 0.65, f0: 5500, fPeak: 5500, f1: 200, peak: 0.03, lp: true }), { vel: vel * 0.75, pan, rev: 0.35 });
  s.gen(at + 0.02, crackle({ dur: 0.8, rate: 220, rateEnd: 12, lo: 900, hi: 6000, tau: 0.35 }), { vel: vel * 0.45, pan, rev: 0.35 });
  s.gen(at, rumble({ dur: 1.1, cut: 150, attack: 0.02, tau: 0.35 }), { vel: vel * 0.5, pan, rev: 0.4 });
}

/** Ухмылка вора: три коротких «хи». */
function snicker(s: Take, at: number, pan: number, vel: number): void {
  for (let i = 0; i < 3; i++) s.gen(at + i * 0.08, voice({ dur: 0.06, pitch: [[0, 640 - i * 30], [1, 580 - i * 30]], vowel: 'i', noise: 0.55, attack: 0.008, release: 0.03 }), { vel: vel * (1 - i * 0.15), pan, rev: 0.3 });
}

// ─── Каталог ─────────────────────────────────────────────────────────────

const list: SfxDef[] = [
  // ═══ Удары оружием ═══
  {
    id: 'hit_blade',
    name: 'Клинок',
    group: 'strike',
    uses: ['удар мечом, топором, кинжалом, стилетом, копьём', 'приёмы ближнего боя оружием: Вихрь, Оглушающий удар, Кровопускание, Двойной выпад, Добивание, Финишер, Цепная атака, Пролом щита, Око за око, Раскол, Вскрытие', 'Ответный удар Воина', 'клинки элит и боссов: Минотавр, Первый помощник, Морской дьявол, Проклятый капитан, Призрак капитана'],
    rec: 'a',
    why: 'Сталь слышна сразу и не путается с ударом врага (у него когти и дубина); «Рассечь» суше, «Тяжёлый» хорош, но на каждом ударе утомит.',
    variants: [
      {
        key: 'a',
        title: 'Сталь',
        note: 'Свист взмаха, звонкое «дзынь» стали и глухой удар по телу.',
        hit: 0.11,
        take: (s) => {
          swing(s, 0, 0.13, 2600, 0.55);
          s.gen(0.11, modal(STEEL, { strike: 0.5 }), { vel: 0.45, pan: 0.25, rev: 0.2 });
          flesh(s, 0.11, 0.25, 0.8);
        },
      },
      {
        key: 'b',
        title: 'Рассечь',
        note: 'Короткий высокий взмах, мокрый рез и едва слышная сталь — суше и ближе.',
        hit: 0.1,
        take: (s) => {
          swing(s, 0, 0.12, 3200, 0.6);
          s.gen(0.1, squelch({ dur: 0.09, f0: 3000, f1: 400, q: 2 }), { vel: 0.55, pan: 0.25, rev: 0.12 });
          s.gen(0.1, burst({ lo: 700, hi: 4000, tau: 0.02 }), { vel: 0.6, pan: 0.25, rev: 0.12 });
          s.gen(0.1, thud({ f0: 130, f1: 50, tau: 0.06 }), { vel: 0.6, pan: 0.25, rev: 0.12 });
          s.gen(0.1, modal(STEEL, { scale: 1.25, damp: 2 }), { vel: 0.2, pan: 0.25, rev: 0.15 });
        },
      },
      {
        key: 'c',
        title: 'Тяжёлый',
        note: 'Низкий взмах, тайко под ударом, хруст кости и сталь пониже — каждый удар как сильный.',
        hit: 0.16,
        room: HALL,
        take: (s) => {
          s.gen(0, whoosh({ dur: 0.2, f0: 250, fPeak: 1400, f1: 500, q: 1, peak: 0.75 }), { vel: 0.75, pan: -0.25, panTo: 0.2, rev: 0.15 });
          s.drum(0.16, 'K', { vel: 0.45, pan: 0.2, rev: 0.3 });
          s.gen(0.16, thud({ f0: 110, f1: 42, tau: 0.14, drive: 1.5 }), { vel: 0.8, pan: 0.25 });
          s.gen(0.16, crackle({ dur: 0.05, rate: 1500, lo: 900, hi: 3500, tau: 0.03 }), { vel: 0.5, pan: 0.25 });
          s.gen(0.16, modal(STEEL, { scale: 0.8 }), { vel: 0.3, pan: 0.25, rev: 0.3 });
        },
      },
    ],
  },
  {
    id: 'hit_blunt',
    name: 'Дробящий удар',
    group: 'strike',
    uses: ['удар булавой и молотом', 'Щитовой удар, Таран и Обвал щита (удар щитом всем весом)'],
    variants: [
      {
        key: 'a',
        title: 'Булава',
        note: 'Тяжёлый низкий взмах, удар с перегрузом, хруст кости и глухое железо.',
        hit: 0.15,
        take: (s) => {
          s.gen(0, whoosh({ dur: 0.18, f0: 220, fPeak: 1100, f1: 400, q: 0.9, peak: 0.8 }), { vel: 0.75, pan: -0.25, panTo: 0.2, rev: 0.12 });
          s.gen(0.15, thud({ f0: 120, f1: 40, tau: 0.14, drive: 1.5 }), { vel: 0.95, pan: 0.25 });
          s.gen(0.15, crackle({ dur: 0.05, rate: 1800, lo: 900, hi: 3500, tau: 0.03 }), { vel: 0.55, pan: 0.25 });
          s.gen(0.15, modal(ARMOR, { scale: 0.7, damp: 1.5 }), { vel: 0.3, pan: 0.25, rev: 0.2 });
          s.gen(0.15, burst({ lo: 80, hi: 700, tau: 0.05 }), { vel: 0.6, pan: 0.25 });
        },
      },
    ],
  },
  {
    id: 'hit_whip',
    name: 'Плеть',
    group: 'strike',
    uses: ['удар плетью (по всему ряду — один звук на удар)'],
    variants: [
      {
        key: 'a',
        title: 'Хлёст',
        note: 'Разгоняющийся свист и сухой щелчок кончика, который отдаётся в зале.',
        hit: 0.15,
        take: (s) => {
          s.gen(0, whoosh({ dur: 0.16, f0: 500, fPeak: 2800, f1: 3500, q: 1.3, peak: 0.9 }), { vel: 0.45, pan: -0.2, panTo: 0.3, rev: 0.1 });
          s.gen(0.15, burst({ lo: 2500, hi: 12000, tau: 0.004 }), { vel: 0.7, pan: 0.3, rev: 0.35 });
          s.gen(0.15, chirp({ dur: 0.025, f0: 3800, f1: 1200 }), { vel: 0.35, pan: 0.3, rev: 0.3 });
          s.gen(0.15, thud({ f0: 220, f1: 90, tau: 0.03 }), { vel: 0.35, pan: 0.3 });
          s.gen(0.15, burst({ lo: 400, hi: 2000, tau: 0.02 }), { vel: 0.4, pan: 0.3 });
        },
      },
    ],
  },
  {
    id: 'crit',
    name: 'Крит',
    group: 'strike',
    over: 'hit_blade',
    level: 2,
    uses: ['критический удар героя и врага — поверх звука удара', 'удар из тени и по оглушённой цели (это тоже крит)'],
    rec: 'b',
    why: 'Хруст с низким ударом читается как «пробил», не спорит со сталью клинка; «Звон» сливается с ней, «Рок» с медью — для босса слишком часто.',
    variants: [
      {
        key: 'a',
        title: 'Звон',
        note: 'Сталь звенит втрое дольше, тайко и низкий толчок под ней.',
        take: (s) => {
          s.gen(0, modal(STEEL, { damp: 0.4 }), { vel: 0.5, pan: 0.25, rev: 0.4 });
          s.drum(0, 'K', { vel: 0.5, pan: 0.2, rev: 0.3 });
          s.gen(0, burst({ lo: 2000, hi: 9000, tau: 0.01 }), { vel: 0.5, pan: 0.25 });
          s.gen(0, thud({ f0: 80, f1: 35, tau: 0.25, drive: 1 }), { vel: 0.6, pan: 0.2 });
        },
      },
      {
        key: 'b',
        title: 'Хруст',
        note: 'Ломается кость: плотный треск, сухой щелчок, удар с перегрузом и брызги.',
        take: (s) => {
          s.gen(0, crackle({ dur: 0.08, rate: 2500, lo: 700, hi: 3000, tau: 0.05 }), { vel: 0.8, pan: 0.25 });
          s.gen(0, modal(BONE, { scale: 0.8 }), { vel: 0.5, pan: 0.25 });
          s.gen(0, thud({ f0: 90, f1: 32, tau: 0.22, drive: 2 }), { vel: 0.9, pan: 0.2, rev: 0.25 });
          s.gen(0.01, squelch({ dur: 0.15, f0: 2000, f1: 300 }), { vel: 0.4, pan: 0.3 });
        },
      },
      {
        key: 'c',
        title: 'Рок',
        note: 'Тайко и медь тритоном (ре — соль-диез), сталь звенит в зале.',
        room: HALL,
        take: (s) => {
          s.drum(0, 'K', { vel: 0.7, pan: 0.2, rev: 0.3 });
          s.note(0, BRASS_STAB, 'D2+G#2', 0.25, { vel: 0.9, rev: 0.4 });
          s.gen(0, modal(STEEL, { damp: 0.5 }), { vel: 0.35, pan: 0.25, rev: 0.4 });
        },
      },
    ],
  },
  {
    id: 'miss',
    name: 'Промах',
    group: 'strike',
    level: -4,
    uses: ['удар прошёл мимо: уворот вора, Уклонение и «Порхание» врагов', 'Уклонение героя гасит удар врага'],
    variants: [
      {
        key: 'a',
        title: 'Мимо',
        note: 'Взмах в пустоту и короткий шаг в сторону — без удара.',
        hit: 0.12,
        take: (s) => {
          s.gen(0, whoosh({ dur: 0.22, f0: 400, fPeak: 2200, f1: 700, q: 1.1 }), { vel: 0.6, pan: -0.2, panTo: 0.3, rev: 0.15 });
          s.gen(0.06, whoosh({ dur: 0.18, f0: 600, fPeak: 1800, q: 1.6 }), { vel: 0.3, pan: 0.4, panTo: 0.6, rev: 0.15 });
        },
      },
    ],
  },

  // ═══ Стрелы и броски ═══
  {
    id: 'shot_arrow',
    name: 'Стрела',
    group: 'shot',
    level: -1,
    uses: ['удар луком, арбалетом, дротиками', 'Прицельный выстрел, Подсечный выстрел, Дождь из стрел (по звуку на стрелу)', 'стрелы Скелета-лучника'],
    variants: [
      {
        key: 'a',
        title: 'Тетива',
        note: 'Глухой щелчок тетивы, свист стрелы с допплером через поле и сухой удар древка.',
        hit: 0.26,
        take: (s) => {
          s.note(0, BOWSTRING, 'D2', 0.12, { vel: 0.9, pan: -0.3, rev: 0.1 });
          s.gen(0, thud({ f0: 260, f1: 110, tau: 0.02, click: 0.5 }), { vel: 0.45, pan: -0.3 });
          s.gen(0.02, whoosh({ dur: 0.25, f0: 3400, fPeak: 3600, f1: 2300, q: 5, peak: 0.85 }), { vel: 0.12, pan: -0.3, panTo: 0.3, rev: 0.15 });
          s.gen(0.26, thud({ f0: 300, f1: 120, tau: 0.04 }), { vel: 0.8, pan: 0.3 });
          s.gen(0.26, burst({ lo: 500, hi: 3000, tau: 0.025 }), { vel: 0.7, pan: 0.3 });
          s.gen(0.26, modal(WOOD, { scale: 2, damp: 1.5 }), { vel: 0.3, pan: 0.3 });
        },
      },
    ],
  },
  {
    id: 'shot_stone',
    name: 'Камень пращи',
    group: 'shot',
    level: -1,
    uses: ['удар пращой'],
    variants: [
      {
        key: 'a',
        title: 'Праща',
        note: 'Два оборота над головой, низкий свист полёта и сухой стук камня о тело.',
        hit: 0.33,
        take: (s) => {
          s.gen(0, whoosh({ dur: 0.11, f0: 300, fPeak: 1300, q: 1 }), { vel: 0.35, pan: -0.3 });
          s.gen(0.09, whoosh({ dur: 0.11, f0: 300, fPeak: 1400, q: 1 }), { vel: 0.45, pan: -0.3 });
          s.gen(0.18, whoosh({ dur: 0.16, f0: 1200, fPeak: 1000, f1: 800, q: 3 }), { vel: 0.18, pan: -0.1, panTo: 0.3 });
          s.gen(0.33, modal(BONE, { scale: 0.75 }), { vel: 0.6, pan: 0.3 });
          s.gen(0.33, thud({ f0: 160, f1: 60, tau: 0.07 }), { vel: 0.8, pan: 0.3 });
          s.gen(0.33, crackle({ dur: 0.04, rate: 1500, lo: 1000, hi: 4000 }), { vel: 0.3, pan: 0.3 });
        },
      },
    ],
  },
  {
    id: 'shot_flask',
    name: 'Склянка',
    group: 'shot',
    uses: ['Флакон яда, Заражение, Ядовитое облако, Катализатор', 'брошенная Огненная склянка', 'Ядовитый плевок Матери жаб, Кислотный дождь Сердца улья, Песок в глаза у воров'],
    variants: [
      {
        key: 'a',
        title: 'Разбить',
        note: 'Мягкий бросок, стекло бьётся вдребезги, плеск и шипение жидкости, пара пузырей.',
        hit: 0.44,
        take: (s) => {
          s.gen(0, whoosh({ dur: 0.16, f0: 350, fPeak: 1200, q: 1 }), { vel: 0.7, pan: -0.3, panTo: 0 });
          // Склянка кувыркается в полёте: тихий воздух, который то нарастает, то пропадает.
          s.gen(0.12, hiss({ dur: 0.32, lo: 400, hi: 1600, attack: 0.05, tau: 0.3, flutter: 0.9 }), { vel: 0.25, pan: 0, panTo: 0.3 });
          s.gen(0.44, scatter({ n: 12, spread: 0.07, modes: GLASS_MODES, fVar: 0.3, decay: 0.85 }), { vel: 0.55, pan: 0.3, rev: 0.3 });
          s.gen(0.44, modal(GLASS_MODES), { vel: 0.35, pan: 0.3, rev: 0.3 });
          s.gen(0.44, burst({ lo: 3000, hi: 12000, tau: 0.03 }), { vel: 0.5, pan: 0.3 });
          s.gen(0.44, squelch({ dur: 0.14, f0: 2200, f1: 300 }), { vel: 0.45, pan: 0.3 });
          s.gen(0.46, hiss({ dur: 0.6, lo: 3000, hi: 8000, attack: 0.03, tau: 0.25, flutter: 0.5 }), { vel: 0.18, pan: 0.3 });
          s.gen(0.46, bubbles({ dur: 0.4, rate: 50, lo: 300, hi: 900 }), { vel: 0.2, pan: 0.3 });
        },
      },
    ],
  },
  {
    id: 'hook',
    name: 'Крюк',
    group: 'shot',
    uses: ['Крюк-кошка: бросок, крюк впивается, цепь тащит цель в первый ряд'],
    variants: [
      {
        key: 'a',
        title: 'Цепь',
        note: 'Бросок с лязгом цепи, железо впивается, рывок цепью и цель падает перед героем.',
        hit: 0.26,
        take: (s) => {
          s.gen(0, whoosh({ dur: 0.2, f0: 500, fPeak: 1500, q: 1.2 }), { vel: 0.4, pan: -0.3, panTo: 0.3 });
          s.drum(0.02, 'z', { vel: 0.35, pan: -0.5 });
          s.gen(0.26, modal(ARMOR, { scale: 1.4, damp: 1.4 }), { vel: 0.45, pan: 0.3 });
          flesh(s, 0.26, 0.3, 0.55);
          s.drum(0.36, 'z', { vel: 0.55, pan: -0.2 });
          s.gen(0.36, scrape({ dur: 0.3, f0: 700, f1: 400, q: 8 }), { vel: 0.3, pan: 0.2, panTo: -0.1 });
          s.gen(0.62, thud({ f0: 120, f1: 50, tau: 0.08 }), { vel: 0.5, pan: 0 });
        },
      },
    ],
  },
  {
    id: 'net',
    name: 'Сеть',
    group: 'shot',
    uses: ['Ловчая сеть'],
    variants: [
      {
        key: 'a',
        title: 'Накрыть',
        note: 'Сеть раскрывается широким свистом, шуршат верёвки, по ряду падают грузила.',
        hit: 0.3,
        take: (s) => {
          s.gen(0, whoosh({ dur: 0.32, f0: 250, fPeak: 900, f1: 400, q: 0.7 }), { vel: 0.6, pan: -0.2, panTo: 0.3 });
          s.gen(0.02, hiss({ dur: 0.4, lo: 1500, hi: 5000, attack: 0.08, tau: 0.15, flutter: 0.8 }), { vel: 0.35, pan: 0, panTo: 0.3 });
          [0.3, 0.34, 0.4].forEach((at, i) => s.gen(at, thud({ f0: 190, f1: 90, tau: 0.03 }), { vel: 0.35 - i * 0.05, pan: 0.15 + i * 0.2 }));
          s.drum(0.32, 'n', { vel: 1.2, cut: 0.4, pan: 0.6 });
        },
      },
    ],
  },

  // ═══ Магия и снаряды ═══
  {
    id: 'cast_orb',
    name: 'Сгусток',
    group: 'magic',
    uses: ['Волшебная стрела, Высасывание, Сглаз', 'удар магическим оружием: посох, жезл, скипетр, сфера', 'Тёмная стрела и Похищение души Некроманта, Тёмный луч Лича'],
    rec: 'a',
    why: 'Хор с закрытым ртом — голос Склепа и Болот, магия звучит как мрак, а не как фокус; «Стекло» светлее и легче.',
    variants: [
      {
        key: 'a',
        title: 'Тень',
        note: 'Короткий хор «у» на квинте, стекло из-под ноты, свист полёта и тёмный хлопок попадания.',
        hit: 0.33,
        room: HALL,
        take: (s) => {
          s.note(0, CHOIR_HUM, 'D3+A3', 0.25, { vel: 0.8, pan: -0.3, rev: 0.5 });
          s.note(0, GLASS_RISE, 'D5', 0.25, { vel: 0.5, pan: -0.3, rev: 0.4 });
          s.gen(0, whoosh({ dur: 0.36, f0: 250, fPeak: 1600, f1: 900, q: 2, peak: 0.8 }), { vel: 0.35, pan: -0.3, panTo: 0.3, rev: 0.3 });
          s.gen(0.33, thud({ f0: 220, f1: 55, tau: 0.12 }), { vel: 0.8, pan: 0.3, rev: 0.35 });
          s.gen(0.33, chirp({ dur: 0.14, f0: 700, f1: 90 }), { vel: 0.4, pan: 0.3, rev: 0.35 });
          s.gen(0.33, burst({ lo: 150, hi: 1800, tau: 0.07 }), { vel: 0.55, pan: 0.3, rev: 0.35 });
        },
      },
      {
        key: 'b',
        title: 'Стекло',
        note: 'Стеклянный подъём к ля, тонкий свист и удар колокола с фригийским полутоном.',
        hit: 0.33,
        room: HALL,
        take: (s) => {
          s.gen(0, chirp({ dur: 0.3, f0: 500, f1: 1800, tri: true, attack: 0.05 }), { vel: 0.2, pan: -0.3, rev: 0.4 });
          s.note(0, GLASS_RISE, 'A5', 0.3, { vel: 0.6, pan: -0.3, rev: 0.45 });
          s.gen(0, whoosh({ dur: 0.34, f0: 1200, fPeak: 3000, q: 3 }), { vel: 0.2, pan: -0.3, panTo: 0.3 });
          s.note(0.33, BELL_SHORT, 'D5+Eb5', 0.3, { vel: 0.5, pan: 0.3, rev: 0.5 });
          s.gen(0.33, thud({ f0: 260, f1: 70, tau: 0.08 }), { vel: 0.6, pan: 0.3 });
          s.gen(0.33, burst({ lo: 1000, hi: 7000, tau: 0.025 }), { vel: 0.4, pan: 0.3 });
        },
      },
    ],
  },
  {
    id: 'fire',
    name: 'Огонь',
    group: 'magic',
    uses: ['Огненный шар, Огненная волна, Взрыв пламени, Испепеление', 'Пламя и Взрыв Огненного элементаля, Дыхание Древнего дракона'],
    rec: 'a',
    why: 'Шар со взрывом понятен в одиночном приёме и в волне по ряду; «Пламя» хорошо для дракона — его можно отдать дыханию отдельно.',
    variants: [
      {
        key: 'a',
        title: 'Шар',
        note: 'Вспышка, ревущий шар летит через поле, взрыв: удар воздуха, тёмный выдох, угли и раскат.',
        hit: 0.33,
        room: HALL,
        take: (s) => {
          s.gen(0, whoosh({ dur: 0.14, f0: 200, fPeak: 3000, f1: 1200, lp: true, peak: 0.4 }), { vel: 0.6, pan: -0.3, rev: 0.2 });
          s.gen(0, flame({ dur: 0.38, cut: 900, attack: 0.05, release: 0.08 }), { vel: 1.1, pan: -0.3, panTo: 0.3, rev: 0.25 });
          s.gen(0, crackle({ dur: 0.35, rate: 60, lo: 1500, hi: 6000 }), { vel: 0.6, pan: -0.3, panTo: 0.3 });
          blast(s, 0.33, 0.3, 0.9);
        },
      },
      {
        key: 'b',
        title: 'Пламя',
        note: 'Струя огня ревёт и трещит дольше, удар мягче — не взрыв, а поток.',
        hit: 0.33,
        room: HALL,
        take: (s) => {
          s.gen(0, flame({ dur: 0.75, cut: 600, attack: 0.12, release: 0.3 }), { vel: 0.8, pan: -0.3, panTo: 0.3, rev: 0.25 });
          s.gen(0, whoosh({ dur: 0.7, f0: 200, fPeak: 2500, f1: 800, peak: 0.4, lp: true }), { vel: 0.5, pan: -0.2, panTo: 0.3, rev: 0.25 });
          s.gen(0, crackle({ dur: 0.8, rate: 70, lo: 1500, hi: 7000 }), { vel: 0.45, pan: 0, panTo: 0.3 });
          s.gen(0.33, thud({ f0: 120, f1: 45, tau: 0.12, drive: 1 }), { vel: 0.55, pan: 0.3 });
          s.gen(0.33, rumble({ dur: 0.7, cut: 200, tau: 0.25 }), { vel: 0.35, pan: 0.3 });
        },
      },
    ],
  },
  {
    id: 'ice',
    name: 'Лёд',
    group: 'magic',
    uses: ['Ледяной осколок', 'удар по оцепеневшей цели (Раскол)'],
    variants: [
      {
        key: 'a',
        title: 'Осколок',
        note: 'Стальные язычки тритоном (ре — соль-диез), морозный свист, лёд разлетается со звоном и треском.',
        hit: 0.33,
        room: HALL,
        take: (s) => {
          s.note(0, I.MUSIC_BOX, 'D6', 0.3, { vel: 0.5, pan: -0.3, rev: 0.5 });
          s.note(0.05, I.MUSIC_BOX, 'G#6', 0.3, { vel: 0.45, pan: -0.2, rev: 0.5 });
          s.gen(0, whoosh({ dur: 0.34, f0: 2000, fPeak: 5000, f1: 3500, q: 3 }), { vel: 0.22, pan: -0.3, panTo: 0.3 });
          s.gen(0, hiss({ dur: 0.34, lo: 5000, hi: 10000, attack: 0.05, tau: 0.2 }), { vel: 0.1, pan: -0.3, panTo: 0.3 });
          s.gen(0.33, scatter({ n: 14, spread: 0.06, modes: GLASS_MODES, fVar: 0.35, decay: 0.85 }), { vel: 0.55, pan: 0.3, rev: 0.35 });
          s.gen(0.33, modal(ICE, { damp: 1.5 }), { vel: 0.35, pan: 0.3, rev: 0.4 });
          s.gen(0.33, crackle({ dur: 0.3, rate: 300, rateEnd: 30, lo: 3000, hi: 9000, q: 8, tau: 0.15 }), { vel: 0.5, pan: 0.3 });
          s.gen(0.33, thud({ f0: 320, f1: 120, tau: 0.03 }), { vel: 0.45, pan: 0.3 });
          s.gen(0.33, burst({ lo: 800, hi: 2600, tau: 0.035 }), { vel: 0.4, pan: 0.3 });
        },
      },
    ],
  },
  {
    id: 'bolt',
    name: 'Молния',
    group: 'magic',
    level: 1,
    uses: ['Цепная молния: разряд прыгает от цели к цели, потом гром'],
    variants: [
      {
        key: 'a',
        title: 'Гроза',
        note: 'Три треска разряда по ряду, сухой хлопок воздуха и раскатистый гром.',
        hit: 0.04,
        room: HALL,
        take: (s) => {
          s.gen(0, zap({ dur: 0.2 }), { vel: 0.8, pan: 0.1, rev: 0.3 });
          s.gen(0.07, zap({ dur: 0.16 }), { vel: 0.65, pan: 0.3, rev: 0.3 });
          s.gen(0.14, zap({ dur: 0.16 }), { vel: 0.55, pan: 0.5, rev: 0.3 });
          s.gen(0.01, burst({ lo: 1500, hi: 12000, tau: 0.025 }), { vel: 0.8, pan: 0.2, rev: 0.4 });
          s.gen(0.1, rumble({ dur: 1.8, cut: 140, attack: 0.12, tau: 0.55, wobble: 0.6 }), { vel: 0.8, pan: 0.2, rev: 0.4 });
        },
      },
    ],
  },
  {
    id: 'gunshot',
    name: 'Пистоль',
    group: 'magic',
    uses: ['Пистоль Проклятого капитана'],
    variants: [
      {
        key: 'a',
        title: 'Кремень',
        note: 'Щелчок кремня, вспышка на полке, выстрел с раскатом в трюме и удар пули.',
        hit: 0.33,
        room: HALL,
        take: (s) => {
          s.gen(0, modal(BONE, { scale: 2 }), { vel: 0.35, pan: 0.4 });
          s.gen(0.02, hiss({ dur: 0.06, lo: 2000, hi: 7000, attack: 0.002, tau: 0.02 }), { vel: 0.4, pan: 0.4 });
          s.gen(0.05, burst({ lo: 200, hi: 9000, tau: 0.025 }), { vel: 1, pan: 0.4, rev: 0.45 });
          s.gen(0.05, thud({ f0: 140, f1: 40, tau: 0.12, drive: 1.5 }), { vel: 0.9, pan: 0.4, rev: 0.4 });
          s.gen(0.05, crackle({ dur: 0.08, rate: 900, lo: 1500, hi: 6000 }), { vel: 0.3, pan: 0.4 });
          flesh(s, 0.33, -0.3, 0.6);
        },
      },
    ],
  },
  {
    id: 'cannon',
    name: 'Залп',
    group: 'magic',
    level: 1,
    uses: ['Бортовой залп Проклятого капитана', 'Залп с того света Призрака капитана'],
    variants: [
      {
        key: 'a',
        title: 'Бортом',
        note: 'Две пушки одна за другой, раскат над водой, ядро ломает доски у героя.',
        hit: 0.33,
        room: CHURCH,
        take: (s) => {
          s.gen(0, thud({ f0: 70, f1: 25, tau: 0.45, drive: 2.5 }), { vel: 1, pan: 0.5, rev: 0.4 });
          s.gen(0, burst({ lo: 60, hi: 900, tau: 0.15 }), { vel: 0.8, pan: 0.5, rev: 0.4 });
          s.gen(0, rumble({ dur: 2, cut: 120, attack: 0.02, tau: 0.6 }), { vel: 0.6, pan: 0.4, rev: 0.4 });
          s.gen(0.09, thud({ f0: 75, f1: 28, tau: 0.4, drive: 2 }), { vel: 0.75, pan: 0.7, rev: 0.4 });
          s.gen(0.33, thud({ f0: 100, f1: 35, tau: 0.2, drive: 1.5 }), { vel: 0.8, pan: -0.3 });
          s.gen(0.33, scatter({ n: 8, spread: 0.3, modes: WOOD, fVar: 0.3, decay: 0.85 }), { vel: 0.4, pan: -0.2, rev: 0.3 });
          s.gen(0.33, crackle({ dur: 0.3, rate: 400, lo: 800, hi: 3000 }), { vel: 0.3, pan: -0.3 });
        },
      },
    ],
  },
  {
    id: 'summon',
    name: 'Призыв',
    group: 'magic',
    uses: ['враг призывает: Поднять скелета, Поднять мёртвых, Икра, Зов пиявок, Вылупление, Выводок, Рой ос, Приказ, «Свистать всех наверх», Вой Вожака стаи', 'появление второго тела Лича и Капитана'],
    variants: [
      {
        key: 'a',
        title: 'Из-под земли',
        note: 'Гул растёт, хор «у» поднимается из-под квинты, свист вверх — и тяжёлый удар появления.',
        hit: 0.7,
        room: CHURCH,
        take: (s) => {
          s.gen(0, rumble({ dur: 1.1, cut: 120, attack: 0.5, tau: 0.4 }), { vel: 0.55, pan: 0.3 });
          s.note(0, CHOIR_RISE, 'D2+A2', 0.7, { vel: 0.9, pan: 0.3, rev: 0.55 });
          s.gen(0.1, whoosh({ dur: 0.7, f0: 150, fPeak: 1500, f1: 600, q: 0.9, peak: 0.85 }), { vel: 0.35, pan: 0.3, rev: 0.3 });
          s.gen(0.7, thud({ f0: 100, f1: 38, tau: 0.15, drive: 1 }), { vel: 0.75, pan: 0.3, rev: 0.3 });
          s.gen(0.7, burst({ lo: 100, hi: 1200, tau: 0.08 }), { vel: 0.4, pan: 0.3 });
        },
      },
    ],
  },
  {
    id: 'whistle',
    name: 'Волчий свисток',
    group: 'magic',
    uses: ['Волчий свисток: свист и волк отвечает воем'],
    variants: [
      {
        key: 'a',
        title: 'Зов',
        note: 'Свист в две ноты (ля — ре) и далёкий вой волка в ответ.',
        room: HALL,
        take: (s) => {
          s.note(0, WHISTLE, 'A5', 0.14, { vel: 0.8, pan: -0.3, rev: 0.3 });
          s.note(0.18, WHISTLE, 'D6', 0.32, { vel: 0.85, pan: -0.3, rev: 0.35 });
          s.gen(0.55, voice({ dur: 1.4, pitch: [[0, 330], [0.35, 500], [0.8, 470], [1, 380]], vowel: 'u', vowelTo: 'o', noise: 0.12, vib: 5, drive: 0.3, attack: 0.15, release: 0.4 }), { vel: 0.35, pan: 0.5, rev: 0.6 });
        },
      },
    ],
  },

  // ═══ Защита и поддержка ═══
  {
    id: 'block_up',
    name: 'Щит',
    group: 'defense',
    level: -2,
    uses: ['«Защититься»', 'Магический щит, Глухая оборона, Каменная кожа, Колючая броня, Насмешка', 'блок у врага: Блок, Панцирь, Костяная броня и т. п.'],
    rec: 'a',
    why: 'Лязг лат — тот же металл, что звенит в «Удар в щит», пара звучит как одно целое; «Оберег» стоит отдать Магическому щиту отдельно.',
    variants: [
      {
        key: 'a',
        title: 'Латы',
        note: 'Лязг доспеха, пластины оседают, низкий толчок «стены» и скрип ремней.',
        take: (s) => {
          s.gen(0, modal(ARMOR), { vel: 0.55, pan: -0.25, rev: 0.2 });
          s.gen(0.045, modal(ARMOR, { scale: 1.15 }), { vel: 0.35, pan: -0.3, rev: 0.2 });
          s.gen(0, thud({ f0: 150, f1: 70, tau: 0.05 }), { vel: 0.5, pan: -0.25 });
          s.note(0, SUB_THUMP, 'D2', 0.2, { vel: 0.6, pan: -0.25, rev: 0.1 });
          s.gen(0.02, crackle({ dur: 0.08, rate: 300, lo: 400, hi: 1500 }), { vel: 0.25, pan: -0.25 });
        },
      },
      {
        key: 'b',
        title: 'Дерево и железо',
        note: 'Деревянный щит с железным ободом: стук доски, низкий звон обода, толчок.',
        take: (s) => {
          s.gen(0, modal(WOOD), { vel: 0.7, pan: -0.25, rev: 0.2 });
          s.gen(0, modal(STEEL, { scale: 0.55, damp: 1.3 }), { vel: 0.25, pan: -0.25, rev: 0.2 });
          s.gen(0, thud({ f0: 140, f1: 60, tau: 0.07 }), { vel: 0.6, pan: -0.25 });
          s.gen(0, burst({ lo: 150, hi: 900, tau: 0.03 }), { vel: 0.4, pan: -0.25 });
        },
      },
      {
        key: 'c',
        title: 'Оберег',
        note: 'Короткий хор «о» на квинте, стекло и тихий лязг — магическая стена.',
        room: HALL,
        take: (s) => {
          s.note(0, CHOIR_STAB, 'D3+A3', 0.3, { vel: 0.8, pan: -0.25, rev: 0.55 });
          s.note(0, { ...GLASS_SHORT, env: { a: 0.005, d: 0.6, s: 0.3, r: 0.5 } }, 'D5', 0.3, { vel: 0.4, pan: -0.25, rev: 0.5 });
          s.gen(0, modal(ARMOR, { damp: 1.3 }), { vel: 0.3, pan: -0.25 });
          s.gen(0, whoosh({ dur: 0.3, f0: 200, fPeak: 900, lp: true }), { vel: 0.3, pan: -0.25 });
        },
      },
    ],
  },
  {
    id: 'block_hit',
    name: 'Удар в щит',
    group: 'defense',
    uses: ['удар погас о блок (герой или враг) — латы звенят', 'сюда же — Ответный удар до своего удара клинком'],
    rec: 'a',
    why: 'Гул щита держится чуть дольше удара и сразу говорит «не прошло»; «Глухо» легко спутать с попаданием.',
    variants: [
      {
        key: 'a',
        title: 'Звон',
        note: 'Щит гудит низкими модами, удар и шорох железа — «держу».',
        take: (s) => {
          s.gen(0, modal(SHIELD), { vel: 0.6, pan: -0.25, rev: 0.3 });
          s.gen(0, thud({ f0: 170, f1: 60, tau: 0.06 }), { vel: 0.75, pan: -0.25 });
          s.gen(0, burst({ lo: 600, hi: 4000, tau: 0.015 }), { vel: 0.5, pan: -0.25 });
          s.gen(0, modal(ARMOR, { scale: 1.3, damp: 1.5 }), { vel: 0.25, pan: -0.25 });
        },
      },
      {
        key: 'b',
        title: 'Глухо',
        note: 'Тяжёлый удар в доску щита, железо под ней — коротко, без звона.',
        take: (s) => {
          s.gen(0, modal(WOOD, { scale: 0.8 }), { vel: 0.7, pan: -0.25 });
          s.gen(0, thud({ f0: 120, f1: 45, tau: 0.1, drive: 1 }), { vel: 0.9, pan: -0.25 });
          s.gen(0, modal(ARMOR, { scale: 0.8, damp: 2 }), { vel: 0.3, pan: -0.25 });
          s.gen(0, burst({ lo: 100, hi: 800, tau: 0.04 }), { vel: 0.5, pan: -0.25 });
        },
      },
    ],
  },
  {
    id: 'block_break',
    name: 'Блок пробит',
    group: 'defense',
    uses: ['удар снёс весь блок и прошёл дальше (латы ломаются)', 'Пролом щита по врагу'],
    variants: [
      {
        key: 'a',
        title: 'Слом',
        note: 'Лязг, треск металла, обломки лат сыплются на землю.',
        take: (s) => {
          s.gen(0, modal(ARMOR, { scale: 0.9 }), { vel: 0.7, pan: -0.25, rev: 0.2 });
          s.gen(0, crackle({ dur: 0.07, rate: 2500, lo: 1000, hi: 5000 }), { vel: 0.7, pan: -0.25 });
          s.gen(0, thud({ f0: 130, f1: 45, tau: 0.1, drive: 1 }), { vel: 0.8, pan: -0.25 });
          s.gen(0, burst({ lo: 1000, hi: 6000, tau: 0.02 }), { vel: 0.5, pan: -0.25 });
          s.gen(0.05, scatter({ n: 6, spread: 0.4, modes: SHARDS, fVar: 0.25, decay: 0.8 }), { vel: 0.4, pan: -0.4, rev: 0.2 });
        },
      },
    ],
  },
  {
    id: 'heal',
    name: 'Лечение',
    group: 'defense',
    uses: ['Лечение, Травяной отвар, лечение Молота света, Ореол возмездия', 'лечение врага: Знахарство, Зелье ведьмы, Регенерация тролля, Ром пирата и т. п.', 'Целебные травы после боя, лечение у торговца'],
    rec: 'a',
    why: 'Арфа в ре миноре с девятой ступенью — тепло, но не светло, и коротко: не устаёт на частом лечении. «Хор» торжественнее, «Родник» — для зелий и отваров.',
    variants: [
      {
        key: 'a',
        title: 'Арфа',
        note: 'Арфа вверх по ре минору с девятой (ре — фа — ля — ми), под ней хор «о» и стекло.',
        hit: 0.15,
        room: HALL,
        take: (s) => {
          s.arp(0, I.HARP, 'D4 F4 A4 E5', 0.07, 0.7, { vel: 0.8, pan: -0.2, rev: 0.5 });
          s.note(0.05, CHOIR_SOFT, 'D4+A4', 0.6, { vel: 0.7, pan: -0.25, rev: 0.55 });
          s.note(0.2, GLASS_SHORT, 'A5', 0.5, { vel: 0.3, pan: -0.25, rev: 0.5 });
        },
      },
      {
        key: 'b',
        title: 'Хор',
        note: 'Хор «о» набирает минорный аккорд, сверху колокольчик челесты.',
        hit: 0.2,
        room: CHURCH,
        take: (s) => {
          s.note(0, { ...CHOIR_SOFT, env: { a: 0.18, d: 0.6, s: 0.85, r: 0.8 } }, 'D3+F3+A3', 0.7, { vel: 0.9, pan: -0.25, rev: 0.55 });
          s.note(0.25, I.CELESTA, 'A5', 0.5, { vel: 0.35, pan: -0.2, rev: 0.5 });
          s.gen(0, whoosh({ dur: 0.6, f0: 300, fPeak: 1500, lp: true }), { vel: 0.2, pan: -0.25 });
        },
      },
      {
        key: 'c',
        title: 'Родник',
        note: 'Тихое журчание, арфа вниз от ля и стекло на квинте — вода и травы.',
        hit: 0.1,
        room: HALL,
        take: (s) => {
          s.gen(0, bubbles({ dur: 0.5, rate: 30, lo: 900, hi: 2200, tau: 0.025 }), { vel: 0.3, pan: -0.25, rev: 0.3 });
          s.arp(0.02, I.HARP, 'A4 D5 F5', 0.1, 0.6, { vel: 0.65, pan: -0.2, rev: 0.5 });
          s.note(0.05, GLASS_SHORT, 'D5+A5', 0.6, { vel: 0.4, pan: -0.25, rev: 0.5 });
        },
      },
    ],
  },
  {
    id: 'buff',
    name: 'Усиление',
    group: 'defense',
    uses: ['бафы на себя: Ярость, Эхо удара, Верный глаз, Второе дыхание, Адреналин, Ореол возмездия, Уклонение', 'Зелье силы, Зелье бодрости, Зелье маны — после глотка', 'усиление врагов без воя: Прицел, Жертва, Благословение огня, Феромоны, Приказ, шипы и уворот на себя'],
    rec: 'a',
    why: 'Жар снизу и сердце — сила приходит изнутри, это ближе к бою; «Хор» красивее, но повторяет звук Лечения.',
    variants: [
      {
        key: 'a',
        title: 'Жар',
        note: 'Саб поднимается на квинту, удар сердца, выдох вверх и короткий мужской распев на квинте.',
        hit: 0.45,
        take: (s) => {
          s.note(0, SUB_RISE, 'D2', 0.45, { vel: 1, pan: -0.25, rev: 0.1 });
          s.gen(0, whoosh({ dur: 0.5, f0: 150, fPeak: 1500, f1: 600, peak: 0.85, lp: true }), { vel: 0.45, pan: -0.25 });
          s.drum(0, 'v', { vel: 0.4, pan: -0.25 });
          s.gen(0.45, thud({ f0: 120, f1: 55, tau: 0.07 }), { vel: 0.6, pan: -0.25 });
          s.note(0.42, CHANT_STAB, 'D3+A3', 0.25, { vel: 0.8, pan: -0.25, rev: 0.4 });
        },
      },
      {
        key: 'b',
        title: 'Хор',
        note: 'Хор «а» нарастает на ре, тайко и колокол на пике.',
        hit: 0.45,
        room: HALL,
        take: (s) => {
          s.note(0, CHOIR_SWELL, 'D3+A3+D4', 0.5, { vel: 0.9, pan: -0.25, rev: 0.5 });
          s.drum(0.45, 'K', { vel: 0.45, pan: -0.2, rev: 0.3 });
          s.note(0.45, BELL_SHORT, 'D4', 0.3, { vel: 0.35, pan: -0.2, rev: 0.5 });
        },
      },
    ],
  },
  {
    id: 'war_cry',
    name: 'Рёв',
    group: 'defense',
    uses: ['Боевой клич'],
    variants: [
      {
        key: 'a',
        title: 'Клич',
        note: 'Надрывный рёв «а-а» с телом октавой ниже, тайко, цепи и гул.',
        hit: 0.25,
        room: HALL,
        take: (s) => {
          s.gen(0, voice({ dur: 0.95, pitch: [[0, 100], [0.25, 128], [1, 82]], vowel: 'a', size: 0.9, noise: 0.35, drive: 2.5, attack: 0.05, release: 0.3 }), { vel: 0.8, pan: -0.25, rev: 0.4 });
          s.gen(0, voice({ dur: 0.95, pitch: [[0, 50], [0.25, 64], [1, 41]], vowel: 'o', size: 0.7, noise: 0.45, drive: 3, attack: 0.05, release: 0.3 }), { vel: 0.4, pan: -0.25, rev: 0.35 });
          s.drum(0.05, 'K', { vel: 0.6, pan: -0.2, rev: 0.3 });
          s.drum(0.15, 'z', { vel: 0.35, pan: -0.4 });
          s.gen(0, rumble({ dur: 0.9, cut: 150 }), { vel: 0.25, pan: -0.25 });
        },
      },
    ],
  },
  {
    id: 'smoke',
    name: 'Дым',
    group: 'defense',
    uses: ['Дымовая шашка (Исчезновение Ассасина)'],
    variants: [
      {
        key: 'a',
        title: 'Шашка',
        note: 'Хлопок шашки, долгое шипение дыма и тихий свист — герой растворился.',
        hit: 0.05,
        take: (s) => {
          s.gen(0, thud({ f0: 220, f1: 90, tau: 0.04 }), { vel: 0.55, pan: -0.25 });
          s.gen(0, burst({ lo: 300, hi: 6000, tau: 0.03 }), { vel: 0.6, pan: -0.25 });
          s.gen(0.02, hiss({ dur: 1.2, lo: 1200, hi: 7000, attack: 0.06, tau: 0.45, flutter: 0.4 }), { vel: 0.4, pan: -0.25, rev: 0.3 });
          s.gen(0.05, whoosh({ dur: 0.7, f0: 180, fPeak: 700, f1: 300, q: 0.7 }), { vel: 0.35, pan: -0.4, panTo: 0, rev: 0.3 });
        },
      },
    ],
  },
  {
    id: 'drink',
    name: 'Глоток',
    group: 'defense',
    level: -2,
    uses: ['выпить зелье из слота (лечение, сила, бодрость, мана, Каменная кожа, Противоядие)'],
    variants: [
      {
        key: 'a',
        title: 'Пробка',
        note: 'Пробка, три глотка с бульканьем и звон пустой склянки.',
        room: CLOSE,
        take: (s) => {
          s.gen(0, chirp({ dur: 0.04, f0: 900, f1: 260 }), { vel: 0.5, pan: -0.25 });
          s.gen(0, burst({ lo: 1000, hi: 5000, tau: 0.004 }), { vel: 0.4, pan: -0.25 });
          for (const at of [0.15, 0.38, 0.6]) {
            s.gen(at, bubbles({ dur: 0.12, rate: 140, lo: 150, hi: 380, tau: 0.03, rise: 3 }), { vel: 0.55, pan: -0.25 });
            s.gen(at, thud({ f0: 110, f1: 70, tau: 0.04, click: 0.1 }), { vel: 0.35, pan: -0.25 });
          }
          s.gen(0.82, modal(GLASS_MODES, { scale: 0.9, damp: 1.5 }), { vel: 0.3, pan: -0.25, rev: 0.3 });
        },
      },
    ],
  },
  {
    id: 'enchant',
    name: 'Заточка',
    group: 'defense',
    uses: ['Стихийная заточка'],
    variants: [
      {
        key: 'a',
        title: 'Брусок',
        note: 'Два прохода точильного бруска по клинку, искры и долгий звон стали.',
        hit: 0.72,
        take: (s) => {
          s.gen(0, scrape({ dur: 0.32, f0: 2600, f1: 4200, q: 22, grit: 0.6 }), { vel: 0.55, pan: -0.2 });
          s.gen(0.38, scrape({ dur: 0.32, f0: 2800, f1: 4600, q: 22, grit: 0.6 }), { vel: 0.6, pan: -0.3 });
          s.gen(0.72, modal(STEEL, { damp: 0.3 }), { vel: 0.35, pan: -0.25, rev: 0.45 });
          s.note(0.72, GLASS_SHORT, 'D6', 0.4, { vel: 0.35, pan: -0.25, rev: 0.5 });
          s.gen(0.72, crackle({ dur: 0.2, rate: 120, lo: 3000, hi: 8000 }), { vel: 0.25, pan: -0.25 });
        },
      },
    ],
  },
  {
    id: 'smite',
    name: 'Свет',
    group: 'defense',
    uses: ['Молот света, Кара'],
    variants: [
      {
        key: 'a',
        title: 'Колокол',
        note: 'Тяжёлый взмах, удар молота, церковный колокол на ре и хор аккордом — святая кара.',
        hit: 0.15,
        room: CHURCH,
        take: (s) => {
          s.gen(0, whoosh({ dur: 0.17, f0: 220, fPeak: 1200, f1: 400, q: 1 }), { vel: 0.6, pan: -0.25, panTo: 0.2 });
          s.gen(0.15, thud({ f0: 110, f1: 40, tau: 0.15, drive: 1.3 }), { vel: 0.9, pan: 0.2, rev: 0.25 });
          s.gen(0.15, modal(ARMOR, { damp: 1.2 }), { vel: 0.35, pan: 0.2 });
          s.note(0.15, BELL_SHORT, 'D4', 0.6, { vel: 0.6, pan: 0.1, rev: 0.5 });
          s.note(0.14, CHOIR_STAB, 'D3+A3+D4', 0.45, { vel: 0.8, pan: 0, rev: 0.6 });
        },
      },
    ],
  },

  // ═══ Раны и состояния ═══
  {
    id: 'bleed',
    name: 'Кровь',
    group: 'status',
    level: -2,
    uses: ['наложено Кровотечение (Кровопускание, Крюк-кошка, дротики, Кровавая баня, когти врагов)', 'Вскрытие — взрыв ран', 'Жертва на алтаре (вместе со звуком жертвы)'],
    variants: [
      {
        key: 'a',
        title: 'Брызги',
        note: 'Мокрый всплеск, шлепок и две капли.',
        take: (s) => {
          s.gen(0, squelch({ dur: 0.13, f0: 2600, f1: 260, q: 3 }), { vel: 0.75 });
          s.gen(0, burst({ lo: 400, hi: 1600, tau: 0.05 }), { vel: 0.5 });
          s.gen(0, thud({ f0: 120, f1: 60, tau: 0.05 }), { vel: 0.35 });
          s.drum(0.2, 'd', { vel: 1, pan: 0.2 });
          s.drum(0.34, 'd', { vel: 0.75, pan: 0.15 });
        },
      },
    ],
  },
  {
    id: 'burn',
    name: 'Горение',
    group: 'status',
    level: -2,
    uses: ['наложено Горение (Огненный шар, Огненная волна, Тлеющий клинок, Горение врагов)', 'Испепеление и Раздуть'],
    variants: [
      {
        key: 'a',
        title: 'Вспыхнуть',
        note: 'Огонь схватывается с выдохом, ревёт и трещит, затихая.',
        take: (s) => {
          s.gen(0, whoosh({ dur: 0.28, f0: 200, fPeak: 2800, f1: 900, peak: 0.35, lp: true }), { vel: 0.6 });
          s.gen(0.05, flame({ dur: 0.7, cut: 800, attack: 0.05, release: 0.4 }), { vel: 0.4 });
          s.gen(0.03, crackle({ dur: 0.8, rate: 70, rateEnd: 15, lo: 1500, hi: 6500 }), { vel: 0.5 });
        },
      },
    ],
  },
  {
    id: 'poison',
    name: 'Яд',
    group: 'status',
    level: -2,
    uses: ['наложен Яд (Флакон яда, Отравленный клинок, Яд врагов)', 'Заражение, Катализатор', 'наложен Распад (гниль)'],
    variants: [
      {
        key: 'a',
        title: 'Отрава',
        note: 'Бульканье и утробное чавканье, шипение и тошнотворный плывущий тон.',
        take: (s) => {
          s.gen(0, bubbles({ dur: 0.6, rate: 45, lo: 220, hi: 700, tau: 0.04 }), { vel: 0.6 });
          s.gen(0, squelch({ dur: 0.25, f0: 900, f1: 150, q: 4 }), { vel: 0.35 });
          s.gen(0.05, hiss({ dur: 0.6, lo: 3000, hi: 7000, attack: 0.05, tau: 0.2, flutter: 0.6 }), { vel: 0.15 });
          s.note(0.05, SICK, 'G#4', 0.35, { vel: 0.3, rev: 0.4 });
        },
      },
    ],
  },
  {
    id: 'stun',
    name: 'Оглушение',
    group: 'status',
    level: -2,
    uses: ['наложено Оглушение (Оглушающий удар, праща по криту)', 'оглушённый враг пропускает ход'],
    variants: [
      {
        key: 'a',
        title: 'Звон в ушах',
        note: 'Удар, гул в голове, писк в ушах и три звезды-язычка тритоном.',
        room: HALL,
        take: (s) => {
          s.gen(0, thud({ f0: 130, f1: 50, tau: 0.07 }), { vel: 0.6 });
          s.gen(0, modal(SHIELD, { scale: 1.7, damp: 1.3 }), { vel: 0.4, rev: 0.4 });
          s.gen(0.02, chirp({ dur: 1, f0: 3600, f1: 3400, attack: 0.06, trem: 9 }), { vel: 0.12, rev: 0.3 });
          s.note(0.12, I.MUSIC_BOX, 'A6', 0.2, { vel: 0.3, pan: 0.1, rev: 0.5 });
          s.note(0.24, I.MUSIC_BOX, 'D7', 0.2, { vel: 0.25, pan: 0.3, rev: 0.5 });
          s.note(0.36, I.MUSIC_BOX, 'G#6', 0.2, { vel: 0.3, pan: -0.1, rev: 0.5 });
        },
      },
    ],
  },
  {
    id: 'cold',
    name: 'Холод',
    group: 'status',
    level: -3,
    uses: ['наложен Холод (Ледяной осколок, Подсечный выстрел, Дождь из стрел, Сглаз, Ловчая сеть, Ледяной клинок)'],
    variants: [
      {
        key: 'a',
        title: 'Иней',
        note: 'Иней ползёт частым звонким треском, холодный выдох и стекло на квинте.',
        room: HALL,
        take: (s) => {
          s.gen(0, crackle({ dur: 0.55, rate: 150, rateEnd: 400, lo: 3500, hi: 9000, q: 9, tau: 0.4, attack: 0.1 }), { vel: 0.45 });
          s.gen(0, whoosh({ dur: 0.6, f0: 6000, fPeak: 4500, f1: 2500, q: 2, peak: 0.3 }), { vel: 0.22 });
          s.note(0.05, GLASS_SHORT, 'D6+A6', 0.5, { vel: 0.3, rev: 0.55 });
        },
      },
    ],
  },
  {
    id: 'freeze',
    name: 'Оцепенение',
    group: 'status',
    uses: ['Холод дошёл до порога — враг скован льдом'],
    variants: [
      {
        key: 'a',
        title: 'Сковать',
        note: 'Треск льда, глухой толчок, глыба гудит стеклом и стонет, иней осыпается.',
        room: HALL,
        take: (s) => {
          s.gen(0, crackle({ dur: 0.09, rate: 3000, lo: 1500, hi: 7000, q: 5 }), { vel: 0.85 });
          s.gen(0, thud({ f0: 260, f1: 90, tau: 0.05 }), { vel: 0.55 });
          s.gen(0, modal(ICE), { vel: 0.4, rev: 0.45 });
          s.gen(0.05, chirp({ dur: 0.5, f0: 190, f1: 120, tri: true }), { vel: 0.15 });
          s.gen(0.1, crackle({ dur: 0.6, rate: 120, rateEnd: 20, lo: 3000, hi: 8000, q: 8 }), { vel: 0.3 });
        },
      },
    ],
  },
  {
    id: 'curse',
    name: 'Проклятие',
    group: 'status',
    level: -2,
    uses: ['дебафы: Слабость, Уязвимость, Изнурение (с врага на героя и с героя на врага)', 'Сглаз, Насмешка врага, Порча'],
    variants: [
      {
        key: 'a',
        title: 'Вздох',
        note: 'Хор «у» съезжает вниз, струнные тритоном (ре — соль-диез) и тёмный выдох.',
        room: HALL,
        take: (s) => {
          s.note(0, CHOIR_FALL, 'A3+D4', 0.5, { vel: 0.9, rev: 0.55 });
          s.note(0.02, STRING_STAB, 'D3+G#3', 0.35, { vel: 0.6, rev: 0.45 });
          s.gen(0, whoosh({ dur: 0.45, f0: 300, fPeak: 1200, f1: 150, peak: 0.75, lp: true }), { vel: 0.3 });
        },
      },
    ],
  },
  {
    id: 'wound_tick',
    name: 'Тик раны',
    group: 'status',
    level: -7,
    uses: ['раны бьют в начале хода (кровь, горение, яд) — тихо, один раз на бойца'],
    variants: [
      {
        key: 'a',
        title: 'Пульс',
        note: 'Один глухой удар пульса и мокрый призвук.',
        room: CLOSE,
        take: (s) => {
          s.gen(0, thud({ f0: 95, f1: 60, tau: 0.08, click: 0.1 }), { vel: 0.6 });
          s.gen(0, squelch({ dur: 0.08, f0: 1200, f1: 300 }), { vel: 0.15 });
        },
      },
    ],
  },
  {
    id: 'thorns',
    name: 'Шипы',
    group: 'status',
    level: -3,
    uses: ['шипы ранят того, кто ударил (Шипы, Колючая броня, Ореол, шипы врагов)'],
    variants: [
      {
        key: 'a',
        title: 'Уколы',
        note: 'Три коротких металлических укола и тычок.',
        room: CLOSE,
        take: (s) => {
          [0, 0.025, 0.05].forEach((at, i) => s.gen(at, modal(STEEL, { scale: [1.4, 1.55, 1.3][i], damp: 3 }), { vel: 0.4, pan: 0.25 }));
          s.gen(0.02, burst({ lo: 800, hi: 4000, tau: 0.01 }), { vel: 0.35, pan: 0.25 });
          s.gen(0, thud({ f0: 160, f1: 80, tau: 0.03 }), { vel: 0.35, pan: 0.25 });
        },
      },
    ],
  },

  // ═══ Урон и гибель ═══
  {
    id: 'hurt_hero',
    name: 'Герой ранен',
    group: 'harm',
    uses: ['удар по герою прошёл в HP (поверх звука удара врага)', 'Ярость — рана себе'],
    rec: 'a',
    why: 'Короткий хрип делает героя живым и отличает его урон от урона врагов; если голос надоест — B без голоса.',
    variants: [
      {
        key: 'a',
        title: 'Хрип',
        note: 'Удар по доспеху, шлепок и короткий хрип «э».',
        take: (s) => {
          s.gen(0, thud({ f0: 150, f1: 55, tau: 0.1 }), { vel: 0.85, pan: -0.25 });
          s.gen(0, burst({ lo: 250, hi: 1400, tau: 0.03 }), { vel: 0.6, pan: -0.25 });
          s.gen(0, modal(ARMOR, { scale: 0.85, damp: 2 }), { vel: 0.25, pan: -0.25 });
          s.gen(0.03, voice({ dur: 0.24, pitch: [[0, 150], [1, 108]], vowel: 'e', size: 0.95, noise: 0.35, drive: 1, attack: 0.01, release: 0.1 }), { vel: 0.5, pan: -0.25, rev: 0.25 });
        },
      },
      {
        key: 'b',
        title: 'Без голоса',
        note: 'Тяжёлый удар, тайко под ним и дребезг лат.',
        take: (s) => {
          s.gen(0, thud({ f0: 140, f1: 50, tau: 0.12, drive: 1 }), { vel: 0.9, pan: -0.25 });
          s.drum(0, 'K', { vel: 0.25, pan: -0.2 });
          s.gen(0, modal(ARMOR, { scale: 0.85, damp: 1.5 }), { vel: 0.35, pan: -0.25 });
          s.gen(0.02, scatter({ n: 3, spread: 0.12, modes: SHARDS, fVar: 0.2, decay: 0.7 }), { vel: 0.25, pan: -0.3 });
          s.gen(0, burst({ lo: 150, hi: 1000, tau: 0.04 }), { vel: 0.5, pan: -0.25 });
        },
      },
    ],
  },
  {
    id: 'enemy_strike',
    name: 'Удар врага',
    group: 'harm',
    uses: ['удар рядового врага и элиты без своего снаряда: когти, клыки, дубины, жала', 'урон врагу от удара союзника-волка'],
    rec: 'a',
    why: 'Когти с рвущимся звуком — звериное, сразу отличается от стали героя; «Дубина» подойдёт гоблинам и големам, если захотим делить по врагам.',
    variants: [
      {
        key: 'a',
        title: 'Когти',
        note: 'Быстрый замах от врага к герою, рвущийся звук и удар по телу.',
        hit: 0.1,
        take: (s) => {
          s.gen(0, whoosh({ dur: 0.12, f0: 700, fPeak: 3200, f1: 1500, q: 1.5, peak: 0.75 }), { vel: 0.5, pan: 0.3, panTo: -0.2 });
          s.gen(0.1, hiss({ dur: 0.09, lo: 1000, hi: 5000, attack: 0.002, tau: 0.03, flutter: 0.9 }), { vel: 0.6, pan: -0.25 });
          flesh(s, 0.1, -0.25, 0.8);
        },
      },
      {
        key: 'b',
        title: 'Дубина',
        note: 'Тяжёлый низкий замах, удар с перегрузом и хруст.',
        hit: 0.14,
        take: (s) => {
          s.gen(0, whoosh({ dur: 0.17, f0: 220, fPeak: 1000, f1: 350, q: 0.9, peak: 0.8 }), { vel: 0.7, pan: 0.3, panTo: -0.2 });
          s.gen(0.14, thud({ f0: 110, f1: 40, tau: 0.13, drive: 1.5 }), { vel: 0.95, pan: -0.25 });
          s.gen(0.14, crackle({ dur: 0.05, rate: 1500, lo: 800, hi: 3000 }), { vel: 0.4, pan: -0.25 });
          s.gen(0.14, burst({ lo: 80, hi: 600, tau: 0.05 }), { vel: 0.5, pan: -0.25 });
        },
      },
    ],
  },
  {
    id: 'enemy_death',
    name: 'Гибель врага',
    group: 'harm',
    uses: ['враг погиб (рядовой и элита)', 'вор убит'],
    rec: 'a',
    why: 'Падение с последним хрипом — вес и конец; «Распад» красивее для нежити и духов, можно отдать Склепу.',
    variants: [
      {
        key: 'a',
        title: 'Падение',
        note: 'Предсмертный выдох, тело падает, сыплются обломки, отскок.',
        hit: 0.12,
        take: (s) => {
          s.gen(0, voice({ dur: 0.45, pitch: [[0, 120], [1, 70]], vowel: 'a', size: 0.8, noise: 0.7, drive: 0.5, attack: 0.02, release: 0.3 }), { vel: 0.35, pan: 0.3, rev: 0.3 });
          s.gen(0.12, thud({ f0: 95, f1: 35, tau: 0.2, drive: 1 }), { vel: 0.9, pan: 0.3, rev: 0.2 });
          s.gen(0.12, burst({ lo: 60, hi: 800, tau: 0.08 }), { vel: 0.6, pan: 0.3 });
          s.gen(0.13, crackle({ dur: 0.15, rate: 300, lo: 700, hi: 3000 }), { vel: 0.35, pan: 0.3 });
          s.gen(0.27, thud({ f0: 80, f1: 40, tau: 0.1 }), { vel: 0.4, pan: 0.3 });
        },
      },
      {
        key: 'b',
        title: 'Распад',
        note: 'Тело рассыпается свистом вниз, хор «у» съезжает, пепел оседает.',
        hit: 0.05,
        room: HALL,
        take: (s) => {
          s.gen(0, whoosh({ dur: 0.8, f0: 3500, fPeak: 2500, f1: 200, peak: 0.15, q: 1 }), { vel: 0.5, pan: 0.3, rev: 0.4 });
          s.note(0, { ...CHOIR_FALL, bend: { semis: 5, time: 0.6 } }, 'D3+A3', 0.6, { vel: 0.6, pan: 0.3, rev: 0.55 });
          s.gen(0.05, thud({ f0: 100, f1: 40, tau: 0.12 }), { vel: 0.6, pan: 0.3 });
          s.gen(0.1, crackle({ dur: 0.5, rate: 200, rateEnd: 20, lo: 1500, hi: 6000 }), { vel: 0.3, pan: 0.3 });
        },
      },
    ],
  },
  {
    id: 'boss_death',
    name: 'Гибель босса',
    group: 'harm',
    level: 3,
    uses: ['босс погиб (без второго тела)'],
    variants: [
      {
        key: 'a',
        title: 'Падение',
        note: 'Предсмертный рёв, гонг и гром, огромный удар тела, медь тритоном, хор съезжает вниз.',
        hit: 0.1,
        room: CHURCH,
        take: (s) => {
          s.gen(0, voice({ dur: 1.2, pitch: [[0, 90], [0.3, 110], [1, 45]], vowel: 'a', size: 0.75, noise: 0.5, drive: 2, attack: 0.04, release: 0.4 }), { vel: 0.5, pan: 0.3, rev: 0.45 });
          s.drum(0, 'N', { vel: 0.6, cut: 3.2 });
          s.drum(0, 'q', { vel: 0.5, cut: 3 });
          s.gen(0.1, thud({ f0: 60, f1: 25, tau: 0.5, drive: 2 }), { vel: 1, pan: 0.3, rev: 0.3 });
          s.note(0, BRASS_STAB, 'D2+G#2', 0.6, { vel: 0.9, rev: 0.4 });
          s.note(0.2, CHOIR_DESCEND, 'D3+A3+D4', 1.3, { vel: 0.8, rev: 0.6 });
          s.gen(0.15, crackle({ dur: 0.8, rate: 250, rateEnd: 15, lo: 600, hi: 4000 }), { vel: 0.4, pan: 0.3 });
        },
      },
    ],
  },
  {
    id: 'hero_death',
    name: 'Гибель героя',
    group: 'harm',
    level: 2,
    uses: ['герой погиб — перед плашкой гибели'],
    variants: [
      {
        key: 'a',
        title: 'Колокол',
        note: 'Удар сердца, последний вздох, латы сыплются, тело падает; погребальный колокол и хор вниз.',
        hit: 0.35,
        room: CHURCH,
        take: (s) => {
          s.drum(0, 'v', { vel: 0.35, pan: -0.25 });
          s.gen(0.05, voice({ dur: 0.4, pitch: [[0, 140], [1, 90]], vowel: 'o', noise: 0.6, attack: 0.03, release: 0.25 }), { vel: 0.35, pan: -0.25, rev: 0.4 });
          s.gen(0.3, scatter({ n: 5, spread: 0.35, modes: ARMOR, fVar: 0.15, decay: 0.7 }), { vel: 0.45, pan: -0.3, rev: 0.25 });
          s.gen(0.35, thud({ f0: 85, f1: 30, tau: 0.25, drive: 1 }), { vel: 0.9, pan: -0.25, rev: 0.25 });
          s.note(0.7, KNELL, 'D3', 1.5, { vel: 0.6, rev: 0.55 });
          s.note(0.6, { ...CHOIR_DESCEND, formants: I.CHOIR_U.formants }, 'D3+F3', 1.2, { vel: 0.7, rev: 0.6 });
        },
      },
    ],
  },
  {
    id: 'explode',
    name: 'Взрыв',
    group: 'harm',
    level: 1,
    uses: ['самоподрыв: Имп-бомбардир, Пороховая мартышка'],
    variants: [
      {
        key: 'a',
        title: 'Порох',
        note: 'Шипит фитиль — и взрыв: удар воздуха, выдох, угли, обломки и раскат.',
        hit: 0.25,
        room: HALL,
        take: (s) => {
          s.gen(0, hiss({ dur: 0.28, lo: 2500, hi: 7000, attack: 0.01, tau: 0.2, flutter: 0.8 }), { vel: 0.3, pan: 0.3 });
          blast(s, 0.25, 0.1, 1);
          s.gen(0.25, scatter({ n: 6, spread: 0.5, modes: WOOD, fVar: 0.3, decay: 0.8 }), { vel: 0.3, pan: -0.1, rev: 0.3 });
        },
      },
    ],
  },

  // ═══ Приёмы врагов ═══
  {
    id: 'windup',
    name: 'Замах',
    group: 'enemy',
    level: -3,
    uses: ['враг готовит удар (ход без эффекта): Рыть копытом, Встаёт на дыбы, Заносит меч, Раскачивается, Раскаляется, Разбег, Зарядить пушку, Обвивает…'],
    variants: [
      {
        key: 'a',
        title: 'Натяг',
        note: 'Тремоло струнных фригийским полутоном (ре — ми-бемоль) нарастает, скрип и тяжёлый вдох воздуха — и обрывается.',
        take: (s) => {
          s.note(0, STRING_SWELL, 'D3+Eb3', 0.55, { vel: 0.7, pan: 0.35, rev: 0.3 });
          s.drum(0, 'n', { vel: 1.5, cut: 0.6, pan: 0.7 });
          s.gen(0, whoosh({ dur: 0.65, f0: 150, fPeak: 900, peak: 0.95, lp: true }), { vel: 0.3, pan: 0.35 });
        },
      },
    ],
  },
  {
    id: 'howl',
    name: 'Вой и рёв',
    group: 'enemy',
    uses: ['усиление зверей: Вой волка и Гончей ада, Рёв медведя, Минотавра и дракона, Ярость Вожака'],
    variants: [
      {
        key: 'a',
        title: 'Стая',
        note: 'Вой «у-о» вверх и вниз, второй голос на малую терцию выше вступает следом.',
        room: HALL,
        take: (s) => {
          s.gen(0, voice({ dur: 1.3, pitch: [[0, 290], [0.3, 440], [0.75, 410], [1, 330]], vowel: 'u', vowelTo: 'o', noise: 0.15, vib: 5, drive: 0.4, attack: 0.12, release: 0.35 }), { vel: 0.6, pan: 0.4, rev: 0.55 });
          s.gen(0.15, voice({ dur: 1.1, pitch: [[0, 345], [0.3, 523], [0.75, 488], [1, 392]], vowel: 'u', vowelTo: 'o', noise: 0.15, vib: 5.5, drive: 0.4, attack: 0.12, release: 0.35 }), { vel: 0.3, pan: 0.6, rev: 0.6 });
        },
      },
    ],
  },
  {
    id: 'steal',
    name: 'Кража',
    group: 'enemy',
    uses: ['Срезать кошель (Гном-деньгокрад)', 'Стянуть вещь (Гном-вещекрад)'],
    variants: [
      {
        key: 'a',
        title: 'Кошель',
        note: 'Рывок рукой, звон монет, мешок за пазуху и ухмылка вора.',
        take: (s) => {
          s.gen(0, whoosh({ dur: 0.1, f0: 900, fPeak: 3000, f1: 1500, q: 1.5 }), { vel: 0.45, pan: -0.3, panTo: 0.3 });
          s.gen(0.04, scatter({ n: 7, spread: 0.18, modes: COIN, fVar: 0.2, decay: 0.9 }), { vel: 0.5, pan: 0.1, rev: 0.2 });
          s.gen(0.22, thud({ f0: 180, f1: 90, tau: 0.03 }), { vel: 0.35, pan: 0.4 });
          snicker(s, 0.32, 0.45, 0.25);
        },
      },
    ],
  },
  {
    id: 'flee',
    name: 'Побег',
    group: 'enemy',
    uses: ['вор удирает с добычей (Дать дёру)'],
    variants: [
      {
        key: 'a',
        title: 'Дёру',
        note: 'Быстрые шаги уходят вправо, свист и далёкое «хи-хи».',
        take: (s) => {
          s.gen(0, steps({ n: 5, gap: 0.1, fade: 0.8, grit: 0.6 }), { vel: 0.6, pan: 0.3, panTo: 0.9 });
          s.gen(0.35, whoosh({ dur: 0.25, f0: 500, fPeak: 1600, q: 1 }), { vel: 0.35, pan: 0.6, panTo: 1 });
          snicker(s, 0.55, 0.9, 0.15);
        },
      },
    ],
  },
  {
    id: 'mana_drain',
    name: 'Вытягивание маны',
    group: 'enemy',
    level: -2,
    uses: ['враг выпивает ману героя: Стон, Выпить чары, Порча, Иссушение, Выпить свет, Песнь…'],
    variants: [
      {
        key: 'a',
        title: 'Иссушить',
        note: 'Стекло съезжает на октаву вниз, тон тонет, и воздух всасывает к врагу.',
        room: HALL,
        take: (s) => {
          s.note(0, GLASS_FALL, 'A5', 0.45, { vel: 0.7, pan: -0.25, rev: 0.5 });
          s.gen(0, chirp({ dur: 0.5, f0: 1600, f1: 250, attack: 0.02 }), { vel: 0.25, pan: -0.25, rev: 0.4 });
          s.gen(0, whoosh({ dur: 0.5, f0: 4000, fPeak: 2000, f1: 300, peak: 0.2, q: 2 }), { vel: 0.35, pan: -0.25, panTo: 0.35 });
        },
      },
    ],
  },
  {
    id: 'reveal',
    name: 'Прислушаться',
    group: 'enemy',
    level: -3,
    uses: ['враг снимает Скрытность героя: Чуткие нити, Нюх беса, Взять след, Морок видит, Зов песни, Нюх на крыс…'],
    variants: [
      {
        key: 'a',
        title: 'Учуять',
        note: 'Два вдоха носом, колокольчик и поворот в сторону героя.',
        take: (s) => {
          s.gen(0, hiss({ dur: 0.1, lo: 1500, hi: 4500, attack: 0.03, tau: 0.03 }), { vel: 0.4, pan: 0.35 });
          s.gen(0.13, hiss({ dur: 0.1, lo: 1500, hi: 4500, attack: 0.03, tau: 0.03 }), { vel: 0.45, pan: 0.35 });
          s.note(0.3, BELL_SHORT, 'A5', 0.25, { vel: 0.35, pan: 0.1, rev: 0.5 });
          s.gen(0.28, whoosh({ dur: 0.25, f0: 300, fPeak: 1300, q: 1 }), { vel: 0.25, pan: 0.35, panTo: -0.25 });
        },
      },
    ],
  },
  {
    id: 'phase',
    name: 'Вторая фаза',
    group: 'enemy',
    level: 3,
    uses: ['босс переходит во вторую фазу (вспышка и аура)'],
    variants: [
      {
        key: 'a',
        title: 'Пробуждение',
        note: 'Гонг и гром, два удара тайко, хор минорным аккордом, медь тритоном и рёв босса.',
        room: CHURCH,
        take: (s) => {
          s.drum(0, 'N', { vel: 0.7, cut: 3.2 });
          s.drum(0, 'q', { vel: 0.55, cut: 3 });
          s.drum(0, 'K', { vel: 0.7, pan: 0.2 });
          s.drum(0.28, 'K', { vel: 0.6, pan: 0.2 });
          s.note(0, CHOIR_SWELL, 'D3+A3+D4+F4', 1.2, { vel: 0.85, rev: 0.6 });
          s.note(0, BRASS_STAB, 'D2+G#2', 0.8, { vel: 0.9, rev: 0.4 });
          s.gen(0.05, voice({ dur: 1.1, pitch: [[0, 80], [0.3, 105], [1, 70]], vowel: 'a', size: 0.75, noise: 0.45, drive: 2.5, attack: 0.05, release: 0.35 }), { vel: 0.6, pan: 0.35, rev: 0.45 });
        },
      },
    ],
  },

  // ═══ Ход боя ═══
  {
    id: 'battle_start',
    name: 'Бой',
    group: 'turn',
    uses: ['начало боя и элиты (вход в клетку)', 'бой с вором'],
    rec: 'a',
    why: 'Тайко и медь — тот же язык, что барабаны Леса и Пещер, коротко и тяжело; «Рог» хорош, но на 20 боях за забег будет звучать как фанфара.',
    variants: [
      {
        key: 'a',
        title: 'Тайко',
        note: 'Два удара тайко с рамочным между ними, медь на квинте и цепи.',
        room: HALL,
        take: (s) => {
          s.drum(0, 'K', { vel: 0.9 });
          s.drum(0.11, 'F', { vel: 0.4 });
          s.drum(0.22, 'K', { vel: 0.75 });
          s.note(0.22, BRASS_STAB, 'D2+A2', 0.45, { vel: 0.9, rev: 0.4 });
          s.drum(0.3, 'z', { vel: 0.3 });
        },
      },
      {
        key: 'b',
        title: 'Рог',
        note: 'Рог зовёт снизу вверх (ля — ре), под второй нотой тайко.',
        room: HALL,
        take: (s) => {
          s.drum(0, 'F', { vel: 0.4 });
          s.note(0, HORN_CALL, 'A2', 0.3, { vel: 0.9, rev: 0.45 });
          s.note(0.32, HORN_CALL, 'D3', 0.7, { vel: 0.95, rev: 0.5 });
          s.drum(0.32, 'K', { vel: 0.6 });
        },
      },
    ],
  },
  {
    id: 'boss_start',
    name: 'Босс',
    group: 'turn',
    level: 2,
    uses: ['начало боя с боссом'],
    variants: [
      {
        key: 'a',
        title: 'Гонг',
        note: 'Гонг, три удара тайко, хор на квинте нарастает, медь тритоном и гул.',
        room: CHURCH,
        take: (s) => {
          s.drum(0, 'N', { vel: 0.6, cut: 3 });
          s.drum(0, 'K', { vel: 0.8 });
          s.drum(0.3, 'K', { vel: 0.7 });
          s.drum(0.6, 'K', { vel: 0.9 });
          s.note(0, CHOIR_SWELL, 'D3+A3', 1.3, { vel: 0.8, rev: 0.6 });
          s.note(0.6, BRASS_STAB, 'D2+G#2', 0.7, { vel: 1, rev: 0.45 });
          s.gen(0.5, rumble({ dur: 1.6, cut: 110, attack: 0.1, tau: 0.5 }), { vel: 0.4 });
        },
      },
    ],
  },
  {
    id: 'turn_start',
    name: 'Твой ход',
    group: 'turn',
    level: -6,
    uses: ['начало хода героя (после хода врагов)'],
    rec: 'b',
    why: 'Звучит каждый ход — двойной стук тише и не надоедает; колокол красивее, но на сотом ходу забега станет тиком часов.',
    variants: [
      {
        key: 'a',
        title: 'Колокол',
        note: 'Короткий колокол на ре и щипок контрабаса.',
        room: HALL,
        take: (s) => {
          s.note(0, BELL_TICK, 'D4', 0.2, { vel: 0.55, rev: 0.4 });
          s.note(0, I.PIZZ, 'D2', 0.2, { vel: 0.6, rev: 0.2 });
        },
      },
      {
        key: 'b',
        title: 'Стук',
        note: 'Рамочный барабан и костяной щелчок — «тук-тук».',
        take: (s) => {
          s.drum(0, 'F', { vel: 0.45 });
          s.drum(0.12, 'r', { vel: 0.7 });
        },
      },
    ],
  },
  {
    id: 'battle_win',
    name: 'Победа в бою',
    group: 'turn',
    level: 1,
    uses: ['последний враг пал — бой выигран (до экрана награды)', 'вор убит или сбежал — бой окончен'],
    rec: 'a',
    why: 'Хор с тайко на каденции си-бемоль — ля — ре минор: победа, но тёмная, не фанфара; «Струны» мягче и прозрачнее.',
    variants: [
      {
        key: 'a',
        title: 'Хор',
        note: 'Хор и тайко: си-бемоль мажор → ля мажор → ре минор, колокол на последнем аккорде.',
        room: HALL,
        take: (s) => {
          s.note(0, CHOIR_STAB, 'Bb2+F3+Bb3+D4', 0.3, { vel: 0.75, rev: 0.5 });
          s.note(0.32, CHOIR_STAB, 'A2+E3+A3+C#4', 0.3, { vel: 0.75, rev: 0.5 });
          s.note(0.64, CHOIR_STAB, 'D3+A3+D4+F4', 0.9, { vel: 0.8, rev: 0.55 });
          s.drum(0, 'K', { vel: 0.55 });
          s.drum(0.32, 'K', { vel: 0.55 });
          s.drum(0.64, 'K', { vel: 0.8 });
          s.note(0.64, BELL_SHORT, 'D4', 0.5, { vel: 0.5, rev: 0.5 });
        },
      },
      {
        key: 'b',
        title: 'Струны',
        note: 'Те же аккорды струнными, арфа рассыпает ре минор, литавра на ре.',
        room: HALL,
        take: (s) => {
          s.note(0, STRINGS_FAST, 'Bb2+F3+Bb3+D4', 0.3, { vel: 0.8, rev: 0.45 });
          s.note(0.32, STRINGS_FAST, 'A2+E3+A3+C#4', 0.3, { vel: 0.8, rev: 0.45 });
          s.note(0.64, STRINGS_FAST, 'D3+A3+D4+F4', 0.9, { vel: 0.85, rev: 0.5 });
          s.arp(0.64, I.HARP, 'D3 A3 D4 F4 A4', 0.06, 0.8, { vel: 0.6, rev: 0.5 });
          s.drum(0.64, 'D', { vel: 0.7 });
        },
      },
    ],
  },

  // ═══ Интерфейс и карта ═══
  {
    id: 'ui_click',
    name: 'Кнопка',
    group: 'ui',
    level: -10,
    uses: ['любая кнопка: «Конец хода», «Дальше», «Пропустить», меню, вкладки статистики, сложность'],
    rec: 'a',
    why: 'Сухая кость тише всех и в духе мира; дерево мягче, железо звонче — его лучше оставить защёлке сундука.',
    variants: [
      {
        key: 'a',
        title: 'Кость',
        note: 'Сухой щелчок кости.',
        room: CLOSE,
        take: (s) => {
          s.gen(0, modal(BONE), { vel: 0.7 });
          s.gen(0, burst({ lo: 2000, hi: 8000, tau: 0.002 }), { vel: 0.3 });
        },
      },
      {
        key: 'b',
        title: 'Дерево',
        note: 'Короткий стук по доске.',
        room: CLOSE,
        take: (s) => {
          s.gen(0, modal(WOOD, { scale: 2.4, damp: 2.5 }), { vel: 0.8 });
          s.gen(0, burst({ lo: 1500, hi: 6000, tau: 0.002 }), { vel: 0.25 });
        },
      },
      {
        key: 'c',
        title: 'Железо',
        note: 'Тонкий железный «тик», как защёлка.',
        room: CLOSE,
        take: (s) => {
          s.gen(0, modal([[2600, 0.03, 1], [4100, 0.02, 0.6], [6300, 0.012, 0.3]]), { vel: 0.6 });
          s.gen(0, modal(ARMOR, { scale: 1.5, damp: 3 }), { vel: 0.2 });
        },
      },
    ],
  },
  {
    id: 'ui_select',
    name: 'Выбор',
    group: 'ui',
    level: -8,
    uses: ['выбрать приём в бою (плитка, цифра), цель по Tab', 'выбрать пул награды, героя, черту, персональный артефакт, вкладку'],
    variants: [
      {
        key: 'a',
        title: 'Струна',
        note: 'Щипок лютни на ре и тихий щелчок.',
        room: CLOSE,
        take: (s) => {
          s.note(0, I.LUTE, 'D4', 0.15, { vel: 0.7, rev: 0.2 });
          s.gen(0, modal(BONE, { scale: 0.8 }), { vel: 0.3 });
        },
      },
    ],
  },
  {
    id: 'ui_deny',
    name: 'Нельзя',
    group: 'ui',
    level: -8,
    uses: ['клик по недоступному: нет стамины, перезарядка, «Только первый в ряду», не хватает золота'],
    variants: [
      {
        key: 'a',
        title: 'Тритон',
        note: 'Глухой щипок контрабаса тритоном (ре — соль-диез) и тычок.',
        room: CLOSE,
        take: (s) => {
          s.note(0, I.PIZZ, 'D2+G#2', 0.12, { vel: 0.8, rev: 0.15 });
          s.gen(0, thud({ f0: 110, f1: 70, tau: 0.05 }), { vel: 0.4 });
        },
      },
    ],
  },
  {
    id: 'ui_open',
    name: 'Пергамент',
    group: 'ui',
    level: -9,
    uses: ['открыть и закрыть оверлей: «Персонаж», «Пауза», «Лог боя», коллекция, бестиарий'],
    variants: [
      {
        key: 'a',
        title: 'Лист',
        note: 'Шорох пергамента и мягкий хлопок книги.',
        room: CLOSE,
        take: (s) => {
          s.gen(0, hiss({ dur: 0.25, lo: 1500, hi: 6000, attack: 0.03, tau: 0.08, flutter: 0.85 }), { vel: 0.6 });
          s.gen(0.15, thud({ f0: 140, f1: 90, tau: 0.03 }), { vel: 0.25 });
        },
      },
    ],
  },
  {
    id: 'step',
    name: 'Шаг',
    group: 'ui',
    level: -5,
    uses: ['«Войти» — шаг в следующую клетку карты'],
    variants: [
      {
        key: 'a',
        title: 'Гравий',
        note: 'Два шага по земле с гравием.',
        take: (s) => {
          s.gen(0, steps({ n: 2, gap: 0.3, grit: 0.6 }), { vel: 0.8, pan: -0.1, panTo: 0.1 });
        },
      },
    ],
  },

  // ═══ Добыча ═══
  {
    id: 'gold',
    name: 'Золото',
    group: 'loot',
    level: -4,
    uses: ['золото за бой, из сундука и с вора', 'отличная засечка замка (золото за неё)'],
    variants: [
      {
        key: 'a',
        title: 'Монеты',
        note: 'Горсть монет звенит и падает в кошель.',
        take: (s) => {
          s.gen(0, scatter({ n: 8, spread: 0.28, modes: COIN, fVar: 0.25, decay: 0.92 }), { vel: 0.55, rev: 0.2 });
          s.gen(0.33, thud({ f0: 160, f1: 80, tau: 0.04 }), { vel: 0.35 });
          s.gen(0.33, hiss({ dur: 0.1, lo: 2000, hi: 7000, tau: 0.03, flutter: 0.8 }), { vel: 0.12 });
        },
      },
    ],
  },
  {
    id: 'buy',
    name: 'Покупка',
    group: 'loot',
    level: -4,
    uses: ['купить у торговца предмет, артефакт, зелье, лечение', 'переброс товара у торговца, улучшение у кузнеца за золото'],
    variants: [
      {
        key: 'a',
        title: 'Прилавок',
        note: 'Монеты стучат о доску прилавка, товар ложится рядом.',
        take: (s) => {
          s.gen(0, scatter({ n: 4, spread: 0.12, modes: COIN, fVar: 0.2, decay: 0.85 }), { vel: 0.5, rev: 0.2 });
          [0, 0.05, 0.11].forEach((at, i) => s.gen(at, modal(WOOD, { scale: 1.6, damp: 2 }), { vel: 0.5 - i * 0.1 }));
          s.gen(0.25, thud({ f0: 140, f1: 70, tau: 0.05 }), { vel: 0.4 });
        },
      },
    ],
  },
  {
    id: 'gear',
    name: 'Снаряжение',
    group: 'loot',
    level: -4,
    uses: ['взять или надеть оружие и броню (награда, сундук, торговец)'],
    variants: [
      {
        key: 'a',
        title: 'Надеть',
        note: 'Два лязга железа, ремни, вещь ложится в руку.',
        take: (s) => {
          s.gen(0, modal(ARMOR), { vel: 0.5, rev: 0.2 });
          s.gen(0.11, modal(ARMOR, { scale: 1.12 }), { vel: 0.4, rev: 0.2 });
          s.gen(0.11, modal(STEEL, { scale: 0.9, damp: 1.5 }), { vel: 0.2 });
          s.gen(0.05, hiss({ dur: 0.15, lo: 600, hi: 2500, tau: 0.05, flutter: 0.8 }), { vel: 0.25 });
          s.gen(0.2, thud({ f0: 130, f1: 70, tau: 0.05 }), { vel: 0.4 });
        },
      },
    ],
  },
  {
    id: 'artifact',
    name: 'Артефакт',
    group: 'loot',
    level: -3,
    uses: ['вставить артефакт в сокет, заменить, переплавить', 'улучшение артефакта дубликатом'],
    variants: [
      {
        key: 'a',
        title: 'Сокет',
        note: 'Камень щёлкает в гнездо, стекло на квинте, челеста на фа и тихий хор.',
        room: HALL,
        take: (s) => {
          s.gen(0, modal(BONE, { scale: 1.4 }), { vel: 0.55 });
          s.gen(0, thud({ f0: 200, f1: 100, tau: 0.02 }), { vel: 0.3 });
          s.note(0.04, GLASS_SHORT, 'D5+A5', 0.5, { vel: 0.45, rev: 0.55 });
          s.note(0.12, I.CELESTA, 'F6', 0.4, { vel: 0.3, rev: 0.5 });
          s.note(0.04, CHOIR_SOFT, 'A3', 0.5, { vel: 0.5, rev: 0.55 });
        },
      },
    ],
  },
  {
    id: 'potion_take',
    name: 'Зелье в сумку',
    group: 'loot',
    level: -5,
    uses: ['взять зелье (награда, сундук, торговец)'],
    variants: [
      {
        key: 'a',
        title: 'Склянка',
        note: 'Две склянки звякают друг о друга, жидкость плещется.',
        take: (s) => {
          s.gen(0, modal(GLASS_MODES), { vel: 0.45, rev: 0.2 });
          s.gen(0.07, modal(GLASS_MODES, { scale: 1.08 }), { vel: 0.3, rev: 0.2 });
          s.gen(0.05, bubbles({ dur: 0.25, rate: 60, lo: 300, hi: 800 }), { vel: 0.3 });
          s.gen(0.03, squelch({ dur: 0.12, f0: 1400, f1: 300 }), { vel: 0.2 });
        },
      },
    ],
  },
  {
    id: 'reroll',
    name: 'Переброс',
    group: 'loot',
    level: -5,
    uses: ['перебросить награду'],
    variants: [
      {
        key: 'a',
        title: 'Кости',
        note: 'Костяные кости трясутся в стакане и прыгают по столу.',
        take: (s) => {
          s.gen(0, scatter({ n: 14, spread: 0.3, modes: BONE, fVar: 0.3, decay: 0.95 }), { vel: 0.45 });
          [0.38, 0.45, 0.5].forEach((at, i) => {
            s.gen(at, modal(BONE, { scale: 0.9 }), { vel: 0.6 - i * 0.18 });
            s.gen(at, modal(WOOD, { scale: 1.5, damp: 2 }), { vel: 0.4 - i * 0.12 });
          });
        },
      },
    ],
  },

  // ═══ События ═══
  {
    id: 'chest_open',
    name: 'Сундук',
    group: 'event',
    level: -2,
    uses: ['сундук открыт (после взлома или без мини-игры)'],
    variants: [
      {
        key: 'a',
        title: 'Крышка',
        note: 'Защёлка, долгий скрип петель, крышка откидывается, внутри блестит.',
        take: (s) => {
          s.gen(0, modal(ARMOR, { scale: 1.6, damp: 2 }), { vel: 0.45 });
          s.gen(0.02, modal(BONE), { vel: 0.3 });
          s.drum(0.06, 'n', { vel: 2, cut: 0.85 });
          s.gen(0.95, thud({ f0: 120, f1: 60, tau: 0.08 }), { vel: 0.45 });
          s.note(1, GLASS_SHORT, 'D6+A6', 0.5, { vel: 0.25, rev: 0.5 });
        },
      },
    ],
  },
  {
    id: 'lock_pin',
    name: 'Штифт',
    group: 'event',
    level: -7,
    uses: ['взлом: засечка «хорошо» — штифт встал'],
    variants: [
      {
        key: 'a',
        title: 'Щелчок',
        note: 'Тонкий щелчок штифта и пружинка.',
        room: CLOSE,
        take: (s) => {
          s.gen(0, modal(LATCH), { vel: 0.6 });
          s.drum(0, 'r', { vel: 0.5 });
          s.gen(0, modal(STEEL, { scale: 1.6, damp: 4 }), { vel: 0.15 });
        },
      },
    ],
  },
  {
    id: 'lock_great',
    name: 'Отличная засечка',
    group: 'event',
    level: -5,
    uses: ['взлом: засечка «отлично» — штифт встал точно (плюс золото)'],
    variants: [
      {
        key: 'a',
        title: 'Звон',
        note: 'Тот же щелчок и язычок шкатулки на ре со стеклом.',
        room: CLOSE,
        take: (s) => {
          s.gen(0, modal(LATCH), { vel: 0.6 });
          s.drum(0, 'r', { vel: 0.5 });
          s.note(0, I.MUSIC_BOX, 'D6', 0.3, { vel: 0.45, rev: 0.45 });
          s.note(0, GLASS_SHORT, 'A6', 0.3, { vel: 0.2, rev: 0.45 });
        },
      },
    ],
  },
  {
    id: 'lock_jam',
    name: 'Заклинило',
    group: 'event',
    level: -2,
    uses: ['взлом сорвался: замок заклинило, игла колет'],
    variants: [
      {
        key: 'a',
        title: 'Игла',
        note: 'Отмычка скрежещет, ломается со щелчком, укол иглы и сдавленное «э».',
        room: CLOSE,
        take: (s) => {
          s.gen(0, scrape({ dur: 0.3, f0: 1500, f1: 900, q: 12, grit: 0.8 }), { vel: 0.6 });
          s.gen(0.28, crackle({ dur: 0.04, rate: 3000, lo: 1500, hi: 6000 }), { vel: 0.6 });
          s.gen(0.28, modal(ARMOR, { scale: 1.5, damp: 1.5 }), { vel: 0.45 });
          s.gen(0.35, chirp({ dur: 0.08, f0: 2600, f1: 2400, attack: 0.002 }), { vel: 0.25 });
          s.gen(0.35, burst({ lo: 1000, hi: 5000, tau: 0.008 }), { vel: 0.3 });
          s.gen(0.38, voice({ dur: 0.18, pitch: [[0, 170], [1, 140]], vowel: 'e', noise: 0.35, drive: 1, attack: 0.01, release: 0.08 }), { vel: 0.3, pan: -0.25 });
        },
      },
    ],
  },
  {
    id: 'forge',
    name: 'Кузнец',
    group: 'event',
    level: -2,
    uses: ['улучшить предмет у кузнеца и на привале', 'переплавить артефакт'],
    variants: [
      {
        key: 'a',
        title: 'Наковальня',
        note: 'Три удара молота по наковальне с искрами и шипение закалки.',
        take: (s) => {
          [0, 0.34, 0.68].forEach((at, i) => {
            s.drum(at, 'a', { vel: [0.9, 0.8, 1][i] });
            s.gen(at, thud({ f0: 180, f1: 90, tau: 0.03 }), { vel: 0.4 });
            s.gen(at, crackle({ dur: 0.12, rate: 400, lo: 3000, hi: 9000, tau: 0.06 }), { vel: 0.3 });
          });
          s.gen(0.95, hiss({ dur: 1, lo: 1500, hi: 9000, attack: 0.01, tau: 0.35, flutter: 0.3 }), { vel: 0.5 });
          s.gen(0.95, bubbles({ dur: 0.4, rate: 80, lo: 400, hi: 1200, tau: 0.02 }), { vel: 0.2 });
        },
      },
    ],
  },
  {
    id: 'altar',
    name: 'Молитва',
    group: 'event',
    level: -2,
    uses: ['помолиться на алтаре'],
    variants: [
      {
        key: 'a',
        title: 'Алтарь',
        note: 'Колокол и хор «о» на ре в соборе, свечи колышутся.',
        room: CHURCH,
        take: (s) => {
          s.note(0, BELL_SHORT, 'D4', 0.4, { vel: 0.5, rev: 0.55 });
          s.note(0, { ...CHOIR_SOFT, env: { a: 0.2, d: 0.8, s: 0.9, r: 0.9 } }, 'D3+A3+D4', 1.1, { vel: 0.85, rev: 0.6 });
          s.gen(0, whoosh({ dur: 0.8, f0: 200, fPeak: 800, q: 0.7, lp: true }), { vel: 0.15 });
        },
      },
    ],
  },
  {
    id: 'sacrifice',
    name: 'Жертва',
    group: 'event',
    level: -1,
    uses: ['принести жертву на алтаре (HP за артефакт)'],
    variants: [
      {
        key: 'a',
        title: 'Кровь на камне',
        note: 'Взмах ножа, кровь на камень, гонг и хор тритоном съезжает вниз.',
        room: CHURCH,
        take: (s) => {
          s.gen(0, whoosh({ dur: 0.12, f0: 700, fPeak: 3000, q: 1.4 }), { vel: 0.4, pan: -0.2 });
          s.gen(0.1, squelch({ dur: 0.14, f0: 2600, f1: 250 }), { vel: 0.7, pan: -0.2 });
          s.drum(0.3, 'd', { vel: 1 });
          s.drum(0.45, 'd', { vel: 0.8 });
          s.drum(0.1, 'N', { vel: 0.5, cut: 2.2 });
          s.note(0.15, { ...CHOIR_FALL, bend: { semis: 3, time: 1 } }, 'D3+G#3', 1, { vel: 0.75, rev: 0.6 });
        },
      },
    ],
  },
  {
    id: 'rest',
    name: 'Привал',
    group: 'event',
    level: -4,
    uses: ['отдохнуть на привале'],
    variants: [
      {
        key: 'a',
        title: 'Костёр',
        note: 'Костёр потрескивает, лютня медленно перебирает ре минор.',
        take: (s) => {
          s.gen(0, crackle({ dur: 1.8, rate: 25, rateEnd: 15, lo: 1200, hi: 6000, tau: 1.5 }), { vel: 0.45 });
          s.gen(0, flame({ dur: 1.8, cut: 350, attack: 0.3, release: 0.6 }), { vel: 0.3 });
          s.arp(0, I.LUTE, 'D3 A3 D4 F4', 0.16, 1.2, { vel: 0.6, rev: 0.4 });
        },
      },
    ],
  },
  {
    id: 'achievement',
    name: 'Достижение',
    group: 'event',
    level: -3,
    uses: ['всплывает достижение или уровень мастерства'],
    variants: [
      {
        key: 'a',
        title: 'Колокольчики',
        note: 'Челеста по пустой квинте вверх (ре — ля — ре), колокол и стекло.',
        room: HALL,
        take: (s) => {
          s.arp(0, I.CELESTA, 'D5 A5 D6', 0.08, 0.6, { vel: 0.6, rev: 0.55 });
          s.note(0.16, BELL_SHORT, 'D5', 0.4, { vel: 0.35, rev: 0.5 });
          s.note(0, GLASS_SHORT, 'A5', 0.6, { vel: 0.25, rev: 0.5 });
        },
      },
    ],
  },

  // ═══ Забег ═══
  {
    id: 'run_start',
    name: 'Начало забега',
    group: 'run',
    level: 1,
    uses: ['«Начать забег» на выборе героя'],
    variants: [
      {
        key: 'a',
        title: 'В путь',
        note: 'Гонг, два удара тайко, рог снизу вверх (ля — ре) и цепи.',
        room: CHURCH,
        take: (s) => {
          s.drum(0, 'N', { vel: 0.5, cut: 2.5 });
          s.drum(0, 'K', { vel: 0.8 });
          s.drum(0.45, 'K', { vel: 0.8 });
          s.note(0, HORN_CALL, 'A2', 0.35, { vel: 0.9, rev: 0.45 });
          s.note(0.45, HORN_CALL, 'D3', 1, { vel: 1, rev: 0.5 });
          s.drum(0.5, 'z', { vel: 0.4 });
        },
      },
    ],
  },
  {
    id: 'run_win',
    name: 'Победа в забеге',
    group: 'run',
    level: 2,
    uses: ['последний босс пал — забег выигран'],
    variants: [
      {
        key: 'a',
        title: 'Собор',
        note: 'Орган и хор: си-бемоль мажор → до мажор → ре минор, литавры, гонг и колокол на последнем аккорде.',
        room: CHURCH,
        take: (s) => {
          const chords = ['Bb2+F3+Bb3+D4', 'C3+G3+C4+E4', 'D3+A3+D4+F4'];
          chords.forEach((c, i) => {
            const at = i * 0.6;
            const len = i === 2 ? 1.6 : 0.55;
            s.note(at, { ...I.ORGAN_FULL, env: { a: 0.04, d: 0.3, s: 0.9, r: 0.6 } }, c, len, { vel: 0.7, rev: 0.45 });
            s.note(at, CHOIR_STAB, c, len, { vel: 0.6, rev: 0.6 });
            s.drum(at, ['g', 'G', 'D'][i], { vel: 0.8 });
          });
          s.drum(1.2, 'N', { vel: 0.45, cut: 2.5 });
          s.note(1.2, BELL_SHORT, 'D4', 0.5, { vel: 0.5, rev: 0.5 });
        },
      },
    ],
  },
];

export const SFX: Record<string, SfxDef> = Object.fromEntries(list.map((d) => [d.id, d]));
export const SFX_LIST: readonly SfxDef[] = list;

export function sfxDef(id: string): SfxDef {
  const d = SFX[id];
  if (!d) throw new Error(`Нет звука «${id}»`);
  return d;
}

/** Вариант звука: выбранный ключ, иначе рекомендованный, иначе первый. */
export function sfxVariant(def: SfxDef, key?: SfxKey): SfxVariant {
  return def.variants.find((v) => v.key === key) ?? def.variants.find((v) => v.key === def.rec) ?? def.variants[0];
}

/**
 * Запись варианта, его зал и момент удара. Надстройка (`over`, крит) — вместе со звуком, поверх которого играет:
 * его рекомендованный вариант, а надстройка — с момента его удара.
 */
export function sfxTake(def: SfxDef, key?: SfxKey, alone = false): { take: Take; room: Room; hit: number } {
  const v = sfxVariant(def, key);
  const take = new Take();
  if (def.over && !alone) {
    const base = sfxVariant(sfxDef(def.over));
    base.take(take);
    const inner = new Take();
    v.take(inner);
    take.put(base.hit ?? 0, inner);
    return { take, room: v.room ?? base.room ?? FIELD, hit: base.hit ?? 0 };
  }
  v.take(take);
  return { take, room: v.room ?? FIELD, hit: v.hit ?? 0 };
}
