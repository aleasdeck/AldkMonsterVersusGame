/**
 * Болота — соль минор с низкой ступенью: топкий ход вниз, вязкие доминанты ре мажора. A — эмбиент трясины,
 * B — плач утопленников в 6/8, C — болотная готика: банджо, сердце и виолончель с подъездами.
 */
import type { Song } from '../synth';
import { bars, cat, rest, score, span, transpose, under } from '../score';
import { BANJO, BELL_DEEP, CELLO, CHOIR_U, CONTRABASS, DRONE, GLASS, HARMONIUM, PIZZ, REED, STRINGS, SUB, WHISTLE } from '../instruments';

const E16 = '................';

export function swampTracks(): Song[] {
  return [swampA(), swampB(), swampC()];
}

/** A «Трясина»: саб и гул на соль, стеклянная подушка, вой ветра вместо мелодии, колокол под водой, капли и пузыри. */
function swampA(): Song {
  const m = score(4);
  const prog = m.chords('Gm Gm Eb Eb | Cm Cm Ab D | Gm Gm Eb D');
  const voice = cat(
    rest(8),
    m.line('Bb4 - - - G4 - - - | Ab4 - - - G4 - - - | G4 - - - Eb4 - - - | D4 - - - - - - -', 2),
    rest(8),
    m.line('D5 - - - Bb4 - - - | A4 - - - G4 - - - | G4 - - - Bb4 - - - | A4 - - - F#4 - - -', 2),
  );
  return {
    id: 'swamp-a',
    location: 'swamp',
    variant: 'a',
    title: 'Трясина',
    mood: 'Эмбиент: саб и стеклянная подушка, вой над водой, колокол из-под тины',
    key: 'соль минор',
    bpm: 52,
    beatsPerBar: 4,
    reverb: { size: 0.95, damp: 0.6, wet: 0.4, pre: 40 },
    echo: { beats: 1.5, fb: 0.5, wet: 0.3, tone: 1200 },
    parts: [
      { name: 'вой', inst: WHISTLE, seq: voice, vol: 0.65, pan: 0.15, rev: 0.6, echo: 0.4 },
      { name: 'стекло', inst: GLASS, seq: m.pad(prog, 62), vol: 0.55, pan: 0, rev: 0.6, spread: 0.6 },
      { name: 'гул', inst: DRONE, seq: m.line(bars('G2+D3 - - -', 12), 1), vol: 0.5, pan: 0, rev: 0.3 },
      { name: 'саб', inst: SUB, seq: m.line(bars('G1 - - -', 12), 1), vol: 0.55, pan: 0 },
      { name: 'колокол', inst: BELL_DEEP, seq: m.line(bars('G3 - - - | . . . . | . . . . | . . . .', 3), 1), vol: 1.1, pan: -0.2, rev: 0.6, echo: 0.3 },
      { name: 'топь', inst: 'drums', seq: m.drums(bars('d.......L.......' + 'f.........d.....' + '....L.......d...' + '..d.......f.....', 3), 4), vol: 0.9, pan: 0, rev: 0.5, echo: 0.4 },
    ],
  };
}

/** B «Утопленники»: гобой поёт плач в 6/8, контрабас и струнные, хор гудит снизу, середину берёт виолончель. */
function swampB(): Song {
  const m = score(2);
  const A = m.chords('Gm Gm Cm Cm Eb D Gm D');
  const B = m.chords('Eb Eb Bb Bb Cm Cm D D');
  const prog = cat(A, A, B);
  const verse = m.line('D5 - - G4 - - | Bb4 - A4 G4 - - | Eb5 - - C5 - - | G4 - - Eb5 - D5 | Bb4 - - G4 - - | A4 - - F#4 - - | G4 - - - - - | F#4 - - A4 - -', 3);
  const middle = m.line('Eb5 - - G5 - - | Bb5 - - G5 - F5 | F5 - - D5 - - | Bb4 - C5 D5 - - | Eb5 - - G4 - - | C5 - D5 Eb5 - - | D5 - - A4 - - | F#4 - - A4 - -', 3);
  const tune = cat(verse, verse, middle);
  const quiet7 = bars('. . . . . .', 7);
  return {
    id: 'swamp-b',
    location: 'swamp',
    variant: 'b',
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

/** C «Гнилая топь»: минорный блюз на банджо, виолончель с подъездами, сердце вместо бочки, кости и кваканье. */
function swampC(): Song {
  const m = score(4);
  const prog = m.chords('Gm Gm Gm Gm Cm Cm Gm Gm D Cm Gm D | Eb Eb Cm Cm Gm Gm D D7');
  const tune = m.line(
    'G4 - - - Bb4 - - - | D5 - - C5 Bb4 - - - | G4 - - - F4 - G4 - | - - - - . . . . | C5 - - - Eb5 - - - | G5 - - F5 Eb5 - C5 - | D5 - - - Bb4 - - - | G4 - - - - - . . | A4 - - - F#4 - - - | G4 - - - Eb4 - - - | D4 - - - G4 - - - | F#4 - - - A4 - - - | ' +
      'G4 - - - Bb4 - Eb5 - | Eb5 - - D5 Bb4 - - - | C5 - - - G4 - - - | Eb5 - - D5 C5 - G4 - | Bb4 - - - D5 - - - | G4 - - - - - . . | F#4 - - - A4 - - - | D5 - - - C5 - A4 -',
    2,
  );
  return {
    id: 'swamp-c',
    location: 'swamp',
    variant: 'c',
    title: 'Гнилая топь',
    mood: 'Болотная готика: минорный блюз на банджо, виолончель, сердце вместо бочки',
    key: 'соль минор, блюз',
    bpm: 72,
    beatsPerBar: 4,
    swing: 0.16,
    reverb: { size: 0.7, damp: 0.55, wet: 0.25, pre: 20 },
    echo: { beats: 0.5, fb: 0.3, wet: 0.15, tone: 1500 },
    parts: [
      { name: 'виолончель', inst: CELLO, seq: transpose(tune, -12), vol: 1, pan: 0.15, rev: 0.35 },
      { name: 'банджо', inst: BANJO, seq: m.over(prog, '1 . 3 1 4 #4 5 3', 2, 3), vol: 0.7, pan: -0.25, rev: 0.2, echo: 0.3 },
      { name: 'бас', inst: PIZZ, seq: m.over(prog, '1 - . 5, 1 - . .', 2, 2), vol: 1, pan: 0, rev: 0.1 },
      { name: 'фисгармония', inst: HARMONIUM, seq: span(m.pad(prog, 60), 48, 80), vol: 0.55, pan: 0.2, rev: 0.4, spread: 0.4 },
      { name: 'сердце', inst: 'drums', seq: m.drums(bars('v...............', 20), 4), vol: 0.6, pan: 0, rev: 0.2 },
      { name: 'кости', inst: 'drums', seq: m.drums(bars('..r...r...r...r.', 20), 4), vol: 0.55, pan: 0, rev: 0.25, echo: 0.2 },
      { name: 'топь', inst: 'drums', seq: m.drums(bars(E16 + E16 + '..........f.....' + E16, 2) + bars(E16 + '......d.........' + E16 + '..........f.....', 3), 4), vol: 1.2, pan: 0, rev: 0.4 },
    ],
  };
}
