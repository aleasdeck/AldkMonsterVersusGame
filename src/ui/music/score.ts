/**
 * Нотная запись музыки локаций (docs/muzyka.md). Без DOM и без звука: только время, высота и сила нот.
 *
 * Трек собирается из кусков `Seq` — нот с общей длиной в долях. Кусок пишется строкой токенов, один токен — одна
 * клетка сетки (`div` клеток на долю): нота «E5», «F#4», «Bb3» или аккорд «C4+E4+G4», «-» — тянуть звучащее,
 * «.» — пауза, «|» — черта такта (сверяется: в такте ровно `div × beatsPerBar` токенов), суффикс «!» — акцент, «?» — тихо.
 * Партии по гармонии (бас, арпеджио, аккомпанемент) пишутся ступенями аккорда — «1 5 8 3'», а аккорды — строкой «Em C G D7».
 * Барабаны — строкой букв без пробелов, одна буква — одна клетка («k...s...»), набор ударных — DRUMS в synth.ts.
 */

export interface NoteEv {
  /** Начало в долях от начала куска. */
  t: number;
  /** Сколько доль нота держится до отпускания (хвост огибающей звучит сверх этого). */
  len: number;
  /** MIDI-номер (C4 = 60); у барабана 0. */
  midi: number;
  /** Сила 0..1. */
  vel: number;
  /** Удар барабана — буква набора DRUMS. */
  drum?: string;
}

/** Аккорд на отрезке: корень — класс высоты 0..11, интервалы от корня. */
export interface ChordSpan {
  t: number;
  len: number;
  root: number;
  ivs: number[];
  name: string;
}

/** Кусок трека: события и его длина в долях (длина — не конец последней ноты: паузы в конце тоже считаются). */
export interface Seq<T extends { t: number } = NoteEv> {
  items: T[];
  beats: number;
}

export type Prog = Seq<ChordSpan>;

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** «C4», «F#3», «Bb2» → MIDI-номер. */
export function midiOf(name: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`Не нота: «${name}»`);
  return 12 * (Number(m[3]) + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

/** Частота ноты, Гц (A4 = 440). */
export function freqOf(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Склейка кусков подряд: время каждого следующего сдвигается на длину предыдущих. */
export function cat<T extends { t: number }>(...parts: Seq<T>[]): Seq<T> {
  const items: T[] = [];
  let at = 0;
  for (const p of parts) {
    for (const x of p.items) items.push({ ...x, t: x.t + at });
    at += p.beats;
  }
  return { items, beats: at };
}

/** Кусок n раз подряд. */
export function rep<T extends { t: number }>(seq: Seq<T>, n: number): Seq<T> {
  return cat(...Array.from({ length: n }, () => seq));
}

/** Тишина на столько-то доль. */
export function rest(beats: number): Seq {
  return { items: [], beats };
}

/** Сила по суффиксу токена: «!» — акцент, «?» — тихо; без суффикса — null, силу задаст место в такте. */
function velOf(tok: string): [string, number | null] {
  if (tok.endsWith('!')) return [tok.slice(0, -1), 1];
  if (tok.endsWith('?')) return [tok.slice(0, -1), 0.5];
  return [tok, null];
}

/** Метрика: первая доля такта звучит полной силой, остальные доли — чуть тише, доли между долями — ещё тише. */
function metricVel(posInBar: number, div: number): number {
  if (posInBar === 0) return 0.8;
  return posInBar % div === 0 ? 0.75 : 0.69;
}

/**
 * Общий разбор строки токенов: ноты начинаются на своей клетке и тянутся «-», «.» обрывает звучащее.
 * `pitches` превращает токен (без суффикса силы) в высоты — нотой, аккордом или ступенями аккорда под этим временем.
 */
function walk(src: string, div: number, barTokens: number, pitches: (tok: string, t: number) => number[]): Seq {
  const items: NoteEv[] = [];
  let sounding: NoteEv[] = [];
  let pos = 0;
  let inBar = 0;
  let bar = 1;
  for (const raw of src.trim().split(/\s+/)) {
    if (!raw) continue;
    if (raw === '|') {
      if (inBar !== barTokens) throw new Error(`Такт ${bar}: ${inBar} токенов вместо ${barTokens} в «${src.slice(0, 60)}…»`);
      inBar = 0;
      bar++;
      continue;
    }
    const t = pos / div;
    if (raw === '-') {
      for (const n of sounding) n.len += 1 / div;
    } else if (raw === '.') {
      sounding = [];
    } else {
      const [tok, mark] = velOf(raw);
      const vel = mark ?? metricVel(pos % barTokens, div);
      sounding = pitches(tok, t).map((midi) => ({ t, len: 1 / div, midi, vel }));
      items.push(...sounding);
    }
    pos++;
    inBar++;
  }
  if (inBar !== 0 && inBar !== barTokens) throw new Error(`Такт ${bar}: ${inBar} токенов вместо ${barTokens} в «${src.slice(0, 60)}…»`);
  if (pos % barTokens !== 0) throw new Error(`Неполный такт: ${pos} токенов при ${barTokens} в такте в «${src.slice(0, 60)}…»`);
  return { items, beats: pos / div };
}

// ─── Аккорды ─────────────────────────────────────────────────────────────

const QUALITIES: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  '5': [0, 7],
};

/** «Am», «F#7», «Bbmaj7» → корень и интервалы. */
export function parseChord(name: string): { root: number; ivs: number[] } {
  const m = /^([A-G])(#|b)?(.*)$/.exec(name);
  const ivs = m ? QUALITIES[m[3]] : undefined;
  if (!m || !ivs) throw new Error(`Не аккорд: «${name}»`);
  return { root: (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12, ivs };
}

/**
 * Ступень аккорда → полутоны от корня: 1 — корень, 3 — терция аккорда (у sus — его ступень), 5 — квинта, 7 — септима
 * (если её нет в аккорде — малая у минорного, большая у мажорного), 8 — октава, 2/4/6/9 — по мажорной гамме от корня;
 * «b»/«#» впереди — на полутон ниже/выше, «'» в конце — октавой выше, «,» — ниже (можно повторять).
 */
export function degree(tok: string, ivs: number[]): number {
  const m = /^(b|#)?([1-9])([',]*)$/.exec(tok);
  if (!m) throw new Error(`Не ступень: «${tok}»`);
  const third = ivs[1];
  const minor = third === 3;
  const map: Record<string, number> = {
    '1': 0,
    '2': 2,
    '3': third,
    '4': 5,
    '5': ivs[2] ?? 7,
    '6': 9,
    '7': ivs[3] ?? (minor ? 10 : 11),
    '8': 12,
    '9': 14,
  };
  let st = map[m[2]] + (m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0);
  for (const c of m[3]) st += c === "'" ? 12 : -12;
  return st;
}

/** Корень аккорда в октаве `oct`: C..B этой октавы (бас в октаве 2 — от C2 до B2). */
export function rootIn(root: number, oct: number): number {
  return 12 * (oct + 1) + root;
}

/** Аккорд, звучащий в момент t. */
export function chordAt(prog: Prog, t: number): ChordSpan {
  let cur = prog.items[0];
  for (const c of prog.items) {
    if (c.t <= t + 1e-9) cur = c;
    else break;
  }
  return cur;
}

/**
 * Второй голос под мелодией по гармонии: под каждой нотой — ближайший звук аккорда этого момента, который ниже её
 * на `lo`…`hi` полутонов (по умолчанию от малой терции до большой сексты). В окне в 7 полутонов звук трезвучия есть всегда.
 */
export function under(seq: Seq, prog: Prog, lo = 3, hi = 9, vel = 0.75): Seq {
  const items = seq.items.map((n) => {
    const c = chordAt(prog, n.t);
    const pcs = c.ivs.map((iv) => (c.root + iv) % 12);
    let midi = n.midi - lo;
    while (midi > n.midi - hi && !pcs.includes(midi % 12)) midi--;
    return { ...n, midi, vel: n.vel * vel };
  });
  return { items, beats: seq.beats };
}

/** Нотная запись трека с заданным размером такта. */
export function score(beatsPerBar: number) {
  /** Мелодия или аккорды нотами: «E5 - - B4 E5 F#5 G5 A5». */
  function line(src: string, div: number): Seq {
    return walk(src, div, div * beatsPerBar, (tok) => tok.split('+').map(midiOf));
  }

  /** Аккорды по тактам: «Em C G D7»; «Am_F» — два аккорда поровну в одном такте; «|» и переносы строк ничего не значат. */
  function chords(src: string): Prog {
    const items: ChordSpan[] = [];
    let at = 0;
    for (const bar of src.trim().split(/\s+/)) {
      if (!bar || bar === '|') continue;
      const names = bar.split('_');
      const len = beatsPerBar / names.length;
      for (const name of names) {
        items.push({ t: at, len, name, ...parseChord(name) });
        at += len;
      }
    }
    return { items, beats: at };
  }

  /**
   * Партия по гармонии: рисунок такта ступенями аккорда («1 - . 5, 8 - 5 .»), корень — в октаве `oct`. Несколько рисунков
   * через «|» идут по тактам по кругу («1 . . | 5, . .» — корень в нечётных тактах, квинта вниз в чётных).
   * Ступени можно складывать в аккорд: «1+3+5».
   */
  function over(prog: Prog, pattern: string, div: number, oct: number): Seq {
    const bars = pattern.split('|').map((p) => p.trim()).filter(Boolean);
    const nBars = Math.round(prog.beats / beatsPerBar);
    const src = Array.from({ length: nBars }, (_, i) => bars[i % bars.length]).join(' | ');
    return walk(src, div, div * beatsPerBar, (tok, t) => {
      const c = chordAt(prog, t);
      return tok.split('+').map((d) => rootIn(c.root, oct) + degree(d, c.ivs));
    });
  }

  /**
   * Подушка: звуки каждого аккорда держатся весь его отрезок, каждый — в октаве у `center` (окно center−6 … center+5),
   * поэтому голоса переходят к соседним звукам, а не прыгают за корнем.
   */
  function pad(prog: Prog, center: number, vel = 0.7): Seq {
    const items: NoteEv[] = [];
    for (const c of prog.items) {
      for (const iv of c.ivs) {
        const pc = (c.root + iv) % 12;
        let midi = center - 6 + ((pc - (center - 6)) % 12 + 12) % 12;
        if (midi > center + 5) midi -= 12;
        items.push({ t: c.t, len: c.len, midi, vel });
      }
    }
    return { items, beats: prog.beats };
  }

  /** Барабаны: одна буква — одна клетка, «.» — пусто, пробелы и «|» для глаз. Сильная доля громче слабой. */
  function drums(src: string, div: number): Seq {
    const items: NoteEv[] = [];
    let pos = 0;
    for (const ch of src.replace(/[\s|]/g, '')) {
      const t = pos / div;
      if (ch !== '.') {
        const onBeat = pos % div === 0;
        items.push({ t, len: 1 / div, midi: 0, vel: onBeat ? 0.9 : 0.72, drum: ch });
      }
      pos++;
    }
    if (pos % (div * beatsPerBar) !== 0) throw new Error(`Барабаны: ${pos} клеток — не целое число тактов в «${src.slice(0, 40)}…»`);
    return { items, beats: pos / div };
  }

  return { line, chords, over, pad, drums, beatsPerBar };
}

/**
 * Второй голос по гамме: каждая нота сдвигается на `steps` ступеней лада (−2 — терция вниз, −5 — секста вниз).
 * Нота мимо лада (хроматизм) сдвигается от ближайшей ступени ниже на тот же интервал.
 */
export function harmony(seq: Seq, scale: number[], steps: number, vel = 0.8): Seq {
  const len = scale.length;
  // Ступень лада сквозным номером: октава × len + номер в ладу.
  const midiOfDeg = (d: number): number => Math.floor(d / len) * 12 + scale[((d % len) + len) % len];
  const items = seq.items.map((n) => {
    const pc = n.midi % 12;
    const oct = Math.floor(n.midi / 12);
    let i = -1;
    for (let k = 0; k < len; k++) if (scale[k] <= pc) i = k;
    const deg = i < 0 ? oct * len - 1 : oct * len + i;
    const off = n.midi - midiOfDeg(deg);
    return { ...n, midi: midiOfDeg(deg + steps) + off, vel: n.vel * vel };
  });
  return { items, beats: seq.beats };
}

/** Лад классами высот от тоники: «E» + натуральный минор → [4, 6, 7, 9, 11, 0, 2], отсортированный для harmony. */
export function scaleOf(tonic: string, steps: number[]): number[] {
  const root = PC[tonic[0]] + (tonic[1] === '#' ? 1 : tonic[1] === 'b' ? -1 : 0);
  return steps.map((s) => (root + s + 12) % 12).sort((a, b) => a - b);
}

export const MINOR = [0, 2, 3, 5, 7, 8, 10];
export const MAJOR = [0, 2, 4, 5, 7, 9, 11];
export const DORIAN = [0, 2, 3, 5, 7, 9, 10];
export const HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11];
