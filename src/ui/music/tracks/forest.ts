/**
 * Лес — три варианта на общем лейтмотиве (ре гармонический минор): ход вниз от ре к ля, вздох через соль,
 * разрешение через до-диез. A — эмбиент чащи, B — оркестровый марш, C — тёмный фолк для охоты.
 */
import type { Song } from '../synth';
import { bars, cat, rest, score, span, transpose, under } from '../score';
import { CELLO, CHOIR_A, CHOIR_U, CONTRABASS, DRONE, DULCIMER, FIDDLE, HARP, HORN, HURDY, LUTE, PIZZ, SHAKU, STRINGS, WHISTLE } from '../instruments';

const E16 = '................';

/** Лейтмотив: четыре такта на Dm Gm Bb A. */
const MOTIF = 'D5 - - - A4 - C5 - | Bb4 - - A4 G4 - - - | F4 - - G4 F4 - D4 - | E4 - - - C#4 - - -';
/** Его ответ на тех же аккордах: выше и на доминанте. */
const ANSWER = 'D5 - - - A4 - C5 D5 | Bb4 - - - G4 - - - | F4 - - G4 A4 - Bb4 - | A4 - - - - - - -';

export function forestTracks(): Song[] {
  return [forestA(), forestB(), forestC()];
}

/** A «Чаща»: гул на ре, лютня перебирает, тёмная флейта с подъездами, порывы ветра и далёкий вой. */
function forestA(): Song {
  const m = score(4);
  const prog = m.chords('Dm Dm Gm Dm | Dm Gm Bb A | Bb Bb Gm Gm | Dm Gm Bb A');
  return {
    id: 'forest-a',
    location: 'forest',
    variant: 'a',
    title: 'Чаща',
    mood: 'Эмбиент: гул, лютня и флейта в тумане, ветер и далёкий вой',
    key: 'ре минор',
    bpm: 60,
    beatsPerBar: 4,
    reverb: { size: 0.9, damp: 0.5, wet: 0.35, pre: 30 },
    echo: { beats: 0.75, fb: 0.35, wet: 0.25, tone: 2000 },
    parts: [
      { name: 'флейта', inst: SHAKU, seq: cat(rest(16), m.line(MOTIF, 2), rest(16), m.line(ANSWER, 2)), vol: 0.9, pan: 0.1, rev: 0.5, echo: 0.3 },
      { name: 'лютня', inst: LUTE, seq: m.over(prog, "1 . 5 8 3' . . .", 2, 3), vol: 1, pan: -0.25, rev: 0.45, echo: 0.25 },
      { name: 'гул', inst: DRONE, seq: m.line(bars('D2+D3 - - -', 16), 1), vol: 0.55, pan: 0, rev: 0.3 },
      { name: 'струнные', inst: STRINGS, seq: span(m.pad(prog, 57), 16, 64), vol: 0.45, pan: 0, rev: 0.5, spread: 0.5 },
      { name: 'хор', inst: CHOIR_U, seq: span(m.pad(prog, 55), 32, 48), vol: 0.5, pan: 0, rev: 0.6, spread: 0.4 },
      { name: 'вой', inst: WHISTLE, seq: cat(rest(36), m.line('A4 - - - - - - - | - - - - . . . .', 2), rest(20)), vol: 0.5, pan: -0.5, rev: 0.7, echo: 0.3 },
      { name: 'сердце', inst: 'drums', seq: m.drums(bars(E16, 4) + bars('F...............' + E16, 6), 4), vol: 0.55, pan: 0, rev: 0.3 },
      { name: 'ветер', inst: 'drums', seq: m.drums(bars('u...............' + E16 + E16 + E16, 4), 4), vol: 0.6, pan: 0, rev: 0.4 },
    ],
  };
}

/** B «Волчья тропа»: виолончель ведёт мотив, струнные и арфа, в середине — валторна, хор и марш тайко. */
function forestB(): Song {
  const m = score(4);
  const prog = m.chords('Dm Gm Bb A | Dm Gm Bb A | Gm Dm Bb F | Gm Dm Eb A');
  const middle = m.line('G4 - - - Bb4 - D5 - | F5 - - E5 D5 - A4 - | Bb4 - - C5 D5 - F5 - | A5 - - - - - G5 F5 | G5 - - - D5 - Bb4 - | A4 - - - F4 - D4 - | G4 - - - Bb4 - Eb5 - | C#5 - - - - - . .', 2);
  const tune = cat(m.line(MOTIF, 2), m.line(ANSWER, 2), middle);
  return {
    id: 'forest-b',
    location: 'forest',
    variant: 'b',
    title: 'Волчья тропа',
    mood: 'Оркестр: виолончель, струнные и арфа, в середине валторна, хор и марш',
    key: 'ре минор',
    bpm: 66,
    beatsPerBar: 4,
    reverb: { size: 0.85, damp: 0.45, wet: 0.3, pre: 25 },
    parts: [
      { name: 'виолончель', inst: CELLO, seq: transpose(tune, -12), vol: 1, pan: -0.1, rev: 0.35 },
      { name: 'валторна', inst: HORN, seq: span(tune, 32, 64), vol: 0.9, pan: 0.25, rev: 0.5 },
      { name: 'струнные', inst: STRINGS, seq: m.pad(prog, 60), vol: 0.5, pan: 0, rev: 0.5, spread: 0.6 },
      { name: 'контрабас', inst: CONTRABASS, seq: m.over(prog, '1 - - - 5, - - -', 2, 2), vol: 0.75, pan: 0, rev: 0.2 },
      { name: 'арфа', inst: HARP, seq: span(m.over(prog, "1 5 8 5 3' 5 8 5", 2, 3), 0, 32), vol: 0.8, pan: 0.3, rev: 0.4 },
      { name: 'хор', inst: CHOIR_A, seq: span(m.pad(prog, 55), 32, 64), vol: 0.55, pan: 0, rev: 0.6, spread: 0.5 },
      { name: 'литавры', inst: 'drums', seq: m.drums(bars('D...............' + E16 + E16 + E16, 1) + bars('D...............' + E16, 1) + E16 + 'D...D...D.D.DDDD' + bars(E16, 8), 4), vol: 0.6, pan: 0, rev: 0.35 },
      { name: 'тайко', inst: 'drums', seq: m.drums(bars(E16, 8) + bars('K.......K.......', 7) + 'K.......K.K.K.K.', 4), vol: 0.45, pan: 0, rev: 0.35 },
    ],
  };
}

/** C «Охота»: цимбалы шестнадцатыми, колёсная лира гудит, скрипка ведёт мотив, рамочные барабаны и тайко. */
function forestC(): Song {
  const m = score(4);
  const A = m.chords('Dm Gm Bb A Dm Gm Bb A');
  const B = m.chords('Gm Gm Dm Dm Eb Eb A A');
  const prog = cat(A, A, B);
  const verse = cat(m.line(MOTIF, 2), m.line(ANSWER, 2));
  const middle = m.line('G5 - - - D5 - Bb4 - | D5 - - C5 Bb4 - - - | A4 - - - F4 - A4 - | D5 - - - - - - - | Eb5 - - - G5 - - - | Bb4 - - C5 D5 - Eb5 - | E5 - - - C#5 - - - | A4 - - - - - - -', 2);
  const tune = cat(verse, verse, middle);
  return {
    id: 'forest-c',
    location: 'forest',
    variant: 'c',
    title: 'Охота',
    mood: 'Тёмный фолк: цимбалы, колёсная лира, скрипка, рамочные барабаны',
    key: 'ре минор',
    bpm: 100,
    beatsPerBar: 4,
    reverb: { size: 0.6, damp: 0.5, wet: 0.22, pre: 15 },
    parts: [
      { name: 'скрипка', inst: FIDDLE, seq: tune, vol: 0.9, pan: 0.15, rev: 0.3 },
      { name: 'вторая скрипка', inst: FIDDLE, seq: span(under(tune, prog), 32, 96), vol: 0.5, pan: -0.35, rev: 0.3 },
      { name: 'цимбалы', inst: DULCIMER, seq: m.over(prog, "1 5 8 5 3' 5 8 5 1 5 8 5 4' 5 8 5", 4, 3), vol: 0.7, pan: -0.2, rev: 0.25 },
      { name: 'лира', inst: HURDY, seq: cat(m.line(bars('D3 - - -', 16), 1), m.over(B, '1+5 - - -', 1, 3)), vol: 0.45, pan: 0.1, rev: 0.25 },
      { name: 'бас', inst: PIZZ, seq: m.over(prog, '1 . 1 5, 1 . 5, .', 2, 2), vol: 1, pan: 0, rev: 0.15 },
      { name: 'рамочный', inst: 'drums', seq: m.drums(bars('F..F..F.F...F.F.', 24), 4), vol: 0.35, pan: 0, rev: 0.2 },
      { name: 'тайко', inst: 'drums', seq: m.drums(bars(E16, 8) + bars('K.......K.......', 16), 4), vol: 0.6, pan: 0, rev: 0.3 },
      { name: 'цепи', inst: 'drums', seq: m.drums(bars(E16, 16) + bars('....z.......z...', 8), 4), vol: 0.8, pan: 0, rev: 0.3 },
    ],
  };
}
