import { describe, expect, it } from 'vitest';
import { buildRating, cellsPassed, playerKey, PLAYER_KEY_LEN, RATING_CELLS, runPoints } from '../src/engine/rating';
import type { RunsFeed } from '../src/engine/globalStats';

const KEYS = ['who', 'event', 'difficulty', 'act', 'room', 'turns', 'hero'];
const row = (who: string, event: string, difficulty = 'normal', act = 1, room = 1, hero = 'warrior', turns = 20) => [who, event, difficulty, act, room, turns, hero];

describe('общий рейтинг (rating.ts)', () => {
  it('очки забега: победа — все 30 клеток и 10 сверху, гибель — минус непройденные клетки, × сложность', () => {
    expect(RATING_CELLS).toBe(30);
    expect(cellsPassed(false, 1, 1)).toBe(0);
    expect(cellsPassed(false, 2, 5)).toBe(14);
    expect(cellsPassed(false, 3, 10)).toBe(29);
    expect(cellsPassed(true, 3, 10)).toBe(30);
    expect(runPoints(true, 'hard', 3, 10)).toBe(120);
    expect(runPoints(true, 'easy', 3, 10)).toBe(40);
    expect(runPoints(false, 'normal', 2, 5)).toBe(-32);
    expect(runPoints(false, 'hard', 1, 1)).toBe(-90);
    expect(runPoints(false, 'hard', 3, 10)).toBe(-3);
  });

  it('мусор в ячейках не уводит очки за пределы забега', () => {
    expect(cellsPassed(false, 0, 0)).toBe(0);
    expect(cellsPassed(false, 9, 99)).toBe(29);
    expect(cellsPassed(false, NaN, 3)).toBe(0);
  });

  it('сумма по всем забегам игрока, гибели в минус, лучшие первыми', () => {
    const feed: RunsFeed = {
      keys: KEYS,
      rows: [
        row('aaa', 'victory', 'hard', 3, 10, 'mage'), // 120
        row('bbb', 'victory', 'normal', 3, 10), // 80
        row('bbb', 'defeat', 'normal', 2, 5), // −32
        row('ccc', 'defeat', 'easy', 1, 3), // −28
      ],
    };
    const r = buildRating(feed, { me: 'bbb' });
    expect(r.entries.map((e) => [e.who, e.points, e.runs, e.wins, e.place])).toEqual([
      ['aaa', 120, 1, 1, 1],
      ['bbb', 48, 2, 1, 2],
      ['ccc', -28, 1, 0, 3],
    ]);
    expect(r.me?.who).toBe('bbb');
    expect(r.me?.place).toBe(2);
    expect(r.entries[0].hero).toBe('mage');
  });

  it('брошенный забег — гибель на клетке, где бросили; брошенный в первых трёх комнатах не считается', () => {
    const feed: RunsFeed = {
      keys: KEYS,
      rows: [
        row('aaa', 'abandoned', 'hard', 2, 3), // пройдено 12 — −18 × 3
        row('aaa', 'abandoned', 'hard', 1, 3, 'mage'), // третья комната — не в счёт, хоть и с боями
        row('aaa', 'abandoned', 'normal', 1, 4), // четвёртая — уже гибель: пройдено 3, −27 × 2
        row('bbb', 'abandoned', 'easy', 1, 1, 'mage', 0),
        row('bbb', 'defeat', 'easy', 1, 2), // гибель в первых комнатах — по-прежнему минус: −29
      ],
    };
    const r = buildRating(feed);
    expect(r.entries.map((e) => [e.who, e.points, e.runs, e.hero])).toEqual([
      ['bbb', -29, 1, 'warrior'],
      ['aaa', -108, 2, 'warrior'],
    ]);
  });

  it('равные очки делят место, следующий идёт через одно; внутри — больше побед выше', () => {
    const feed: RunsFeed = {
      keys: KEYS,
      rows: [
        row('aaa', 'victory', 'easy', 3, 10), // 40, победа
        row('bbb', 'victory', 'normal', 3, 10), // 80
        row('bbb', 'defeat', 'normal', 2, 1), // −40: пройдено 10 из 30
        row('ccc', 'defeat', 'normal', 1, 2), // −58
      ],
    };
    const r = buildRating(feed);
    expect(r.entries.map((e) => [e.who, e.points, e.place])).toEqual([
      ['aaa', 40, 1],
      ['bbb', 40, 1],
      ['ccc', -58, 3],
    ]);
    expect(r.me).toBeNull();
  });

  it('записи без сложности — «Сложный», фильтр сложности считает только свои забеги', () => {
    const feed: RunsFeed = {
      keys: KEYS,
      rows: [row('aaa', 'victory', '', 3, 10), row('aaa', 'victory', 'easy', 3, 10), row('bbb', 'victory', 'easy', 3, 10)],
    };
    expect(buildRating(feed).entries[0]).toMatchObject({ who: 'aaa', points: 160, runs: 2 });
    const easy = buildRating(feed, { difficulty: 'easy', me: 'bbb' });
    expect(easy.entries.map((e) => [e.who, e.points, e.place])).toEqual([
      ['aaa', 40, 1],
      ['bbb', 40, 1],
    ]);
    const hard = buildRating(feed, { difficulty: 'hard', me: 'bbb' });
    expect(hard.entries.map((e) => e.who)).toEqual(['aaa']);
    expect(hard.me).toBeNull();
  });

  it('любимый герой — самый частый, при равенстве — первый сыгранный', () => {
    const feed: RunsFeed = {
      keys: KEYS,
      rows: [row('aaa', 'defeat', 'normal', 1, 2, 'archer'), row('aaa', 'defeat', 'normal', 1, 2, 'mage'), row('aaa', 'defeat', 'normal', 1, 2, 'mage'), row('bbb', 'defeat', 'normal', 1, 2, 'paladin'), row('bbb', 'defeat', 'normal', 1, 2, 'berserk')],
    };
    const r = buildRating(feed);
    expect(r.entries.find((e) => e.who === 'aaa')?.hero).toBe('mage');
    expect(r.entries.find((e) => e.who === 'bbb')?.hero).toBe('paladin');
  });

  it('ответ без колонки ключа или исхода — пустой рейтинг, а не падение', () => {
    expect(buildRating({ keys: ['event'], rows: [['victory']] }).entries).toEqual([]);
    expect(buildRating({ keys: [], rows: [] }).entries).toEqual([]);
  });

  it('ключ игрока — начало SHA-256 в шестнадцатеричном виде, как в Code.gs', async () => {
    // SHA-256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
    expect(await playerKey('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'.slice(0, PLAYER_KEY_LEN));
    expect(await playerKey('')).toBeNull();
  });
});
