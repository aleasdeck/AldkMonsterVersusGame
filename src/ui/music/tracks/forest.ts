/**
 * Лес — «Охота»: тёмный фолк на лейтмотиве локации (ре гармонический минор): ход вниз от ре к ля, вздох через соль,
 * разрешение через до-диез. Цимбалы, колёсная лира, скрипка с подголоском, рамочные барабаны и тайко.
 * Выбран пользователем из трёх вариантов на странице обсуждения (docs/muzyka.md).
 */
import type { Song } from '../synth';
import { bars, cat, score, span, under } from '../score';
import { DULCIMER, FIDDLE, HURDY, PIZZ } from '../instruments';

const E16 = '................';
/** Лейтмотив: четыре такта на Dm Gm Bb A. */
const MOTIF = 'D5 - - - A4 - C5 - | Bb4 - - A4 G4 - - - | F4 - - G4 F4 - D4 - | E4 - - - C#4 - - -';
/** Его ответ на тех же аккордах: выше и на доминанте. */
const ANSWER = 'D5 - - - A4 - C5 D5 | Bb4 - - - G4 - - - | F4 - - G4 A4 - Bb4 - | A4 - - - - - - -';

/** «Охота»: цимбалы шестнадцатыми, колёсная лира гудит, скрипка ведёт мотив, рамочные барабаны и тайко. */
export function forestTrack(): Song {
  const m = score(4);
  const A = m.chords('Dm Gm Bb A Dm Gm Bb A');
  const B = m.chords('Gm Gm Dm Dm Eb Eb A A');
  const prog = cat(A, A, B);
  const verse = cat(m.line(MOTIF, 2), m.line(ANSWER, 2));
  const middle = m.line('G5 - - - D5 - Bb4 - | D5 - - C5 Bb4 - - - | A4 - - - F4 - A4 - | D5 - - - - - - - | Eb5 - - - G5 - - - | Bb4 - - C5 D5 - Eb5 - | E5 - - - C#5 - - - | A4 - - - - - - -', 2);
  const tune = cat(verse, verse, middle);
  return {
    id: 'forest',
    location: 'forest',
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
