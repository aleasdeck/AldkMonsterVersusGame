/**
 * Болота — «Утопленники»: плач в 6/8, соль минор с вязкой доминантой ре мажора. Гобой, хор с закрытым ртом,
 * струнные и контрабас, середину берёт виолончель, колокол под водой.
 * Выбран пользователем из трёх вариантов на странице обсуждения (docs/muzyka.md).
 */
import type { Song } from '../synth';
import { bars, cat, rest, score, span, transpose, under } from '../score';
import { BELL_DEEP, CELLO, CHOIR_U, CONTRABASS, REED, STRINGS } from '../instruments';

/** «Утопленники»: гобой поёт плач в 6/8, контрабас и струнные, хор гудит снизу, середину берёт виолончель. */
export function swampTrack(): Song {
  const m = score(2);
  const A = m.chords('Gm Gm Cm Cm Eb D Gm D');
  const B = m.chords('Eb Eb Bb Bb Cm Cm D D');
  const prog = cat(A, A, B);
  const verse = m.line('D5 - - G4 - - | Bb4 - A4 G4 - - | Eb5 - - C5 - - | G4 - - Eb5 - D5 | Bb4 - - G4 - - | A4 - - F#4 - - | G4 - - - - - | F#4 - - A4 - -', 3);
  const middle = m.line('Eb5 - - G5 - - | Bb5 - - G5 - F5 | F5 - - D5 - - | Bb4 - C5 D5 - - | Eb5 - - G4 - - | C5 - D5 Eb5 - - | D5 - - A4 - - | F#4 - - A4 - -', 3);
  const tune = cat(verse, verse, middle);
  const quiet7 = bars('. . . . . .', 7);
  return {
    id: 'swamp',
    location: 'swamp',
    title: 'Утопленники',
    mood: 'Плач в 6/8: гобой, хор с закрытым ртом, виолончель, колокол под водой',
    key: 'соль минор',
    bpm: 46,
    beatsPerBar: 2,
    meter: '6/8',
    reverb: { size: 0.9, damp: 0.55, wet: 0.35, pre: 30 },
    parts: [
      { name: 'гобой', inst: REED, seq: cat(verse, verse, rest(16)), vol: 0.9, pan: 0.15, rev: 0.4 },
      { name: 'виолончель', inst: CELLO, seq: cat(rest(32), transpose(middle, -12)), vol: 1, pan: -0.1, rev: 0.4 },
      { name: 'хор снизу', inst: CHOIR_U, seq: span(under(tune, prog), 16, 32), vol: 0.6, pan: -0.3, rev: 0.5 },
      { name: 'хор', inst: CHOIR_U, seq: span(m.pad(prog, 55), 16, 48), vol: 0.45, pan: 0, rev: 0.6, spread: 0.5 },
      { name: 'струнные', inst: STRINGS, seq: m.pad(prog, 58), vol: 0.35, pan: 0, rev: 0.5, spread: 0.5 },
      { name: 'контрабас', inst: CONTRABASS, seq: m.over(prog, '1 - - - - -', 3, 2), vol: 0.6, pan: 0, rev: 0.2 },
      { name: 'колокол', inst: BELL_DEEP, seq: cat(m.line(`G3 - - - - - | ${quiet7}`, 3), m.line(`G3 - - - - - | ${quiet7}`, 3), m.line(`Eb3 - - - - - | ${quiet7}`, 3)), vol: 1, pan: -0.25, rev: 0.6 },
      { name: 'барабан', inst: 'drums', seq: m.drums(bars('K...........', 12), 3), vol: 0.45, pan: 0, rev: 0.45 },
    ],
  };
}
