/**
 * Пиратский корабль — «Мёртвый штиль»: корабль-призрак в штиль, ля минор. Фисгармония тянет обрывки песни,
 * призрачная подушка и гул, колокол буя, скрип дерева, волны и ветер.
 * Выбран пользователем из трёх вариантов на странице обсуждения (docs/muzyka.md).
 */
import type { Song } from '../synth';
import { bars, cat, rest, score } from '../score';
import { BELL, DRONE, GHOST, HARMONIUM } from '../instruments';

const E16 = '................';

/** «Мёртвый штиль»: призрачная подушка, гул, фисгармония тянет обрывки песни, колокол буя, скрип, волны, ветер. */
export function shipTrack(): Song {
  const m = score(4);
  const prog = m.chords('Am Am F F | Dm Dm E E | Am Am F G | Am E');
  const song = cat(
    rest(16),
    m.line('A4 - - - F4 - - - | D4 - - - E4 - F4 - | G#4 - - - - - B4 - | E4 - - - - - - -', 2),
    rest(8),
    m.line('C5 - - - A4 - - - | B4 - - - D5 - - - | C5 - - - A4 - - - | B4 - - - G#4 - - -', 2),
  );
  return {
    id: 'ship',
    location: 'ship',
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
