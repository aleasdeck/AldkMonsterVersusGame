/**
 * Осквернённый улей — ми фригийский: полутон ми–фа как жужжание и тритон си-бемоль как скрежет хитина.
 * A — эмбиент ужаса: тремоло-кластеры и рой, B — марш королевы на низкой меди, C — рой на тёмном арпеджио.
 */
import type { Song } from '../synth';
import { bars, cat, rest, score, span } from '../score';
import { BUZZ_LEAD, CELESTA, CELLO, CHOIR_A, CHOIR_O, DARK_ARP, GROWL, HORN, LOW_BRASS, SUB, SWARM, TREMOLO } from '../instruments';

const E16 = '................';

export function hiveTracks(): Song[] {
  return [hiveA(), hiveB(), hiveC()];
}

/** A «Улей»: тремоло струнных кластерами, рой нарастает и стихает, челеста в темноте, щелчки хитина. */
function hiveA(): Song {
  const m = score(4);
  const motif = m.line('E5 - F5 - E5 - - - | Bb5 - - - A5 - - - | E5 - F5 - G5 - F5 - | E5 - - - - - . .', 2);
  return {
    id: 'hive-a',
    location: 'hive',
    variant: 'a',
    title: 'Улей',
    mood: 'Эмбиент ужаса: тремоло-кластеры, рой, челеста во тьме, щелчки хитина',
    key: 'ми фригийский',
    bpm: 60,
    beatsPerBar: 4,
    reverb: { size: 0.88, damp: 0.5, wet: 0.35, pre: 25 },
    echo: { beats: 0.5, fb: 0.45, wet: 0.25, tone: 2500 },
    parts: [
      { name: 'челеста', inst: CELESTA, seq: cat(rest(16), motif, rest(16), motif), vol: 0.8, pan: 0.2, rev: 0.6, echo: 0.4 },
      {
        name: 'тремоло',
        inst: TREMOLO,
        seq: m.line(['E3+F3+B3', 'E3+G3+Bb3', 'F3+A3+B3', 'E3+F3+B3'].map((c) => `${c} - - - | - - - - | - - - - | - - - -`).join(' | '), 1),
        vol: 0.35,
        pan: 0,
        rev: 0.45,
        spread: 0.6,
      },
      { name: 'рой', inst: SWARM, seq: m.line(bars('E2 - - - | - - - - | . . . . | . . . .', 4), 1), vol: 0.6, pan: -0.2, rev: 0.4 },
      { name: 'саб', inst: SUB, seq: m.line(bars('E1 - - -', 16), 1), vol: 0.5, pan: 0 },
      { name: 'хор', inst: CHOIR_O, seq: cat(rest(32), m.line('E4+F4+B4 - - - | - - - - | - - - - | . . . .', 1), rest(16)), vol: 0.25, pan: 0, rev: 0.6, spread: 0.5 },
      { name: 'хитин', inst: 'drums', seq: m.drums(bars('i...i.i.........' + '........i..i.i..' + '..i.......z.....' + 'i.i.......i.....', 4), 4), vol: 1.2, pan: 0, rev: 0.4, echo: 0.3 },
      { name: 'сердце', inst: 'drums', seq: m.drums(bars(E16, 8) + bars('v...............', 8), 4), vol: 0.5, pan: 0, rev: 0.3 },
    ],
  };
}

/** B «Королева»: низкая медь ползёт остинато с тритоном, виолончель и валторна ведут, хор и тайко, гонг. */
function hiveB(): Song {
  const m = score(4);
  const prog = m.chords('Em Em Em Em F F Em Em | Am Am Em Em F F B B | Em Em C B');
  const tune = m.line(
    'E4 - - F4 E4 - - - | B3 - - - Bb3 - - - | E4 - - F4 E4 - G4 - | F4 - - - E4 - - - | F4 - - - A4 - C5 - | B4 - - - A4 - - - | G4 - - - E4 - - - | B3 - - - - - . . | ' +
      'A4 - - - C5 - E5 - | F5 - - - E5 - - - | G4 - - - B4 - - - | Bb4 - - - B4 - - - | C5 - - - A4 - - - | F4 - - - - - E4 - | D#4 - - - F#4 - - - | B4 - - - A4 - - - | ' +
      'G4 - - - E4 - - - | B3 - - - - - - - | C4 - - - E4 - G4 - | D#4 - - - F#4 - B3 -',
    2,
  );
  const roll = 's.s.s.s.ssssssss';
  return {
    id: 'hive-b',
    location: 'hive',
    variant: 'b',
    title: 'Королева',
    mood: 'Марш ужаса: низкая медь остинато с тритоном, виолончель и валторна, хор, тайко',
    key: 'ми фригийский',
    bpm: 80,
    beatsPerBar: 4,
    reverb: { size: 0.85, damp: 0.45, wet: 0.3, pre: 25 },
    parts: [
      { name: 'виолончель', inst: CELLO, seq: tune, vol: 1, pan: -0.15, rev: 0.35 },
      { name: 'валторна', inst: HORN, seq: span(tune, 32, 80), vol: 0.8, pan: 0.25, rev: 0.5 },
      { name: 'медь', inst: LOW_BRASS, seq: m.over(prog, '1 - 1 b2 1 - #4, -', 2, 2), vol: 0.7, pan: 0, rev: 0.25 },
      { name: 'тремоло', inst: TREMOLO, seq: span(m.pad(prog, 60), 32, 80), vol: 0.4, pan: 0, rev: 0.45, spread: 0.6 },
      { name: 'хор', inst: CHOIR_A, seq: span(m.pad(prog, 55), 48, 80), vol: 0.5, pan: 0, rev: 0.6, spread: 0.5 },
      { name: 'тайко', inst: 'drums', seq: m.drums(bars('K.......K.......', 20), 4), vol: 0.3, pan: 0, rev: 0.35 },
      { name: 'дробь', inst: 'drums', seq: m.drums(bars(E16, 7) + roll + bars(E16, 7) + roll + bars(E16, 4), 4), vol: 0.6, pan: 0, rev: 0.3 },
      { name: 'гонг', inst: 'drums', seq: m.drums('N...............' + bars(E16, 15) + 'N...............' + bars(E16, 3), 4), vol: 0.7, pan: 0, rev: 0.5 },
    ],
  };
}

/** C «Рой»: тёмное арпеджио шестнадцатыми с фригийским полутоном, рычащий бас, жужжащий лид, механика щелчков. */
function hiveC(): Song {
  const m = score(4);
  const A = m.chords('Em Em Em Em F F Em Em');
  const B = m.chords('C C B B Am Am B B');
  const prog = cat(A, A, B, m.chords('Em Em Em Em'));
  const verse = m.line('E5 - F5 E5 - - B4 - | Bb4 - - - B4 - - - | E5 - F5 E5 - - G5 - | F5 - - - E5 - - - | F5 - - - A5 - C6 - | B5 - - - A5 - - - | G5 - - - E5 - - - | B4 - - - - - . .', 2);
  const middle = m.line('G5 - - - E5 - C5 - | Db5 - - - C5 - - - | D#5 - - - F#5 - - - | A5 - - - B5 - - - | C6 - - - A5 - E5 - | F5 - - - E5 - - - | F#5 - - - D#5 - - - | B4 - - - A4 - F#4 -', 2);
  return {
    id: 'hive-c',
    location: 'hive',
    variant: 'c',
    title: 'Рой',
    mood: 'Ритм: тёмное арпеджио, рычащий бас, жужжащий лид, механика щелчков',
    key: 'ми фригийский',
    bpm: 120,
    beatsPerBar: 4,
    reverb: { size: 0.6, damp: 0.4, wet: 0.2, pre: 15 },
    echo: { beats: 0.75, fb: 0.3, wet: 0.2, tone: 2500 },
    parts: [
      { name: 'лид', inst: BUZZ_LEAD, seq: cat(rest(32), verse, middle, rest(16)), vol: 0.85, pan: 0.15, rev: 0.3, echo: 0.3 },
      { name: 'арпеджио', inst: DARK_ARP, seq: m.over(prog, '1 b2 1 5 1 b2 1 8 1 b2 1 5 3 b2 1 5', 4, 3), vol: 0.45, pan: -0.2, rev: 0.2, echo: 0.2 },
      { name: 'бас', inst: GROWL, seq: m.over(prog, '1! 1 1 1 1! 1 b2 1', 2, 2), vol: 0.55, pan: 0, rev: 0.1 },
      { name: 'рой', inst: SWARM, seq: span(m.pad(prog, 52), 64, 112), vol: 0.45, pan: 0, rev: 0.4, spread: 0.5 },
      { name: 'хор', inst: CHOIR_O, seq: span(m.pad(prog, 60), 64, 96), vol: 0.4, pan: 0, rev: 0.5, spread: 0.5 },
      { name: 'бочка', inst: 'drums', seq: m.drums(bars('k...k.....k.k...', 28), 4), vol: 0.5, pan: 0 },
      { name: 'малый', inst: 'drums', seq: m.drums(bars(E16, 8) + bars('........s.......', 20), 4), vol: 0.8, pan: 0, rev: 0.25 },
      { name: 'тарелки', inst: 'drums', seq: m.drums(bars('h.hhh.hhh.hhh.hh', 28), 4), vol: 1.4, pan: 0 },
      { name: 'хитин', inst: 'drums', seq: m.drums(bars('..i.....i.i...i.' + '..i...z...i.....', 14), 4), vol: 0.55, pan: 0, rev: 0.3, echo: 0.3 },
    ],
  };
}
