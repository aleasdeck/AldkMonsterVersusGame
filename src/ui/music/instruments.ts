/**
 * Инструменты музыки локаций — пресеты синтезатора (synth.ts) под тёмное фэнтези в духе 32-битных приставок: смычковые
 * хорусом, хоры и духовые формантами, щипковые струны по Карплусу — Стронгу, орган, колокола и стеклянные подушки на FM,
 * гулы и рои. Громкость здесь — только баланс тембров между собой; партию в треке громче или тише делает её `vol`.
 */
import type { Formant, Instrument } from './synth';

// Форманты гласных мужского хора, Гц / добротность / громкость.
const VOWEL_A: Formant[] = [[700, 6, 1], [1100, 8, 0.6], [2500, 10, 0.3]];
const VOWEL_O: Formant[] = [[450, 6, 1], [800, 8, 0.5], [2830, 10, 0.15]];
const VOWEL_U: Formant[] = [[325, 6, 1], [700, 8, 0.35], [2530, 10, 0.1]];

// ─── Смычковые ───────────────────────────────────────────────────────────

/** Виолончель: три пилы хорусом, тёмный фильтр, позднее вибрато и шорох смычка; связная игра с подъездом. */
export const CELLO: Instrument = { wave: 'saw', unison: { voices: 3, cents: 8 }, cutoff: 650, track: 1.2, reso: 0.15, breath: 0.015, env: { a: 0.14, d: 0.5, s: 0.85, r: 0.35 }, vib: { rate: 5, depth: 14, delay: 0.35 }, glide: 0.08, gain: 0.33 };

/** Струнная группа: пять пил с широким разбросом и медленной атакой — подушка. */
export const STRINGS: Instrument = { wave: 'saw', unison: { voices: 5, cents: 18 }, cutoff: 1000, track: 0.4, env: { a: 0.7, d: 1, s: 0.9, r: 1.2 }, vib: { rate: 4.6, depth: 7, delay: 0.4 }, gain: 0.4 };

/** Тремоло струнных: та же группа, ярче и с частым дрожанием громкости — тревога. */
export const TREMOLO: Instrument = { wave: 'saw', unison: { voices: 5, cents: 14 }, cutoff: 1600, track: 0.4, env: { a: 0.25, d: 0.6, s: 0.9, r: 0.6 }, trem: { rate: 11, depth: 0.65 }, gain: 0.54 };

/** Контрабас смычком. */
export const CONTRABASS: Instrument = { wave: 'saw', unison: { voices: 2, cents: 6 }, cutoff: 380, track: 0.8, env: { a: 0.1, d: 0.4, s: 0.85, r: 0.3 }, gain: 0.44 };

/** Скрипка-никельхарпа: гнусавые форманты корпуса, вибрато, смычок. */
export const FIDDLE: Instrument = { wave: 'saw', unison: { voices: 2, cents: 5 }, formants: [[450, 3, 1], [1100, 3, 0.9], [2800, 4, 0.5]], cutoff: 3200, breath: 0.02, env: { a: 0.06, d: 0.3, s: 0.85, r: 0.15 }, vib: { rate: 5.8, depth: 18, delay: 0.15 }, glide: 0.04, gain: 0.79 };

/** Колёсная лира: жужжащий бурдон с гнусавыми формантами. */
export const HURDY: Instrument = { wave: 'saw', unison: { voices: 3, cents: 6 }, formants: [[600, 4, 1], [1300, 5, 0.8], [2600, 6, 0.4]], cutoff: 2500, env: { a: 0.3, d: 0.5, s: 1, r: 0.5 }, gain: 0.89 };

// ─── Духовые ─────────────────────────────────────────────────────────────

/** Тёмная флейта, как сякухати: много дыхания, подъезд снизу к каждой ноте, широкое вибрато. */
export const SHAKU: Instrument = { wave: 'sine', breath: 0.12, cutoff: 1100, track: 1.5, env: { a: 0.12, d: 0.4, s: 0.85, r: 0.3 }, vib: { rate: 4.8, depth: 25, delay: 0.4 }, bend: { semis: -1.2, time: 0.18 }, gain: 0.3 };

/** Голос ветра: шум в узкой полосе на высоте ноты, с долгим подъездом снизу — вой. */
export const WHISTLE: Instrument = { wave: 'noise', formants: [[1, 45, 1]], env: { a: 0.6, d: 1, s: 0.9, r: 0.9 }, vib: { rate: 3.5, depth: 30, delay: 0.3 }, bend: { semis: -4, time: 0.7 }, gain: 17.18 };

/** Гобой и фагот: узкий прямоугольник с формантами трости. */
export const REED: Instrument = { wave: 'pulse', duty: 0.18, formants: [[600, 3, 1], [1300, 4, 0.7], [2900, 5, 0.3]], cutoff: 2200, breath: 0.02, env: { a: 0.05, d: 0.3, s: 0.85, r: 0.15 }, vib: { rate: 5.2, depth: 14, delay: 0.3 }, gain: 0.59 };

/** Дудук: тёплая трость, подъезд снизу, медленное широкое вибрато. */
export const DUDUK: Instrument = { wave: 'pulse', duty: 0.3, formants: [[500, 4, 1], [1250, 6, 0.6], [2400, 7, 0.2]], cutoff: 1800, breath: 0.04, env: { a: 0.12, d: 0.4, s: 0.9, r: 0.25 }, vib: { rate: 5, depth: 22, delay: 0.35 }, bend: { semis: -1, time: 0.15 }, glide: 0.1, gain: 0.73 };

/** Фисгармония: два прямоугольника с расстройкой и лёгким тремоло мехов. */
export const HARMONIUM: Instrument = { wave: 'pulse', duty: 0.4, unison: { voices: 2, cents: 10 }, cutoff: 1200, track: 0.5, env: { a: 0.15, d: 0.3, s: 0.9, r: 0.3 }, trem: { rate: 5, depth: 0.08 }, gain: 0.23 };

// ─── Медь ────────────────────────────────────────────────────────────────

/** Валторна вдали: FM, индекс растёт на атаке, тёмный фильтр. */
export const HORN: Instrument = { wave: 'fm', ratio: 1, index: 0.3, indexEnd: 2, indexTime: 0.15, unison: { voices: 2, cents: 6 }, cutoff: 700, track: 0.6, env: { a: 0.18, d: 0.5, s: 0.8, r: 0.4 }, vib: { rate: 4.8, depth: 8, delay: 0.4 }, gain: 0.43 };

/** Низкая медь: тромбоны и туба, рычат на акцентах. */
export const LOW_BRASS: Instrument = { wave: 'fm', ratio: 1, index: 0.5, indexEnd: 3, indexTime: 0.1, drive: 1.2, cutoff: 500, reso: 0.2, env: { a: 0.06, d: 0.3, s: 0.8, r: 0.2 }, gain: 0.21 };

// ─── Хоры ────────────────────────────────────────────────────────────────

/** Хор «а-а»: четыре голоса пилы через форманты, медленная атака — подушка. */
export const CHOIR_A: Instrument = { wave: 'saw', unison: { voices: 4, cents: 16 }, formants: VOWEL_A, env: { a: 0.9, d: 1, s: 0.9, r: 1.4 }, vib: { rate: 5, depth: 16, delay: 0.3 }, gain: 1.17 };

/** Хор «о-о». */
export const CHOIR_O: Instrument = { wave: 'saw', unison: { voices: 4, cents: 14 }, formants: VOWEL_O, env: { a: 0.9, d: 1, s: 0.9, r: 1.4 }, vib: { rate: 5, depth: 14, delay: 0.3 }, gain: 1.46 };

/** Хор «у-у» с закрытым ртом — гудение. */
export const CHOIR_U: Instrument = { wave: 'saw', unison: { voices: 3, cents: 12 }, formants: VOWEL_U, env: { a: 1, d: 1, s: 0.9, r: 1.4 }, vib: { rate: 4.6, depth: 12, delay: 0.3 }, gain: 0.83 };

/** Хор ведёт мелодию: связно, с подъездом, «о». */
export const CHOIR_LEAD: Instrument = { wave: 'saw', unison: { voices: 3, cents: 10 }, formants: VOWEL_O, env: { a: 0.25, d: 0.5, s: 0.9, r: 0.6 }, vib: { rate: 5.2, depth: 22, delay: 0.3 }, glide: 0.12, gain: 1.35 };

/** Распев культа: мужские голоса на «о», короткая атака — ритмичный слог. */
export const CHANT: Instrument = { wave: 'saw', unison: { voices: 5, cents: 20 }, formants: VOWEL_O, env: { a: 0.04, d: 0.3, s: 0.8, r: 0.25 }, vib: { rate: 5, depth: 10, delay: 0.2 }, gain: 1.5 };

// ─── Орган и клавиши ─────────────────────────────────────────────────────

/** Церковный орган: мягкие регистры 8', 4', 2 2/3', 2', 1' — подушка. */
export const ORGAN: Instrument = { wave: 'table', harmonics: [1, 0.5, 0.3, 0.35, 0, 0.12, 0, 0.18], unison: { voices: 2, cents: 5 }, cutoff: 2400, env: { a: 0.12, d: 0.3, s: 0.95, r: 0.5 }, gain: 0.32 };

/** Пленум органа: все регистры с микстурой — ярко, для пассажей. */
export const ORGAN_FULL: Instrument = { wave: 'table', harmonics: [1, 0.8, 0.5, 0.7, 0.3, 0.4, 0.1, 0.5, 0, 0.2, 0, 0.2], unison: { voices: 2, cents: 4 }, cutoff: 4500, env: { a: 0.03, d: 0.2, s: 0.95, r: 0.35 }, gain: 0.45 };

/** Педаль органа: 16' и 8', глухо. */
export const ORGAN_PEDAL: Instrument = { wave: 'table', harmonics: [1, 0.6, 0.25, 0.3], cutoff: 600, env: { a: 0.08, d: 0.3, s: 0.95, r: 0.5 }, gain: 0.39 };

/** Клавесин: яркая короткая струна. */
export const HARPSICHORD: Instrument = { wave: 'pluck', pluck: { bright: 0.95, decay: 1.2 }, cutoff: 5000, env: { a: 0.001, d: 1, s: 1, r: 0.08 }, gain: 0.66 };

/** Музыкальная шкатулка: стальной язычок (FM с негармоническим модулятором), чуть плывёт — механизм стар. */
export const MUSIC_BOX: Instrument = { wave: 'fm', ratio: 5.95, index: 1.2, indexEnd: 0, indexTime: 0.04, env: { a: 0.001, d: 2.2, s: 0, r: 0.5 }, vib: { rate: 5.5, depth: 9, delay: 0 }, gain: 0.5 };

/** Челеста: колокольчик мягче шкатулки. */
export const CELESTA: Instrument = { wave: 'fm', ratio: 4, index: 1, indexEnd: 0, indexTime: 0.3, env: { a: 0.001, d: 1.6, s: 0, r: 0.4 }, gain: 0.54 };

// ─── Щипковые (струна Карплуса — Стронга) ────────────────────────────────

/** Лютня: парные струны, тёплый щипок. */
export const LUTE: Instrument = { wave: 'pluck', pluck: { bright: 0.5, decay: 1.6 }, unison: { voices: 2, cents: 6 }, cutoff: 3200, env: { a: 0.001, d: 1, s: 1, r: 0.35 }, gain: 0.84 };

/** Арфа: долгий звон. */
export const HARP: Instrument = { wave: 'pluck', pluck: { bright: 0.55, decay: 3.5 }, cutoff: 4000, env: { a: 0.001, d: 1, s: 1, r: 1.5 }, gain: 0.75 };

/** Цимбалы: тройные струны, яркий удар молоточка, мерцание. */
export const DULCIMER: Instrument = { wave: 'pluck', pluck: { bright: 0.85, decay: 2.4 }, unison: { voices: 3, cents: 9 }, cutoff: 6000, env: { a: 0.001, d: 1, s: 1, r: 0.8 }, gain: 0.61 };

/** Банджо болотной готики: сухо, коротко, с носом. */
export const BANJO: Instrument = { wave: 'pluck', pluck: { bright: 0.9, decay: 0.7 }, cutoff: 3500, reso: 0.3, env: { a: 0.001, d: 1, s: 1, r: 0.15 }, gain: 0.58 };

/** Пиццикато контрабаса: глухой щипок. */
export const PIZZ: Instrument = { wave: 'pluck', pluck: { bright: 0.35, decay: 0.6 }, cutoff: 1500, env: { a: 0.001, d: 1, s: 1, r: 0.12 }, gain: 1.02 };

// ─── Колокола и стекло ───────────────────────────────────────────────────

/** Церковный колокол: негармонический FM, два голоса бьются, звон шесть секунд. */
export const BELL: Instrument = { wave: 'fm', ratio: 1.4, index: 5, indexEnd: 0.5, indexTime: 1.5, unison: { voices: 2, cents: 4 }, env: { a: 0.002, d: 6, s: 0, r: 3 }, gain: 0.35 };

/** Колокол под водой: тот же звон за тёмным фильтром. */
export const BELL_DEEP: Instrument = { ...BELL, cutoff: 480, gain: 0.58 };

/** Стекло: призрачная FM-подушка, плывёт. */
export const GLASS: Instrument = { wave: 'fm', ratio: 2, index: 1.2, indexEnd: 0.2, indexTime: 1, unison: { voices: 2, cents: 12 }, env: { a: 0.8, d: 2, s: 0.7, r: 2 }, vib: { rate: 0.2, depth: 12, delay: 0 }, gain: 0.34 };

/** Призрачная подушка: чистые тона, медленное колыхание. */
export const GHOST: Instrument = { wave: 'table', harmonics: [1, 0, 0.3, 0, 0.1], unison: { voices: 3, cents: 20 }, trem: { rate: 0.3, depth: 0.3 }, env: { a: 1.5, d: 2, s: 0.9, r: 2 }, gain: 0.33 };

// ─── Гулы, рои и тяжёлое ─────────────────────────────────────────────────

/** Гул: четыре пилы под низким резонансным фильтром, атака в секунды. */
export const DRONE: Instrument = { wave: 'saw', unison: { voices: 4, cents: 24 }, cutoff: 260, track: 0.2, reso: 0.35, env: { a: 2.5, d: 2, s: 1, r: 2.5 }, vib: { rate: 0.15, depth: 12, delay: 0 }, gain: 0.3 };

/** Саб: синус с лёгким перегрузом — давление, а не нота. */
export const SUB: Instrument = { wave: 'sine', drive: 0.8, env: { a: 1.5, d: 1, s: 1, r: 2 }, gain: 0.3 };

/** Рой: семь пил с огромным разбросом, частое вибрато и дрожь — жужжание. */
export const SWARM: Instrument = { wave: 'saw', unison: { voices: 7, cents: 45 }, cutoff: 900, track: 0.3, reso: 0.45, vib: { rate: 11, depth: 35, delay: 0 }, trem: { rate: 7, depth: 0.35 }, env: { a: 1.2, d: 1, s: 0.9, r: 1.5 }, gain: 0.35 };

/** Тёмное арпеджио: прямоугольник под резонансным фильтром, который щёлкает на атаке. */
export const DARK_ARP: Instrument = { wave: 'pulse', duty: 0.25, unison: { voices: 2, cents: 8 }, cutoff: 450, track: 0.3, cutEnv: 2600, cutTime: 0.08, reso: 0.55, env: { a: 0.002, d: 0.2, s: 0.3, r: 0.08 }, gain: 0.4 };

/** Рычащий FM-бас. */
export const GROWL: Instrument = { wave: 'fm', ratio: 1, index: 2.6, indexEnd: 1.4, indexTime: 0.12, feedback: 0.3, cutoff: 900, env: { a: 0.003, d: 0.2, s: 0.7, r: 0.05 }, gain: 0.47 };

/** Жужжащий лид Улья: пилы хорусом, частое вибрато. */
export const BUZZ_LEAD: Instrument = { wave: 'saw', unison: { voices: 3, cents: 14 }, cutoff: 1300, track: 1, reso: 0.3, vib: { rate: 9.5, depth: 32, delay: 0.05 }, env: { a: 0.02, d: 0.3, s: 0.85, r: 0.12 }, glide: 0.05, gain: 0.31 };

/** Дум-гитара: три пилы, сильный перегруз, резонанс «кабинета». */
export const DOOM_GUITAR: Instrument = { wave: 'saw', unison: { voices: 3, cents: 16 }, drive: 9, cutoff: 1400, reso: 0.25, env: { a: 0.004, d: 0.4, s: 0.8, r: 0.12 }, gain: 0.22 };

/** Плачущий лид гитары: перегруз, вибрато пальцем, подтяжка к ноте. */
export const WAIL: Instrument = { wave: 'saw', unison: { voices: 2, cents: 6 }, drive: 5, cutoff: 2200, track: 0.5, reso: 0.2, vib: { rate: 5.5, depth: 30, delay: 0.25 }, glide: 0.06, bend: { semis: -1, time: 0.08 }, env: { a: 0.01, d: 0.5, s: 0.8, r: 0.2 }, gain: 0.26 };
