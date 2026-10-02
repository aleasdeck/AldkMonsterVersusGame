// ─── Общий рейтинг игроков ──────────────────────────────────────────────────
// Скрипт таблицы (tools/apps-script/Code.gs) по GET ?data=rating отдаёт короткие строки **всех** забегов листа (без
// отладочных, без лимита ?data=runs): ключ игрока `who`, исход, сложность, акт, клетка, ходы, герой. Здесь из них считается
// рейтинг — чистая функция, правила счёта фиксируют тесты (tests/rating.test.ts). Формула живёт в игре, а не в скрипте,
// чтобы её правка не требовала нового развёртывания таблицы.
//
// Формула (решения пользователя — «сумма всех забегов», «проигрыши должны давать минус»): рейтинг — сумма очков всех
// забегов игрока. Победа — все 30 клеток плюс RATING_WIN_BONUS, гибель — минус непройденные клетки: чем дальше прошёл,
// тем меньше потерял (на первой клетке — −30, у финального босса — −1). Всё умножается на сложность (Лёгкий ×1,
// Средний ×2, Сложный ×3). Брошенный забег считается гибелью на клетке, где его бросили, — иначе безнадёжный забег
// бросали бы, чтобы не уйти в минус; брошенный до первого боя (0 ходов — передумал с героем) не считается вовсе.

import type { Difficulty } from './types';
import type { RunsFeed } from './globalStats';
import { rowDifficulty } from './globalStats';
import { ACTS_PER_RUN, ROOMS_PER_LOCATION } from '../data/locations';

/** Множитель очков забега по сложности. */
export const RATING_DIFF_MULT: Record<Difficulty, number> = { easy: 1, normal: 2, hard: 3 };
/** Очки за победу сверх 30 пройденных клеток. */
export const RATING_WIN_BONUS = 10;
/** Клеток в забеге: три акта по десять. Победа — все пройдены. */
export const RATING_CELLS = ACTS_PER_RUN * ROOMS_PER_LOCATION;
/**
 * Сколько первых шестнадцатеричных знаков SHA-256 от id игрока служат его ключом `who`. Должно совпадать с PLAYER_KEY_LEN
 * в Code.gs: игра считает свой ключ сама и по нему находит себя в рейтинге.
 */
export const PLAYER_KEY_LEN = 12;

export interface RatingEntry {
  /** Ключ игрока — начало хеша его id; сам id наружу не уходит. */
  who: string;
  points: number;
  /** Забеги в зачёте (победы, гибели и брошенные после первого боя) и победы. */
  runs: number;
  wins: number;
  /** Самый частый герой игрока; при равенстве — тот, кем он играл раньше. Пусто — колонки нет. */
  hero: string;
  /** Место: 1 + сколько игроков набрали строго больше очков — равные очки делят одно место. */
  place: number;
}

export interface Rating {
  /** Все игроки, лучшие первыми. */
  entries: RatingEntry[];
  /** Своя строка; null — своего ключа нет или своих забегов в таблице нет. */
  me: RatingEntry | null;
}

export interface RatingOpts {
  /** Свой ключ (`playerKey`) — найти себя. */
  me?: string | null;
  /** Считать только забеги этой сложности; нет — все. */
  difficulty?: Difficulty;
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Пройдено клеток: победа — все, гибель — те, что до клетки гибели (акт 1..3, клетка 1..10; погиб на клетке 5 второго
 * акта — пройдено 14). Мусор в ячейках — в пределы 0..RATING_CELLS.
 */
export function cellsPassed(won: boolean, act: number, room: number): number {
  if (won) return RATING_CELLS;
  const cells = (Math.floor(act) - 1) * ROOMS_PER_LOCATION + Math.floor(room) - 1;
  return Number.isFinite(cells) ? Math.max(0, Math.min(RATING_CELLS - 1, cells)) : 0;
}

/**
 * Очки одного забега: победа на «Сложном» — (30 + 10) × 3 = 120; гибель на клетке 5 второго акта на «Среднем» — пройдено 14,
 * не пройдено 16 — −16 × 2 = −32; гибель на первой клетке «Сложного» — −90.
 */
export function runPoints(won: boolean, difficulty: Difficulty, act: number, room: number): number {
  const mult = RATING_DIFF_MULT[difficulty];
  return won ? (RATING_CELLS + RATING_WIN_BONUS) * mult : -(RATING_CELLS - cellsPassed(false, act, room)) * mult;
}

/** Рейтинг по строкам ?data=rating: сумма очков забегов на игрока (брошенный — как гибель), места с делёжкой при равенстве. */
export function buildRating(feed: RunsFeed, opts: RatingOpts = {}): Rating {
  const col = (key: string) => feed.keys.indexOf(key);
  const cWho = col('who');
  const cEvent = col('event');
  const cDiff = col('difficulty');
  const cAct = col('act');
  const cRoom = col('room');
  const cHero = col('hero');
  const cTurns = col('turns');
  if (cWho < 0 || cEvent < 0) return { entries: [], me: null };
  const players = new Map<string, RatingEntry & { heroes: Map<string, number> }>();
  for (const row of feed.rows) {
    const who = String(row[cWho] ?? '');
    const event = String(row[cEvent] ?? '');
    if (!who || (event !== 'victory' && event !== 'defeat' && event !== 'abandoned')) continue;
    // Брошен до первого боя — передумал с героем или сложностью: ни очков, ни минуса.
    if (event === 'abandoned' && cTurns >= 0 && num(row[cTurns]) === 0) continue;
    const diff = rowDifficulty(cDiff >= 0 ? row[cDiff] : '');
    if (opts.difficulty && diff !== opts.difficulty) continue;
    const won = event === 'victory';
    let p = players.get(who);
    if (!p) {
      p = { who, points: 0, runs: 0, wins: 0, hero: '', place: 0, heroes: new Map() };
      players.set(who, p);
    }
    p.points += runPoints(won, diff, num(cAct >= 0 ? row[cAct] : 0), num(cRoom >= 0 ? row[cRoom] : 0));
    p.runs += 1;
    if (won) p.wins += 1;
    const hero = cHero >= 0 ? String(row[cHero] ?? '') : '';
    if (hero) p.heroes.set(hero, (p.heroes.get(hero) ?? 0) + 1);
  }
  // Внутри равных очков — больше побед, потом меньше забегов (то же за меньшее число попыток), потом по ключу — чтобы порядок не прыгал.
  const entries: RatingEntry[] = [...players.values()]
    .map(({ heroes, ...e }) => {
      let hero = '';
      let best = 0;
      for (const [id, n] of heroes) {
        if (n > best) {
          hero = id;
          best = n;
        }
      }
      return { ...e, hero };
    })
    .sort((a, b) => b.points - a.points || b.wins - a.wins || a.runs - b.runs || a.who.localeCompare(b.who));
  entries.forEach((e, i) => {
    e.place = i > 0 && entries[i - 1].points === e.points ? entries[i - 1].place : i + 1;
  });
  const me = opts.me ? (entries.find((e) => e.who === opts.me) ?? null) : null;
  return { entries, me };
}

/**
 * Ключ игрока: первые PLAYER_KEY_LEN знаков SHA-256 его id в шестнадцатеричном виде — то же считает Code.gs
 * (`playerKey_`). Хеш, а не сам id: по id можно было бы слать записи от чужого имени. null — нет WebCrypto
 * (страница не по https и не с localhost) — тогда рейтинг виден, но себя в нём не найти.
 */
export async function playerKey(playerId: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!playerId || !subtle) return null;
  try {
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(playerId));
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    return hex.slice(0, PLAYER_KEY_LEN);
  } catch {
    return null;
  }
}
