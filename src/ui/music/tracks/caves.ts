/**
 * Пещеры огня — «Демон»: дум в до миноре — перегруженный рифф с тритоном, бас в унисон, в середине орган,
 * хор и плачущий лид.
 * Выбран пользователем из трёх вариантов на странице обсуждения (docs/muzyka.md).
 */
import type { Song } from '../synth';
import { bars, cat, rest, score, span } from '../score';
import { CHOIR_A, DOOM_GUITAR, GROWL, ORGAN, WAIL } from '../instruments';

const E16 = '................';

/** «Демон»: дум-рифф с тритоном на перегруженной гитаре, бас, в середине орган, хор и плачущий лид. */
export function cavesTrack(): Song {
  const m = score(4);
  const B = m.chords('Ab Ab Gm Gm Fm Fm G G');
  const prog = cat(m.chords('Cm Cm Cm Cm Cm Cm Cm Cm'), B);
  const riff = bars('C3+G3+C4! - - - - - Eb3+Bb3! - | F#3+C#4! - - - F3+C4 - Eb3+Bb3 -', 4);
  const bassRiff = bars('C2 - - - - - Eb2 - | F#2 - - - F2 - Eb2 -', 4);
  const lead = m.line('C5 - - - Eb5 - - - | Ab4 - - - - - G4 - | Bb4 - - - D5 - - - | G4 - - - - - . . | Ab4 - - - C5 - - - | F5 - - Eb5 C5 - - - | B4 - - - D5 - - - | F#4 - - - G4 - - -', 2);
  const crash = 'c...............' + bars(E16, 7);
  const fill = bars(E16, 7) + '........y.y.t.T.';
  return {
    id: 'caves',
    location: 'caves',
    title: 'Демон',
    mood: 'Дум: перегруженный рифф с тритоном, бас, орган и хор, плачущий лид',
    key: 'до минор',
    bpm: 66,
    beatsPerBar: 4,
    reverb: { size: 0.7, damp: 0.5, wet: 0.22, pre: 15 },
    parts: [
      { name: 'лид', inst: WAIL, seq: cat(rest(32), lead), vol: 1.1, pan: 0.15, rev: 0.4 },
      { name: 'гитара', inst: DOOM_GUITAR, seq: cat(m.line(riff, 2), m.over(B, '1+5+8! - - - . 1+5+8 1+5+8 .', 2, 2)), vol: 0.55, pan: -0.15, rev: 0.2 },
      { name: 'бас', inst: GROWL, seq: cat(m.line(bassRiff, 2), m.over(B, '1 - - - . 1 1 .', 2, 1)), vol: 0.6, pan: 0, rev: 0.1 },
      { name: 'орган', inst: ORGAN, seq: span(m.pad(prog, 60), 32, 64), vol: 0.5, pan: 0.2, rev: 0.45, spread: 0.5 },
      { name: 'хор', inst: CHOIR_A, seq: span(m.pad(prog, 55), 32, 64), vol: 0.45, pan: -0.1, rev: 0.55, spread: 0.5 },
      { name: 'бочка', inst: 'drums', seq: m.drums(bars('k.......k.k.....', 16), 4), vol: 0.8, pan: 0 },
      { name: 'малый', inst: 'drums', seq: m.drums(bars('........s.......', 16), 4), vol: 0.7, pan: 0, rev: 0.3 },
      { name: 'тарелка', inst: 'drums', seq: m.drums(bars('o...o...o...o...', 16), 4), vol: 1.3, pan: 0, rev: 0.2 },
      { name: 'крэш', inst: 'drums', seq: m.drums(bars(crash, 2), 4), vol: 1.4, pan: 0, rev: 0.3 },
      { name: 'сбивки', inst: 'drums', seq: m.drums(bars(fill, 2), 4), vol: 0.6, pan: 0, rev: 0.2 },
    ],
  };
}
