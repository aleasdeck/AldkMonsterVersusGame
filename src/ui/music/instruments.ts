/**
 * Инструменты музыки локаций — пресеты синтезатора (synth.ts). Тембры собраны под 16-битные приставки: FM-бас, медь
 * и колокола — как у Mega Drive, прямоугольники, флейта, орган и хор под мягким фильтром — как сэмплы SNES.
 * Громкость здесь — только баланс тембров между собой; партию в треке громче или тише делает её `vol`.
 */
import type { Instrument } from './synth';

// ─── Мелодии ─────────────────────────────────────────────────────────────

/** Флейта: треугольник с дыханием и поздним вибрато. */
export const FLUTE: Instrument = { wave: 'tri', breath: 0.05, env: { a: 0.04, d: 0.3, s: 0.8, r: 0.12 }, cutoff: 900, track: 2.5, vib: { rate: 5.2, depth: 22, delay: 0.25 }, gain: 0.6 };

/** Кларнет: меандр под фильтром — нечётные гармоники, как у дерева; связная игра с подъездом. */
export const CLARINET: Instrument = { wave: 'pulse', duty: 0.5, breath: 0.03, env: { a: 0.035, d: 0.3, s: 0.85, r: 0.1 }, cutoff: 450, track: 1.6, vib: { rate: 4.8, depth: 16, delay: 0.3 }, glide: 0.06, gain: 0.42 };

/** Оса: две пилы с частым мелким вибрато — жужжание. */
export const WASP: Instrument = { wave: 'saw', detune: 7, env: { a: 0.01, d: 0.3, s: 0.8, r: 0.08 }, cutoff: 1100, track: 2, vib: { rate: 8.5, depth: 28, delay: 0.05 }, gain: 0.32 };

/** Аккордеон: два прямоугольника с расстройкой и качанием скважности. */
export const ACCORDION: Instrument = { wave: 'pulse', duty: 0.32, pwm: { rate: 0.9, depth: 0.08 }, detune: 11, env: { a: 0.025, d: 0.2, s: 0.85, r: 0.08 }, cutoff: 1300, track: 1.2, vib: { rate: 5.6, depth: 6, delay: 0.2 }, gain: 0.32 };

/** Скрипка: пила с вибрато и мягкой атакой. */
export const FIDDLE: Instrument = { wave: 'saw', env: { a: 0.05, d: 0.3, s: 0.8, r: 0.1 }, cutoff: 1300, track: 1.5, vib: { rate: 6, depth: 20, delay: 0.12 }, gain: 0.28 };

/** Резкий лид: меандр с перегрузом, широким вибрато и подъездом. */
export const LEAD: Instrument = { wave: 'pulse', duty: 0.5, drive: 2, env: { a: 0.01, d: 0.4, s: 0.75, r: 0.1 }, cutoff: 1100, track: 1.8, vib: { rate: 6, depth: 25, delay: 0.18 }, glide: 0.04, gain: 0.34 };

/** Орган: регистры 8', 4', 2 2/3', 2' и 1' — гармоники 1, 2, 3, 4 и 8. */
export const ORGAN: Instrument = { wave: 'table', harmonics: [1, 0.7, 0.35, 0.45, 0, 0.15, 0, 0.25], detune: 3, env: { a: 0.025, d: 0.2, s: 0.9, r: 0.18 }, cutoff: 2600, vib: { rate: 5.8, depth: 4, delay: 0 }, gain: 0.28 };

// ─── Щипки и удары ──────────────────────────────────────────────────────

/** Арфа: прямоугольник 25 % с быстро закрывающимся фильтром. */
export const HARP: Instrument = { wave: 'pulse', duty: 0.25, env: { a: 0.002, d: 0.6, s: 0, r: 0.2 }, cutoff: 300, track: 1, cutEnv: 3200, cutTime: 0.09, gain: 0.4 };

/** Пиццикато: FM с коротким ярким индексом. */
export const PIZZ: Instrument = { wave: 'fm', ratio: 1, index: 3, indexEnd: 0.3, indexTime: 0.06, env: { a: 0.002, d: 0.3, s: 0, r: 0.08 }, cutoff: 2400, gain: 0.5 };

/** Калимба: FM с высоким модулятором — звонкий «зуб» и долгий чистый хвост. */
export const KALIMBA: Instrument = { wave: 'fm', ratio: 7, index: 1.6, indexEnd: 0, indexTime: 0.02, env: { a: 0.002, d: 0.7, s: 0, r: 0.25 }, gain: 0.45 };

/** Ксилофон — кости Склепа: FM 3.5, сухой и короткий. */
export const XYLO: Instrument = { wave: 'fm', ratio: 3.5, index: 2.2, indexEnd: 0, indexTime: 0.03, env: { a: 0.001, d: 0.35, s: 0, r: 0.08 }, gain: 0.5 };

/** Клавесин: пила с ярким щипком и спадом без удержания. */
export const HARPSICHORD: Instrument = { wave: 'saw', env: { a: 0.002, d: 1.1, s: 0, r: 0.07 }, cutoff: 700, track: 1.5, cutEnv: 5000, cutTime: 0.06, gain: 0.26 };

/** Колокол: FM с негармоническим модулятором и долгим звоном. */
export const BELL: Instrument = { wave: 'fm', ratio: 1.4, index: 4.5, indexEnd: 0.3, indexTime: 1, env: { a: 0.002, d: 4, s: 0, r: 1.5 }, gain: 0.32 };

/** Чиповое арпеджио: тонкий прямоугольник 12,5 %. */
export const CHIP: Instrument = { wave: 'pulse', duty: 0.125, env: { a: 0.002, d: 0.12, s: 0.35, r: 0.04 }, cutoff: 2600, track: 1, gain: 0.25 };

/** Перегруженная гитара: две пилы, перегруз и фильтр «кабинета»; короткие ноты — глушёный чёс. */
export const GUITAR: Instrument = { wave: 'saw', detune: 12, drive: 6, env: { a: 0.004, d: 0.18, s: 0.6, r: 0.05 }, cutoff: 1700, gain: 0.3 };

// ─── Басы ────────────────────────────────────────────────────────────────

/** FM-бас Mega Drive: тёплый, со щелчком атаки. */
export const FM_BASS: Instrument = { wave: 'fm', ratio: 1, index: 3.2, indexEnd: 1, indexTime: 0.1, feedback: 0.12, env: { a: 0.003, d: 0.4, s: 0.55, r: 0.06 }, cutoff: 1400, gain: 0.6 };

/** Болотный бас: FM с модулятором ×2 — полый, только нечётные гармоники, с подъездом от прошлой ноты. */
export const MIRE_BASS: Instrument = { wave: 'fm', ratio: 2, index: 1.8, indexEnd: 0.7, indexTime: 0.15, env: { a: 0.006, d: 0.5, s: 0.55, r: 0.08 }, cutoff: 800, glide: 0.05, gain: 0.7 };

/** Рычащий бас: FM с сильной обратной связью. */
export const GROWL: Instrument = { wave: 'fm', ratio: 1, index: 2.6, indexEnd: 1.4, indexTime: 0.12, feedback: 0.3, env: { a: 0.003, d: 0.2, s: 0.7, r: 0.05 }, cutoff: 1100, gain: 0.55 };

/** Туба: медный FM — индекс растёт на атаке, как у живой меди. */
export const TUBA: Instrument = { wave: 'fm', ratio: 1, index: 0.4, indexEnd: 2.2, indexTime: 0.05, env: { a: 0.02, d: 0.3, s: 0.6, r: 0.07 }, cutoff: 900, gain: 0.6 };

// ─── Подушки ─────────────────────────────────────────────────────────────

/** Струнные: две пилы с расстройкой под мягким фильтром. */
export const STRINGS: Instrument = { wave: 'saw', detune: 9, env: { a: 0.35, d: 0.6, s: 0.85, r: 0.5 }, cutoff: 1400, track: 0.5, vib: { rate: 4.8, depth: 8, delay: 0.3 }, gain: 0.2 };

/** Туман: широкая тёмная подушка с медленной атакой. */
export const FOG: Instrument = { wave: 'saw', detune: 14, env: { a: 1.2, d: 1, s: 0.8, r: 1.2 }, cutoff: 500, track: 0.25, vib: { rate: 0.3, depth: 10, delay: 0 }, gain: 0.2 };

/** Хор: таблица гласной «а», медленная атака, вибрато. */
export const CHOIR: Instrument = { wave: 'table', harmonics: [1, 0.55, 0.35, 0.5, 0.2, 0.1, 0.05], detune: 10, env: { a: 0.45, d: 0.6, s: 0.85, r: 0.7 }, cutoff: 1300, vib: { rate: 4.6, depth: 14, delay: 0.2 }, gain: 0.22 };
