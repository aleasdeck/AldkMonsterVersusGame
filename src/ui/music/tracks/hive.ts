/**
 * Осквернённый улей — «Рой»: ми фригийский, полутон ми–фа как жужжание и тритон си-бемоль как скрежет хитина.
 * Тёмное арпеджио шестнадцатыми, рычащий бас, жужжащий лид, механика щелчков, рой и хор в середине.
 * Выбран пользователем из трёх вариантов на странице обсуждения (docs/muzyka.md).
 */
import type { Song } from '../synth';
import { bars, cat, rest, score, span } from '../score';
import { BUZZ_LEAD, CHOIR_O, DARK_ARP, GROWL, SWARM } from '../instruments';

const E16 = '................';

/** «Рой»: тёмное арпеджио шестнадцатыми с фригийским полутоном, рычащий бас, жужжащий лид, механика щелчков. */
export function hiveTrack(): Song {
  const m = score(4);
  const A = m.chords('Em Em Em Em F F Em Em');
  const B = m.chords('C C B B Am Am B B');
  const prog = cat(A, A, B, m.chords('Em Em Em Em'));
  const verse = m.line('E5 - F5 E5 - - B4 - | Bb4 - - - B4 - - - | E5 - F5 E5 - - G5 - | F5 - - - E5 - - - | F5 - - - A5 - C6 - | B5 - - - A5 - - - | G5 - - - E5 - - - | B4 - - - - - . .', 2);
  const middle = m.line('G5 - - - E5 - C5 - | Db5 - - - C5 - - - | D#5 - - - F#5 - - - | A5 - - - B5 - - - | C6 - - - A5 - E5 - | F5 - - - E5 - - - | F#5 - - - D#5 - - - | B4 - - - A4 - F#4 -', 2);
  return {
    id: 'hive',
    location: 'hive',
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
