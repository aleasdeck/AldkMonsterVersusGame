/**
 * Склеп — «Некромант»: готическая токката органа в ре миноре — мордент и пассаж вниз, аккорды, потом мелодия
 * на пленуме, педаль, хор, колокол и литавры.
 * Выбран пользователем из трёх вариантов на странице обсуждения (docs/muzyka.md).
 */
import type { Song } from '../synth';
import { bars, cat, rest, score, span } from '../score';
import { BELL, CHOIR_A, ORGAN, ORGAN_FULL, ORGAN_PEDAL } from '../instruments';

const E16 = '................';

/** «Некромант»: токката органа — мордент и пассаж вниз, аккорды, потом мелодия на пленуме, педаль, хор, колокол, литавры. */
export function cryptTrack(): Song {
  const m = score(4);
  const prog = m.chords('Dm A Dm Gm | Dm Gm C F Bb Gm A A | Dm Bb Gm A Dm Bb Eb A');
  const opening = m.line(
    'D6 C6 D6 - - - . . C6 Bb5 A5 G5 F5 - E5 - | C#5 - - - - - . . E5 C#5 A4 E4 C#4 - - - | ' +
      'D3+F3+A3+D4+F4 - - - - - - - - - - - - - - - | G3+Bb3+D4+G4 - - - - - - - - - - - - - . .',
    4,
  );
  const melody = m.line(
    'D5 - - - F5 - A5 - | G5 - - - Bb5 - D6 - | C6 - - - G5 - E5 - | F5 - - - A5 - C6 - | D6 - - - Bb5 - F5 - | G5 - - - D5 - Bb4 - | C#5 - - - E5 - A5 - | A5 - G5 - F5 - E5 - | ' +
      'F5 - - - E5 - D5 - | D5 - - - F5 - Bb5 - | Bb5 - - A5 G5 - D5 - | E5 - - - C#5 - A4 - | A5 - - - F5 - D5 - | F5 - - - D5 - Bb4 - | G5 - - - Eb5 - Bb4 - | C#5 - - - E5 - - -',
    2,
  );
  return {
    id: 'crypt',
    location: 'crypt',
    title: 'Некромант',
    mood: 'Готическая токката органа: пассажи, педаль, хор, колокол и литавры',
    key: 'ре минор',
    bpm: 76,
    beatsPerBar: 4,
    reverb: { size: 0.95, damp: 0.5, wet: 0.38, pre: 40 },
    parts: [
      { name: 'пленум', inst: ORGAN_FULL, seq: cat(opening, melody), vol: 0.85, pan: 0.05, rev: 0.45 },
      { name: 'перебор', inst: ORGAN, seq: span(m.over(prog, "1 5 8 5 3' 5 8 5", 2, 3), 16, 80), vol: 0.45, pan: -0.25, rev: 0.45 },
      { name: 'педаль', inst: ORGAN_PEDAL, seq: m.over(prog, '1 - 5, -', 1, 2), vol: 0.55, pan: 0, rev: 0.4 },
      { name: 'хор', inst: CHOIR_A, seq: span(m.pad(prog, 57), 48, 80), vol: 0.5, pan: 0, rev: 0.6, spread: 0.6 },
      { name: 'колокол', inst: BELL, seq: cat(rest(48), m.line(bars('D4 - - - | . . . . | . . . . | . . . .', 2), 1)), vol: 1, pan: -0.3, rev: 0.6 },
      { name: 'литавры', inst: 'drums', seq: m.drums(bars(E16, 12) + bars('D...............' + E16, 3) + E16 + 'D.D.D.D.DDDDDDDD', 4), vol: 0.4, pan: 0, rev: 0.4 },
    ],
  };
}
