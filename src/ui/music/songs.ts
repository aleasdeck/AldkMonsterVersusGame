/**
 * Шесть треков — по одному на локацию (docs/muzyka.md). Каждый — бесшовная петля 45–75 с: куплет A, его повтор A' с
 * развитием, середина B и возврат к началу. Мелодии записаны нотами, гармония — аккордами по тактам, бас, арпеджио
 * и аккомпанемент — ступенями аккорда, второй голос — `under` (звук аккорда под мелодией).
 * Сильные доли мелодии стоят на звуках аккорда; проходящие и задержания — на слабых.
 */
import type { LocationId } from '../../engine/types';
import { cat, rest, score, under, type Seq } from './score';
import type { Song } from './synth';
import {
  ACCORDION,
  BELL,
  CHIP,
  CHOIR,
  CLARINET,
  FIDDLE,
  FLUTE,
  FM_BASS,
  FOG,
  GROWL,
  GUITAR,
  HARP,
  HARPSICHORD,
  KALIMBA,
  LEAD,
  MIRE_BASS,
  ORGAN,
  PIZZ,
  STRINGS,
  TUBA,
  WASP,
  XYLO,
} from './instruments';

/** Рисунок такта n раз — через черту такта (у барабанов черта и пробелы ничего не значат). */
function bars(pattern: string, n: number): string {
  return Array.from({ length: n }, () => pattern).join(' | ');
}

/** Только ноты от `from` до `to` доли: партия вступает и молчит на своих частях, длина трека прежняя. */
function span(seq: Seq, from: number, to: number): Seq {
  return { items: seq.items.filter((n) => n.t >= from - 1e-9 && n.t < to - 1e-9), beats: seq.beats };
}

/** Без нот от `from` до `to` доли: партия смолкает на одну часть. */
function mute(seq: Seq, from: number, to: number): Seq {
  return { items: seq.items.filter((n) => n.t < from - 1e-9 || n.t >= to - 1e-9), beats: seq.beats };
}

/** Пустой такт барабанов на 16 клеток. */
const EMPTY16 = '................';

// ═══ Лес — «Тропа через чащу» ═══════════════════════════════════════════
// Ми минор, 112, лёгкий свинг. Флейта ведёт, арфа перебирает, FM-бас пружинит; шейкер и римшот в куплете,
// малый барабан и тарелка в середине. Второй голос флейты — со второго куплета.

function forest(): Song {
  const m = score(4);
  const A = m.chords('Em C G D Em C Am B7');
  const B = m.chords('C D G Em Am D B7 B7');
  const prog = cat(A, A, B, A);
  const head = 'E5 - - B4 E5 F#5 G5 A5 | G5 - E5 - C5 - - - | D5 - - B4 G4 - B4 D5 | F#5 - E5 D5 A4 - - - | E5 - - B4 E5 F#5 G5 B5 | C6 - B5 - G5 - E5 - | A5 - - G5 E5 - C5 - |';
  const a1 = m.line(`${head} F#5 - D#5 - B4 - - -`, 2);
  const a2 = m.line(`${head} F#5 - - - A5 - B5 -`, 2);
  const b = m.line('G5 - - - E5 - C6 - | A5 - - F#5 D5 - F#5 - | G5 - - - B5 - D6 - | E6 - - - B5 - G5 - | C6 - - B5 A5 - E5 - | F#5 - - G5 A5 - D6 - | D#6 - - - B5 - F#5 - | A5 - - - F#5 - D#5 -', 2);
  const tune = cat(a1, a2, b, a1);
  const bassA = '1 - . 1 5 - 8 .';
  const bassB = '1 - - 5 8 - 5 -';
  return {
    id: 'forest',
    title: 'Тропа через чащу',
    bpm: 112,
    beatsPerBar: 4,
    swing: 0.08,
    echo: { beats: 0.75, fb: 0.32, wet: 0.3, tone: 2600 },
    parts: [
      { name: 'флейта', inst: FLUTE, seq: tune, vol: 0.95, pan: 0.12, echo: 0.35 },
      { name: 'вторая флейта', inst: FLUTE, seq: span(under(tune, prog), 32, 128), vol: 0.42, pan: -0.32, echo: 0.3 },
      { name: 'арфа', inst: HARP, seq: m.over(prog, "1 5 8 3' 5' 3' 8 5", 2, 3), vol: 0.5, pan: -0.2, echo: 0.25 },
      { name: 'бас', inst: FM_BASS, seq: cat(m.over(cat(A, A), bassA, 2, 2), m.over(B, bassB, 2, 2), m.over(A, bassA, 2, 2)), vol: 0.75, pan: 0, echo: 0 },
      { name: 'струнные', inst: STRINGS, seq: span(m.pad(prog, 62), 32, 96), vol: 0.55, pan: 0.25, echo: 0.2 },
      { name: 'бочка', inst: 'drums', seq: m.drums(bars('k.......k.k.....', 32), 4), vol: 0.6, pan: 0, echo: 0 },
      {
        name: 'малый',
        inst: 'drums',
        seq: m.drums(bars('....r.......r...', 16) + bars('....s.......s...', 8) + bars('....r.......r...', 8), 4),
        vol: 0.7,
        pan: 0,
        echo: 0.1,
      },
      {
        name: 'шейкер',
        inst: 'drums',
        seq: m.drums(bars('..p...p...p...p.', 16) + bars('h.h.h.h.h.h.h.h.', 8) + bars('..p...p...p...p.', 8), 4),
        vol: 0.85,
        pan: 0,
        echo: 0,
      },
      {
        name: 'сбивки',
        inst: 'drums',
        seq: m.drums(bars(EMPTY16, 15) + '........y.y.t.T.' + 'c...............' + bars(EMPTY16, 14) + '........y.y.t.T.', 4),
        vol: 0.5,
        pan: 0,
        echo: 0.15,
      },
    ],
  };
}

// ═══ Болота — «Топь» ════════════════════════════════════════════════════
// Ре дорийский, 80, ленивый свинг. Кларнет с подъездами, полый бас, калимба на слабых долях, туман аккордов;
// капли и кваканье вместо тарелок, длинное мутное эхо.

function swamp(): Song {
  const m = score(4);
  const A = m.chords('Dm G Dm G Bb C Dm A7');
  const B = m.chords('Gm Dm Gm Dm Bb A7 Dm A7');
  const prog = cat(A, A, B);
  const head = '. . A4 - D5 - - - | B4 - - A4 G4 - - - | . . F4 G4 A4 - F4 - | D4 - - - - - . . | . . D5 - F5 - D5 - | E5 - - D5 C5 - G4 - |';
  const a1 = m.line(`${head} A4 - - - - - F4 - | E4 - - - C#4 - - .`, 2);
  const a2 = m.line(`${head} A4 - - G4 F4 - E4 - | A4 - - - - - . .`, 2);
  const b = m.line('D5 - - - Bb4 - G4 - | A4 - - - F4 - D4 - | G4 - - A4 Bb4 - D5 - | F5 - - E5 D5 - - - | D5 - - C5 Bb4 - F4 - | E5 - - - C#5 - A4 - | D5 - - - F5 - - - | E5 - - - - - . .', 2);
  const tune = cat(a1, a2, b);
  return {
    id: 'swamp',
    title: 'Топь',
    bpm: 80,
    beatsPerBar: 4,
    swing: 0.16,
    echo: { beats: 1, fb: 0.42, wet: 0.36, tone: 1700 },
    parts: [
      { name: 'кларнет', inst: CLARINET, seq: tune, vol: 1, pan: 0.08, echo: 0.4 },
      { name: 'калимба', inst: KALIMBA, seq: m.over(prog, ". 5 . 8 . 5 . 3'", 2, 4), vol: 0.65, pan: -0.35, echo: 0.45 },
      { name: 'вторая калимба', inst: KALIMBA, seq: span(under(tune, prog, 3, 9, 0.7), 32, 96), vol: 0.6, pan: 0.4, echo: 0.4 },
      { name: 'бас', inst: MIRE_BASS, seq: m.over(prog, '1 - - 5, 1 - . 8', 2, 2), vol: 0.6, pan: 0, echo: 0 },
      { name: 'туман', inst: FOG, seq: m.pad(prog, 57), vol: 0.7, pan: 0, echo: 0.3 },
      { name: 'бочка', inst: 'drums', seq: m.drums(bars('k.........k.....', 24), 4), vol: 0.55, pan: 0, echo: 0 },
      { name: 'римшот', inst: 'drums', seq: m.drums(bars('........r.......', 24), 4), vol: 0.6, pan: 0, echo: 0.25 },
      { name: 'шейкер', inst: 'drums', seq: m.drums(bars(EMPTY16, 8) + bars('..p...p...p...p.', 16), 4), vol: 0.7, pan: 0, echo: 0 },
      { name: 'топь', inst: 'drums', seq: m.drums(bars('......d.........' + '............f...', 12), 4), vol: 0.6, pan: 0, echo: 0.35 },
      { name: 'томы', inst: 'drums', seq: m.drums(bars(EMPTY16, 15) + '........T...T.T.' + bars(EMPTY16, 7) + '........T...T.T.', 4), vol: 0.45, pan: 0, echo: 0.3 },
    ],
  };
}

// ═══ Осквернённый улей — «Рой» ══════════════════════════════════════════
// Ми фригийский с гармоническим минором, 140. Жужжащая пила с частым вибрато, чиповое арпеджио шестнадцатыми
// с педалью на корне, рычащий FM-бас восьмыми, щелчки хитина поверх тарелок; хор и второй голос — в середине.

function hive(): Song {
  const m = score(4);
  const A = m.chords('Em F Em F Am G F B');
  const B = m.chords('Am Em Am B C G F B');
  const prog = cat(A, A, B, B);
  const headA = 'E5 - F5 E5 D#5 E5 B4 - | F5 - - - C5 - A4 - | E5 - F5 E5 D#5 E5 G5 - | A5 - - - - - . . | C6 - B5 A5 G#5 A5 E5 - | D6 - - - B5 - G5 - | C6 - - - A5 - F5 - |';
  const headB = 'E5 - - - - - A5 - | G5 - - - - - B5 - | C6 - - - B5 - A5 - | F#5 - - - - - D#5 - | E5 - - - G5 - C6 - | D6 - - - B5 - G5 - | A5 - - - C6 - F5 - |';
  const tune = cat(
    m.line(`${headA} F#5 - - - D#5 - B4 -`, 2),
    m.line(`${headA} B4 - D#5 - F#5 - A5 -`, 2),
    m.line(`${headB} D#5 - - - F#5 - - -`, 2),
    m.line(`${headB} D#5 - - - B4 - . .`, 2),
  );
  return {
    id: 'hive',
    title: 'Рой',
    bpm: 140,
    beatsPerBar: 4,
    echo: { beats: 0.75, fb: 0.28, wet: 0.24, tone: 2400 },
    parts: [
      { name: 'оса', inst: WASP, seq: tune, vol: 1.15, pan: 0.1, echo: 0.3 },
      { name: 'вторая оса', inst: WASP, seq: span(under(tune, prog), 96, 128), vol: 0.45, pan: -0.35, echo: 0.3 },
      { name: 'арпеджио', inst: CHIP, seq: m.over(prog, "8 1 5 1 3' 1 5 1 8 1 5 1 3' 1 5 1", 4, 3), vol: 0.55, pan: -0.25, echo: 0.2 },
      { name: 'бас', inst: GROWL, seq: m.over(prog, '1! 1 8 1 1! 1 8 1', 2, 2), vol: 0.5, pan: 0, echo: 0 },
      { name: 'гул', inst: FOG, seq: m.pad(prog, 52), vol: 0.45, pan: 0, echo: 0.2 },
      { name: 'хор', inst: CHOIR, seq: span(m.pad(prog, 64), 64, 128), vol: 0.5, pan: 0.3, echo: 0.3 },
      { name: 'бочка', inst: 'drums', seq: m.drums(bars('k.....k...k.....', 32), 4), vol: 0.45, pan: 0, echo: 0 },
      { name: 'малый', inst: 'drums', seq: m.drums(bars(EMPTY16, 8) + bars('....s.......s...', 24), 4), vol: 0.5, pan: 0, echo: 0.1 },
      { name: 'тарелки', inst: 'drums', seq: m.drums(bars('h.hhh.hhh.hhh.hh', 32), 4), vol: 0.6, pan: 0, echo: 0 },
      { name: 'хитин', inst: 'drums', seq: m.drums(bars('..i.....i.i...i.', 32), 4), vol: 0.55, pan: 0, echo: 0.3 },
      { name: 'сбивки', inst: 'drums', seq: m.drums(bars(EMPTY16, 16) + 'c...............' + bars(EMPTY16, 14) + '........t.t.y.yy', 4), vol: 0.5, pan: 0, echo: 0.1 },
    ],
  };
}

// ═══ Пиратский корабль — «Под чёрным флагом» ════════════════════════════
// Ля минор, 6/8 (две доли с точкой по три восьмых), 72. Аккордеон ведёт морскую песню, туба на сильных долях,
// аккордеон потише отвечает аккордами «па-па»; топот и хлопки, бубен, скрипка вторым голосом, накат волн.

function ship(): Song {
  const m = score(2);
  const A = m.chords('Am G Am E7 Am G F_E7 Am');
  const B = m.chords('C G Am Em F C Dm_E7 Am');
  const prog = cat(A, A, B, A);
  const headA = 'E5 - - A5 - E5 | D5 - B4 G4 - B4 | C5 - E5 A5 - G5 | E5 - D5 B4 - G#4 | A4 - - C5 - E5 | D5 - - B4 - D5 | C5 - A4 B4 - G#4 |';
  const a1 = m.line(`${headA} A4 - - - - .`, 3);
  const a2 = m.line(`${headA} A4 - - C5 - E5`, 3);
  const b = m.line('G5 - E5 C5 - E5 | B4 - D5 G5 - D5 | C6 - B5 A5 - E5 | G5 - - E5 - - | A5 - G5 F5 - C5 | E5 - D5 C5 - G4 | F5 - - E5 - D5 | C5 - - A4 - -', 3);
  const tune = cat(a1, a2, b, a1);
  const stab = { ...ACCORDION, env: { a: 0.01, d: 0.12, s: 0.4, r: 0.05 }, gain: 0.24 };
  const waves = bars('w..... | ...... | ...... | ......', 2);
  const quiet = bars('......', 16);
  return {
    id: 'ship',
    title: 'Под чёрным флагом',
    bpm: 72,
    beatsPerBar: 2,
    echo: { beats: 0.5, fb: 0.3, wet: 0.25, tone: 2500 },
    parts: [
      { name: 'аккордеон', inst: ACCORDION, seq: tune, vol: 0.9, pan: 0.1, echo: 0.3 },
      { name: 'скрипка', inst: FIDDLE, seq: span(under(tune, prog), 16, 48), vol: 0.6, pan: -0.35, echo: 0.3 },
      { name: 'па-па', inst: stab, seq: m.over(prog, '. 3+5+8? 3+5+8? . 3+5+8? 3+5+8?', 3, 3), vol: 0.55, pan: -0.15, echo: 0.15 },
      { name: 'туба', inst: TUBA, seq: m.over(prog, '1 - - 5, - -', 3, 2), vol: 0.65, pan: 0, echo: 0 },
      { name: 'топот', inst: 'drums', seq: m.drums(bars('k.....', 32), 3), vol: 0.6, pan: 0, echo: 0 },
      { name: 'хлопки', inst: 'drums', seq: m.drums(bars('...x..', 32), 3), vol: 0.6, pan: 0, echo: 0.15 },
      { name: 'бубен', inst: 'drums', seq: m.drums(bars('......', 8) + bars('.jj.jj', 24), 3), vol: 0.7, pan: 0, echo: 0 },
      { name: 'волны', inst: 'drums', seq: m.drums(waves + quiet + waves, 3), vol: 0.7, pan: 0, echo: 0 },
      { name: 'сбивки', inst: 'drums', seq: m.drums(bars('......', 15) + 'tty.TT' + 'c.....' + bars('......', 15), 3), vol: 0.5, pan: 0, echo: 0.15 },
    ],
  };
}

// ═══ Пещеры огня — «Пекло» ══════════════════════════════════════════════
// Ре минор с фригийским ми-бемолем, 132. Перегруженная гитара квинтами «галопом», бас в унисон, резкий лид
// с подъездами; первый куплет — только рифф и хор, наковальня и второй голос — к концу.

function caves(): Song {
  const m = score(4);
  const A = m.chords('Dm Dm Eb Dm Dm Bb C A');
  const B = m.chords('Gm Dm Bb A Gm Dm Eb A');
  const prog = cat(A, A, B, B);
  const a = m.line('A4 - D5 - - - E5 F5 | E5 - D5 - - - . . | G5 - - F5 Eb5 - D5 - | D5 - - - - - . . | A5 - - G5 F5 - E5 F5 | D6 - - - Bb5 - F5 - | E5 - - F5 G5 - C6 - | C#6 - - - - - . .', 2);
  const b = m.line('Bb5 - - A5 G5 - D5 - | F5 - - - - - A5 - | D6 - - C6 Bb5 - F5 - | E5 - - - C#5 - - - | G5 - - - Bb5 - D6 - | F6 - - E6 D6 - A5 - | G5 - - - Eb5 - Bb4 - | C#5 - - - E5 - A5 -', 2);
  const tune = cat(rest(32), a, b, b);
  const gallop = "1+5+8! . 1+5+8 1+5+8 1+5+8! . 1+5+8 1+5+8 1+5+8! . 1+5+8 1+5+8 1+5+8! . 1+5+8 1+5+8";
  const crash = 'c...............' + bars(EMPTY16, 7);
  return {
    id: 'caves',
    title: 'Пекло',
    bpm: 132,
    beatsPerBar: 4,
    echo: { beats: 0.5, fb: 0.25, wet: 0.2, tone: 2200 },
    parts: [
      { name: 'лид', inst: LEAD, seq: tune, vol: 1.05, pan: 0.1, echo: 0.3 },
      { name: 'второй лид', inst: LEAD, seq: span(under(tune, prog), 96, 128), vol: 0.45, pan: -0.35, echo: 0.25 },
      { name: 'гитара', inst: GUITAR, seq: m.over(prog, gallop, 4, 3), vol: 0.7, pan: -0.2, echo: 0 },
      { name: 'бас', inst: FM_BASS, seq: m.over(prog, '1! . 1 1 1! . 1 1 1! . 1 1 1! . 1 1', 4, 2), vol: 0.7, pan: 0, echo: 0 },
      { name: 'хор', inst: CHOIR, seq: mute(m.pad(prog, 57), 32, 64), vol: 0.55, pan: 0.3, echo: 0.3 },
      { name: 'бочка', inst: 'drums', seq: m.drums(bars('k...k...k...k...', 8) + bars('k.kkk.kkk.kkk.kk', 24), 4), vol: 0.4, pan: 0, echo: 0 },
      { name: 'малый', inst: 'drums', seq: m.drums(bars('....s.......s...', 32), 4), vol: 0.55, pan: 0, echo: 0.1 },
      { name: 'тарелки', inst: 'drums', seq: m.drums(bars('h.h.h.h.h.h.h.ho', 32), 4), vol: 0.9, pan: 0, echo: 0 },
      { name: 'крэш', inst: 'drums', seq: m.drums(bars(crash, 4), 4), vol: 0.7, pan: 0, echo: 0.1 },
      { name: 'наковальня', inst: 'drums', seq: m.drums(bars(EMPTY16, 16) + bars('..............a.' + EMPTY16, 8), 4), vol: 0.5, pan: 0, echo: 0.35 },
      { name: 'сбивки', inst: 'drums', seq: m.drums(bars(EMPTY16, 15) + '........y.y.t.T.' + bars(EMPTY16, 15) + '........y.y.t.T.', 4), vol: 0.55, pan: 0, echo: 0.1 },
    ],
  };
}

// ═══ Склеп — «Пляска костей» ════════════════════════════════════════════
// До минор, вальс 3/4, 120. Мелодию ведёт ксилофон — стук костей, во втором куплете её берёт орган, а кости
// отвечают снизу; клавесин «па-па» на второй и третьей долях, пиццикато в басу, хор и литавры в середине,
// колокол отбивает начало куплета.

function crypt(): Song {
  const m = score(3);
  const A = m.chords('Cm G7 Cm G7 Cm Fm G7 Cm');
  const B = m.chords('Ab Eb Fm Cm Ab Fm Db G7');
  const prog = cat(A, A, B, A);
  const a = m.line('G4 - C5 - Eb5 - | D5 - - - B4 - | C5 - Eb5 - G5 - | F5 - - - D5 - | Eb5 F5 G5 - C6 - | Ab5 - - G5 F5 - | D5 - F5 - B4 - | C5 - - - . .', 2);
  const b = m.line('C5 - - - Eb5 - | G5 - - - Bb4 - | Ab5 - - G5 F5 - | Eb5 - - - - - | C6 - - Bb5 Ab5 - | Ab5 - - - F5 - | F5 - - - Ab5 - | G5 - - - B4 -', 2);
  const tune = cat(a, a, b, a);
  const toll = m.line(bars('C4 - - - - - | . . . . . . | . . . . . . | . . . . . .', 2), 2);
  return {
    id: 'crypt',
    title: 'Пляска костей',
    bpm: 120,
    beatsPerBar: 3,
    echo: { beats: 1, fb: 0.36, wet: 0.3, tone: 2000 },
    parts: [
      { name: 'кости', inst: XYLO, seq: cat(a, rest(48), a), vol: 0.9, pan: 0.1, echo: 0.3 },
      { name: 'орган', inst: ORGAN, seq: span(tune, 24, 72), vol: 0.75, pan: 0.05, echo: 0.3 },
      { name: 'кости снизу', inst: XYLO, seq: span(under(tune, prog), 24, 48), vol: 0.5, pan: -0.35, echo: 0.25 },
      { name: 'клавесин', inst: HARPSICHORD, seq: m.over(prog, '. 3+5+8 3+5+8', 1, 3), vol: 0.4, pan: -0.2, echo: 0.2 },
      { name: 'пиццикато', inst: PIZZ, seq: m.over(prog, '1 . . | 5, . .', 1, 2), vol: 0.75, pan: 0, echo: 0.1 },
      { name: 'хор', inst: CHOIR, seq: span(m.pad(prog, 60), 48, 72), vol: 0.6, pan: 0.3, echo: 0.35 },
      { name: 'колокол', inst: BELL, seq: cat(toll, rest(48), toll), vol: 0.6, pan: -0.1, echo: 0.4 },
      { name: 'литавры', inst: 'drums', seq: m.drums(bars('......', 16) + bars('G..... | g.....', 4) + bars('......', 7) + 'G...G.', 2), vol: 0.22, pan: 0, echo: 0.2 },
      { name: 'стук', inst: 'drums', seq: m.drums(bars('..r.r.', 8) + bars('......', 16) + bars('..r.r.', 8), 2), vol: 0.3, pan: 0, echo: 0.2 },
    ],
  };
}

/** Трек каждой локации. Собираются один раз: разбор нот дешёвый, а звук рендерит воркер по запросу. */
export const SONGS: Record<LocationId, Song> = {
  forest: forest(),
  swamp: swamp(),
  hive: hive(),
  ship: ship(),
  caves: caves(),
  crypt: crypt(),
};
