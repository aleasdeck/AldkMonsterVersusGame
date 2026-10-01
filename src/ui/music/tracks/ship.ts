/**
 * Пиратский корабль — корабль-призрак: команда, которая не спешит умирать. A — мёртвый штиль, B — песня утопленников
 * хором в 6/8, C — абордаж: скрипка над остинато виолончели, медь и барабаны.
 */
import type { Song } from '../synth';
import { bars, cat, mute, rest, score, span, under } from '../score';
import { BELL, CELLO, CHOIR_A, CHOIR_LEAD, CHOIR_U, CONTRABASS, DRONE, FIDDLE, GHOST, HARMONIUM, HORN, HURDY, LOW_BRASS } from '../instruments';

const E16 = '................';
const E6 = '......';

export function shipTracks(): Song[] {
  return [shipA(), shipB(), shipC()];
}

/** A «Мёртвый штиль»: призрачная подушка, гул, фисгармония тянет обрывки песни, колокол буя, скрип, волны, ветер. */
function shipA(): Song {
  const m = score(4);
  const prog = m.chords('Am Am F F | Dm Dm E E | Am Am F G | Am E');
  const song = cat(
    rest(16),
    m.line('A4 - - - F4 - - - | D4 - - - E4 - F4 - | G#4 - - - - - B4 - | E4 - - - - - - -', 2),
    rest(8),
    m.line('C5 - - - A4 - - - | B4 - - - D5 - - - | C5 - - - A4 - - - | B4 - - - G#4 - - -', 2),
  );
  return {
    id: 'ship-a',
    location: 'ship',
    variant: 'a',
    title: 'Мёртвый штиль',
    mood: 'Эмбиент: корабль-призрак в штиль, фисгармония, колокол буя, скрип и волны',
    key: 'ля минор',
    bpm: 56,
    beatsPerBar: 4,
    reverb: { size: 0.92, damp: 0.55, wet: 0.38, pre: 35 },
    echo: { beats: 1, fb: 0.4, wet: 0.2, tone: 1500 },
    parts: [
      { name: 'фисгармония', inst: HARMONIUM, seq: song, vol: 0.9, pan: 0.15, rev: 0.45, echo: 0.3 },
      { name: 'призраки', inst: GHOST, seq: m.pad(prog, 60), vol: 0.35, pan: 0, rev: 0.6, spread: 0.6 },
      { name: 'гул', inst: DRONE, seq: m.line(bars('A1+E2 - - -', 14), 1), vol: 0.5, pan: 0, rev: 0.3 },
      { name: 'колокол', inst: BELL, seq: m.line(`${bars('A3 - - - | . . . . | . . . . | . . . .', 3)} | A3 - - - | . . . .`, 1), vol: 1, pan: -0.4, rev: 0.6, echo: 0.3 },
      { name: 'волны', inst: 'drums', seq: m.drums(bars('w.......w.......', 14), 4), vol: 0.6, pan: 0, rev: 0.3 },
      { name: 'скрип', inst: 'drums', seq: m.drums(bars('....n...........' + '..........n.....' + E16 + '......n.........', 3) + '....n...........' + E16, 4), vol: 0.7, pan: 0, rev: 0.5 },
      { name: 'ветер', inst: 'drums', seq: m.drums(bars('u...............' + E16 + E16 + E16, 3) + E16 + E16, 4), vol: 0.6, pan: 0, rev: 0.4 },
    ],
  };
}

/** B «Песнь утопленников»: мужской хор поёт морскую песню в 6/8 — сначала с закрытым ртом, потом в голос; колёсная лира, большой барабан, цепи. */
function shipB(): Song {
  const m = score(2);
  const A = m.chords('Am Am G G Am Am E E');
  const B = m.chords('F F C C Dm Dm E E');
  const prog = cat(A, A, B);
  const verse = m.line('E4 - - A4 - - | C5 - B4 A4 - - | B4 - - G4 - - | D5 - C5 B4 - - | A4 - - E4 - - | C5 - - A4 - - | B4 - - G#4 - - | E4 - - - - -', 3);
  const middle = m.line('A4 - - C5 - - | F5 - E5 C5 - - | E5 - - G4 - - | C5 - D5 E5 - - | F5 - - D5 - - | A4 - - F4 - - | G#4 - - B4 - - | B4 - - G#4 - -', 3);
  const tune = cat(verse, verse, middle);
  return {
    id: 'ship-b',
    location: 'ship',
    variant: 'b',
    title: 'Песнь утопленников',
    mood: 'Мужской хор поёт морскую песню в 6/8: лира гудит, большой барабан, цепи',
    key: 'ля минор',
    bpm: 54,
    beatsPerBar: 2,
    meter: '6/8',
    reverb: { size: 0.9, damp: 0.5, wet: 0.35, pre: 30 },
    parts: [
      { name: 'напев', inst: CHOIR_U, seq: cat(verse, rest(32)), vol: 1.2, pan: 0, rev: 0.45 },
      { name: 'песня', inst: CHOIR_LEAD, seq: cat(rest(16), verse, middle), vol: 0.9, pan: 0.1, rev: 0.45 },
      { name: 'второй голос', inst: CHOIR_U, seq: span(under(tune, prog), 16, 48), vol: 0.6, pan: -0.3, rev: 0.5 },
      { name: 'лира', inst: HURDY, seq: m.line(bars('A2+E3 - - - - -', 24), 3), vol: 0.4, pan: 0.15, rev: 0.3 },
      { name: 'контрабас', inst: CONTRABASS, seq: m.over(prog, '1 - - 5, - -', 3, 2), vol: 0.7, pan: 0, rev: 0.2 },
      { name: 'барабан', inst: 'drums', seq: m.drums(bars('K.....', 24), 3), vol: 0.45, pan: 0, rev: 0.4 },
      { name: 'цепи', inst: 'drums', seq: m.drums(bars(E6 + '...z..', 12), 3), vol: 1.1, pan: 0, rev: 0.35 },
      { name: 'волны', inst: 'drums', seq: m.drums(bars('w.....' + E6 + E6 + E6, 6), 3), vol: 0.9, pan: 0, rev: 0.3 },
    ],
  };
}

/** C «Абордаж»: скрипка над остинато виолончели в 6/8, медь и валторны в середине, хор к концу, тайко и рамочный барабан. */
function shipC(): Song {
  const m = score(2);
  const A = m.chords('Dm Dm C C Bb Bb A A');
  const B = m.chords('Gm Gm Dm Dm Bb C A A');
  const prog = cat(A, A, B, B);
  const verse = m.line('D5 - - A4 - - | F5 - E5 D5 - - | E5 - - G4 - - | C5 - D5 E5 - - | F5 - - D5 - - | Bb4 - C5 D5 - - | C#5 - - E5 - - | A4 - - - - -', 3);
  const middle = m.line('G5 - - D5 - - | Bb4 - C5 D5 - - | F5 - - A4 - - | D5 - E5 F5 - - | D5 - - F5 - - | E5 - - G5 - - | E5 - - C#5 - - | A4 - - - - -', 3);
  const tune = cat(verse, verse, middle, middle);
  const second = under(tune, prog);
  return {
    id: 'ship-c',
    location: 'ship',
    variant: 'c',
    title: 'Абордаж',
    mood: 'Ритм 6/8: скрипка над остинато виолончели, медь, хор, тайко',
    key: 'ре минор',
    bpm: 80,
    beatsPerBar: 2,
    meter: '6/8',
    reverb: { size: 0.65, damp: 0.5, wet: 0.22, pre: 15 },
    parts: [
      { name: 'скрипка', inst: FIDDLE, seq: tune, vol: 0.9, pan: 0.15, rev: 0.3 },
      { name: 'вторая скрипка', inst: FIDDLE, seq: mute(mute(second, 0, 16), 32, 48), vol: 0.5, pan: -0.35, rev: 0.3 },
      { name: 'виолончель', inst: CELLO, seq: m.over(prog, '1! 1 1 1! 1 1', 3, 2), vol: 0.8, pan: -0.1, rev: 0.2 },
      { name: 'медь', inst: LOW_BRASS, seq: span(m.over(prog, '1+5+8! - - . . .', 3, 2), 32, 64), vol: 0.6, pan: 0, rev: 0.3 },
      { name: 'валторны', inst: HORN, seq: span(m.pad(prog, 57), 32, 64), vol: 0.5, pan: 0.2, rev: 0.4, spread: 0.5 },
      { name: 'хор', inst: CHOIR_A, seq: span(m.pad(prog, 55), 48, 64), vol: 0.7, pan: 0, rev: 0.5, spread: 0.5 },
      { name: 'тайко', inst: 'drums', seq: m.drums(bars('K.....', 16) + bars('K..K..', 16), 3), vol: 0.35, pan: 0, rev: 0.3 },
      { name: 'рамочный', inst: 'drums', seq: m.drums(bars('F.FF.F', 32), 3), vol: 0.35, pan: 0, rev: 0.2 },
      { name: 'малый', inst: 'drums', seq: m.drums(bars(E6, 16) + bars('...s..', 16), 3), vol: 0.8, pan: 0, rev: 0.25 },
      { name: 'крэш', inst: 'drums', seq: m.drums(bars('c.....' + E6.repeat(7), 4), 3), vol: 1.2, pan: 0, rev: 0.3 },
    ],
  };
}
