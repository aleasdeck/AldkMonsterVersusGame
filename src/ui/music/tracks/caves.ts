/**
 * Пещеры огня — фригийский лад с большой терцией (до, ре-бемоль, ми): восточный, ритуальный, адский. A — эмбиент пекла:
 * гул, распев и дудук, B — обряд культа: распев на один слог и тайко, C — демон: дум-рифф с тритоном и орган.
 */
import type { Song } from '../synth';
import { bars, cat, rest, score, span } from '../score';
import { CHANT, CHOIR_A, CHOIR_O, DOOM_GUITAR, DRONE, DUDUK, GROWL, HORN, LOW_BRASS, ORGAN, SUB, WAIL } from '../instruments';

const E16 = '................';

export function cavesTracks(): Song[] {
  return [cavesA(), cavesB(), cavesC()];
}

/** A «Пекло»: гул и саб на до, мужской хор тянет «о», дудук ведёт мотив, гул лавы, далёкая наковальня, гонг. */
function cavesA(): Song {
  const m = score(4);
  const phrase1 = m.line('C4 - - Db4 E4 - - - | F4 - - E4 Db4 - C4 - | Ab4 - - - F4 - - - | Db4 - - - C4 - - -', 2);
  const phrase2 = m.line('Bb3 - - - Db4 - F4 - | E4 - - - Db4 - - - | C4 - - - - - - - | G3 - - - - - . .', 2);
  return {
    id: 'caves-a',
    location: 'caves',
    variant: 'a',
    title: 'Пекло',
    mood: 'Эмбиент: гул и хор на одной ноте, дудук, гул лавы, далёкая наковальня',
    key: 'до, фригийский с большой терцией',
    bpm: 56,
    beatsPerBar: 4,
    reverb: { size: 0.9, damp: 0.6, wet: 0.38, pre: 30 },
    echo: { beats: 0.75, fb: 0.4, wet: 0.2, tone: 1200 },
    parts: [
      { name: 'дудук', inst: DUDUK, seq: cat(rest(16), phrase1, phrase2, rest(8)), vol: 0.9, pan: 0.1, rev: 0.45, echo: 0.3 },
      { name: 'хор', inst: CHOIR_O, seq: m.line(`${bars('C3+G3 - - - | - - - - | . . . . | . . . .', 3)} | C3+G3 - - - | - - - -`, 1), vol: 0.5, pan: 0, rev: 0.6, spread: 0.4 },
      { name: 'гул', inst: DRONE, seq: m.line(bars('C2+G2 - - -', 14), 1), vol: 0.5, pan: 0, rev: 0.3 },
      { name: 'саб', inst: SUB, seq: m.line(bars('C2 - - -', 14), 1), vol: 0.4, pan: 0 },
      { name: 'лава', inst: 'drums', seq: m.drums(bars('q...............' + E16, 7), 4), vol: 0.45, pan: 0, rev: 0.3 },
      { name: 'наковальня', inst: 'drums', seq: m.drums(bars('........a.......' + E16 + E16 + E16, 3) + E16 + E16, 4), vol: 1.2, pan: 0, rev: 0.6, echo: 0.4 },
      { name: 'гонг', inst: 'drums', seq: m.drums('N...............' + bars(E16, 6) + 'N...............' + bars(E16, 6), 4), vol: 0.6, pan: 0, rev: 0.5 },
    ],
  };
}

/** B «Культ»: распев на один слог по корню аккорда, тайко и рамочные барабаны, дудук, потом валторна, хор и гонг. */
function cavesB(): Song {
  const m = score(4);
  const A = m.chords('Dm Dm Eb Dm Dm Bb Eb Dm');
  const B = m.chords('Gm Gm Eb Eb Cm Cm A A');
  const prog = cat(A, A, B);
  const duduk = m.line('D4 - - Eb4 F4 - - - | A4 - - G4 F4 - Eb4 - | G4 - - - Bb4 - - - | A4 - - - - - - - | D5 - - C5 A4 - - - | Bb4 - - - F4 - - - | Eb4 - - - G4 - - - | D4 - - - - - . .', 2);
  const horn = m.line('D4 - - - G4 - - - | Bb4 - - A4 G4 - - - | G4 - - - Bb4 - - - | Eb5 - - - D5 - - - | C5 - - - Eb5 - - - | G4 - - - - - . . | A4 - - - C#5 - - - | E5 - - - - - . .', 2);
  return {
    id: 'caves-b',
    location: 'caves',
    variant: 'b',
    title: 'Культ',
    mood: 'Обряд: мужской распев на один слог, тайко, дудук, валторна и хор',
    key: 'ре фригийский',
    bpm: 92,
    beatsPerBar: 4,
    reverb: { size: 0.75, damp: 0.5, wet: 0.28, pre: 20 },
    parts: [
      { name: 'распев', inst: CHANT, seq: m.over(prog, '1! - 1 . 1 - b2 1', 2, 3), vol: 0.75, pan: 0, rev: 0.4, spread: 0 },
      { name: 'дудук', inst: DUDUK, seq: cat(rest(32), duduk, rest(32)), vol: 0.9, pan: 0.15, rev: 0.4 },
      { name: 'валторна', inst: HORN, seq: cat(rest(64), horn), vol: 1.2, pan: 0.15, rev: 0.45 },
      { name: 'медь', inst: LOW_BRASS, seq: m.over(prog, '1 - - - - - - -', 2, 2), vol: 0.5, pan: 0, rev: 0.3 },
      { name: 'хор', inst: CHOIR_A, seq: span(m.pad(prog, 57), 64, 96), vol: 0.5, pan: 0, rev: 0.55, spread: 0.5 },
      { name: 'тайко', inst: 'drums', seq: m.drums(bars('K..K..K.K...K...', 24), 4), vol: 0.3, pan: 0, rev: 0.35 },
      { name: 'рамочный', inst: 'drums', seq: m.drums(bars('F...F.F.F...F.F.', 24), 4), vol: 0.35, pan: 0, rev: 0.25 },
      { name: 'наковальня', inst: 'drums', seq: m.drums(bars(E16, 16) + bars('............a...', 8), 4), vol: 0.9, pan: 0, rev: 0.45 },
      { name: 'гонг', inst: 'drums', seq: m.drums('N...............' + bars(E16, 15) + 'N...............' + bars(E16, 7), 4), vol: 0.6, pan: 0, rev: 0.5 },
    ],
  };
}

/** C «Демон»: дум-рифф с тритоном на перегруженной гитаре, бас, в середине орган, хор и плачущий лид. */
function cavesC(): Song {
  const m = score(4);
  const B = m.chords('Ab Ab Gm Gm Fm Fm G G');
  const prog = cat(m.chords('Cm Cm Cm Cm Cm Cm Cm Cm'), B);
  const riff = bars('C3+G3+C4! - - - - - Eb3+Bb3! - | F#3+C#4! - - - F3+C4 - Eb3+Bb3 -', 4);
  const bassRiff = bars('C2 - - - - - Eb2 - | F#2 - - - F2 - Eb2 -', 4);
  const lead = m.line('C5 - - - Eb5 - - - | Ab4 - - - - - G4 - | Bb4 - - - D5 - - - | G4 - - - - - . . | Ab4 - - - C5 - - - | F5 - - Eb5 C5 - - - | B4 - - - D5 - - - | F#4 - - - G4 - - -', 2);
  const crash = 'c...............' + bars(E16, 7);
  const fill = bars(E16, 7) + '........y.y.t.T.';
  return {
    id: 'caves-c',
    location: 'caves',
    variant: 'c',
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
