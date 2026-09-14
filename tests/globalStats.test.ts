import { describe, expect, it } from 'vitest';
import { durationText, summarize, type RunsFeed } from '../src/engine/globalStats';

const KEYS = ['ts', 'event', 'hero', 'act', 'location', 'room', 'turns', 'duration', 'lastBattle', 'damageDealt', 'damageTaken'];
const row = (event: string, hero: string, act = 1, location = 'forest', room = 10, turns = 40, duration = 600, last = 'Вожак стаи', dealt = 100, taken = 50) => [
  '2026-09-14T10:00:00Z',
  event,
  hero,
  act,
  location,
  room,
  turns,
  duration,
  last,
  dealt,
  taken,
];

const HEROES = ['warrior', 'mage', 'assassin'];
const names: Record<string, string> = { forest: 'Лес', crypt: 'Склеп' };

describe('общая статистика (globalStats.ts)', () => {
  it('считает забеги и победы по героям, брошенные — отдельно и не в забеги', () => {
    const feed: RunsFeed = {
      keys: KEYS,
      rows: [
        row('victory', 'warrior', 3, 'crypt', 10, 60, 900),
        row('defeat', 'warrior'),
        row('defeat', 'mage', 2, 'crypt', 8, 30, 500, 'Лич'),
        row('abandoned', 'mage'),
        row('victory', 'mage', 3, 'forest', 10, 40, 700),
      ],
    };
    const s = summarize(feed, { heroes: HEROES, locationName: (id) => names[id] ?? id });
    expect(s.runs).toBe(4);
    expect(s.wins).toBe(2);
    expect(s.abandoned).toBe(1);
    expect(s.heroes).toEqual([
      { hero: 'warrior', runs: 2, wins: 1 },
      { hero: 'mage', runs: 2, wins: 1 },
      { hero: 'assassin', runs: 0, wins: 0 },
    ]);
    // Средний победный: (900 + 700) / 2 секунд, (60 + 40) / 2 ходов.
    expect(s.winDuration).toBe(800);
    expect(s.winTurns).toBe(50);
    // Урон — по четырём законченным забегам, брошенный не считается.
    expect(s.damageDealt).toBe(400);
    expect(s.damageTaken).toBe(200);
  });

  it('гибели: клетка с именем локации и убийца одной строкой, самые частые первыми, доля от гибелей', () => {
    const feed: RunsFeed = {
      keys: KEYS,
      rows: [
        row('defeat', 'warrior', 1, 'forest', 10, 20, 300, 'Вожак стаи'),
        row('defeat', 'mage', 1, 'forest', 10, 20, 300, 'Вожак стаи'),
        row('defeat', 'mage', 2, 'crypt', 8, 20, 300, 'Рыцарь смерти'),
        row('victory', 'mage', 3, 'crypt', 10, 20, 300, 'Лич'),
      ],
    };
    const s = summarize(feed, { heroes: HEROES, locationName: (id) => names[id] ?? id, top: 1 });
    expect(s.deathSpots).toEqual([{ label: 'Лес, акт 1 · клетка 10 — Вожак стаи', count: 2, share: 2 / 3 }]);
  });

  it('неизвестные герои и чужие события не ломают счёт; колонки ищутся по имени, а не по позиции', () => {
    const feed: RunsFeed = {
      keys: ['hero', 'event'],
      rows: [
        ['dragon_knight', 'victory'],
        ['warrior', 'weird'],
        ['warrior', 'defeat'],
      ],
    };
    const s = summarize(feed, { heroes: HEROES });
    expect(s.runs).toBe(2); // победа неизвестного героя — всё же забег
    expect(s.wins).toBe(1);
    expect(s.heroes[0]).toEqual({ hero: 'warrior', runs: 1, wins: 0 });
    expect(s.deathSpots).toEqual([]);
    expect(s.winDuration).toBe(0);
  });

  it('пустой ответ — нули без ошибок', () => {
    const s = summarize({ keys: [], rows: [] }, { heroes: HEROES });
    expect(s.runs).toBe(0);
    expect(s.heroes.every((h) => h.runs === 0)).toBe(true);
  });

  it('длительность словами', () => {
    expect(durationText(45)).toBe('45 с');
    expect(durationText(725)).toBe('12 мин 05 с');
  });
});
