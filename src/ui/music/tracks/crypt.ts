/**
 * Склеп — нежить и те, кто её поднимает. A — эмбиент собора: орган, колокол и призрачный голос, B — колыбельная
 * мертвецов на старой музыкальной шкатулке в 3/4, C — некромант: готическая токката органа, хор и литавры.
 */
import type { Song } from '../synth';
import { bars, cat, rest, score, span, under } from '../score';
import { BELL, CELESTA, CHOIR_A, CHOIR_LEAD, CHOIR_U, GLASS, HARP, MUSIC_BOX, ORGAN, ORGAN_FULL, ORGAN_PEDAL, PIZZ } from '../instruments';

const E16 = '................';

export function cryptTracks(): Song[] {
  return [cryptA(), cryptB(), cryptC()];
}

/** A «Склеп»: педаль органа и тихие аккорды, колокол раз в два такта, далёкий хор, призрачный голос, ветер и капли. */
function cryptA(): Song {
  const m = score(4);
  const prog = m.chords('Cm Cm Ab Ab | Fm Fm G G | Cm Cm Db Db | G G');
  const voice = cat(
    rest(16),
    m.line('C5 - - - Ab4 - - - | F4 - - - G4 - Ab4 - | B4 - - - - - D5 - | G4 - - - - - - -', 2),
    rest(8),
    m.line('F4 - - - Ab4 - - - | Db5 - - - C5 - - - | B4 - - - D5 - - - | G4 - - - - - - -', 2),
  );
  return {
    id: 'crypt-a',
    location: 'crypt',
    variant: 'a',
    title: 'Склеп',
    mood: 'Эмбиент собора: педаль органа, колокол, далёкий хор, призрачный голос',
    key: 'до минор',
    bpm: 54,
    beatsPerBar: 4,
    reverb: { size: 0.97, damp: 0.55, wet: 0.42, pre: 45 },
    parts: [
      { name: 'голос', inst: CHOIR_LEAD, seq: voice, vol: 0.5, pan: 0.15, rev: 0.6 },
      { name: 'орган', inst: ORGAN, seq: m.pad(prog, 55), vol: 0.45, pan: 0, rev: 0.5, spread: 0.4 },
      { name: 'педаль', inst: ORGAN_PEDAL, seq: m.over(prog, '1+5 - - -', 1, 2), vol: 0.55, pan: 0, rev: 0.4 },
      { name: 'хор', inst: CHOIR_A, seq: m.pad(prog, 62), vol: 0.35, pan: 0, rev: 0.7, spread: 0.6 },
      { name: 'колокол', inst: BELL, seq: m.line(bars('C3 - - - | . . . .', 7), 1), vol: 0.9, pan: -0.3, rev: 0.6 },
      { name: 'ветер', inst: 'drums', seq: m.drums(bars('u...............' + E16 + E16 + E16, 3) + E16 + E16, 4), vol: 0.6, pan: 0, rev: 0.4 },
      { name: 'капли', inst: 'drums', seq: m.drums(bars('......d.........' + '.............d..', 7), 4), vol: 1.5, pan: 0, rev: 0.6 },
    ],
  };
}

/** B «Колыбель мертвецов»: старая шкатулка играет вальс в ля миноре, арфа и пиццикато, стекло, тиканье часов. */
function cryptB(): Song {
  const m = score(3);
  const A = m.chords('Am Am Dm Dm E E Am Am');
  const B = m.chords('F F C C Dm E Am Am');
  const prog = cat(A, A, B);
  const verse = m.line('E5 - C5 - A4 - | A4 - B4 - C5 - | D5 - - - F5 - | F5 - E5 - D5 - | B4 - - - G#4 - | E4 - F4 - G#4 - | A4 - - - C5 - | E4 - - - - -', 2);
  const middle = m.line('A5 - - - F5 - | C5 - - - A4 - | G5 - - - E5 - | C5 - D5 - E5 - | F5 - - - D5 - | G#4 - - - B4 - | A4 - - - - - | . . . . . .', 2);
  const tune = cat(verse, verse, middle);
  return {
    id: 'crypt-b',
    location: 'crypt',
    variant: 'b',
    title: 'Колыбель мертвецов',
    mood: 'Вальс 3/4 на старой музыкальной шкатулке: арфа, стекло, тиканье часов',
    key: 'ля минор',
    bpm: 84,
    beatsPerBar: 3,
    reverb: { size: 0.85, damp: 0.5, wet: 0.35, pre: 25 },
    echo: { beats: 1.5, fb: 0.35, wet: 0.2, tone: 3000 },
    parts: [
      { name: 'шкатулка', inst: MUSIC_BOX, seq: tune, vol: 0.9, pan: 0.1, rev: 0.45, echo: 0.35 },
      { name: 'челеста', inst: CELESTA, seq: span(under(tune, prog), 24, 48), vol: 0.5, pan: -0.3, rev: 0.45, echo: 0.3 },
      { name: 'стекло', inst: GLASS, seq: m.pad(prog, 60), vol: 0.35, pan: 0, rev: 0.6, spread: 0.6 },
      { name: 'арфа', inst: HARP, seq: m.over(prog, '. 3+5+8 3+5+8', 1, 3), vol: 0.4, pan: -0.15, rev: 0.4 },
      { name: 'пиццикато', inst: PIZZ, seq: m.over(prog, '1 . . | 5, . .', 1, 2), vol: 1.1, pan: 0, rev: 0.2 },
      { name: 'хор', inst: CHOIR_U, seq: span(m.pad(prog, 55), 48, 72), vol: 0.4, pan: 0, rev: 0.6, spread: 0.5 },
      { name: 'часы', inst: 'drums', seq: m.drums(bars('r.r.r.', 24), 2), vol: 0.35, pan: 0, rev: 0.2 },
    ],
  };
}

/** C «Некромант»: токката органа — мордент и пассаж вниз, аккорды, потом мелодия на пленуме, педаль, хор, колокол, литавры. */
function cryptC(): Song {
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
    id: 'crypt-c',
    location: 'crypt',
    variant: 'c',
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
