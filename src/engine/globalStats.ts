// ─── Общая статистика: сводка по записям всех игроков ───────────────────────
// Скрипт таблицы (tools/apps-script/Code.gs) по GET ?data=runs отдаёт {keys, rows}: keys — шапка листа, rows — строки
// последних забегов без отладочных и без приватных колонок. Здесь из этого считается то, что показывает экран «Статистика»:
// чистая функция, чтобы формат и правила счёта фиксировали тесты.

/** Ответ скрипта: шапка и строки, строка — массив по keys. Пустые ячейки приходят пустой строкой. */
export interface RunsFeed {
  keys: string[];
  rows: unknown[][];
}

export interface HeroSummary {
  hero: string;
  /** Законченные забеги: победы и гибели; брошенные не считаются — как в профиле игрока. */
  runs: number;
  wins: number;
}

/** Строка «где гибнут»: локация и клетка или последний бой, доля от всех гибелей. */
export interface SpotSummary {
  label: string;
  count: number;
  share: number;
}

export interface GlobalSummary {
  runs: number;
  wins: number;
  abandoned: number;
  heroes: HeroSummary[];
  /** Победный забег в среднем: секунды и ходы. 0 — побед нет. */
  winDuration: number;
  winTurns: number;
  /** Клетки и убийцы по числу гибелей, самые частые первыми. */
  deathSpots: SpotSummary[];
  killers: SpotSummary[];
  /** Урон за все законченные забеги: нанесённый героями и полученный ими. */
  damageDealt: number;
  damageTaken: number;
}

export interface SummarizeOpts {
  /** Порядок героев в сводке; герои, которых в ответе нет, всё равно попадают с нулями. */
  heroes: string[];
  /** Имя локации по id для подписи клетки; без него — id как есть. */
  locationName?: (id: string) => string;
  /** Сколько строк «где гибнут» и «кто убивает». */
  top?: number;
}

function col(feed: RunsFeed, key: string): number {
  return feed.keys.indexOf(key);
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  return v === undefined || v === null ? '' : String(v);
}

function topOf(counts: Map<string, number>, total: number, top: number): SpotSummary[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, top)
    .map(([label, count]) => ({ label, count, share: total ? count / total : 0 }));
}

/** Сводка по записям: забеги и победы по героям, средний победный забег, где и от кого гибнут. */
export function summarize(feed: RunsFeed, opts: SummarizeOpts): GlobalSummary {
  const cEvent = col(feed, 'event');
  const cHero = col(feed, 'hero');
  const cDuration = col(feed, 'duration');
  const cTurns = col(feed, 'turns');
  const cLocation = col(feed, 'location');
  const cAct = col(feed, 'act');
  const cRoom = col(feed, 'room');
  const cLast = col(feed, 'lastBattle');
  const cDealt = col(feed, 'damageDealt');
  const cTaken = col(feed, 'damageTaken');
  const top = opts.top ?? 5;
  const heroes = new Map<string, HeroSummary>(opts.heroes.map((id) => [id, { hero: id, runs: 0, wins: 0 }]));
  let runs = 0;
  let wins = 0;
  let abandoned = 0;
  let winSeconds = 0;
  let winTurns = 0;
  let dealt = 0;
  let taken = 0;
  const spots = new Map<string, number>();
  const killers = new Map<string, number>();
  for (const row of feed.rows) {
    const event = cEvent >= 0 ? str(row[cEvent]) : '';
    if (event === 'abandoned') {
      abandoned += 1;
      continue;
    }
    if (event !== 'victory' && event !== 'defeat') continue;
    runs += 1;
    if (cDealt >= 0) dealt += num(row[cDealt]);
    if (cTaken >= 0) taken += num(row[cTaken]);
    const hero = cHero >= 0 ? str(row[cHero]) : '';
    const h = heroes.get(hero);
    if (h) h.runs += 1;
    if (event === 'victory') {
      wins += 1;
      if (h) h.wins += 1;
      if (cDuration >= 0) winSeconds += num(row[cDuration]);
      if (cTurns >= 0) winTurns += num(row[cTurns]);
      continue;
    }
    // Гибель: клетка и последний бой — он и есть убийца.
    if (cLocation >= 0 && cAct >= 0 && cRoom >= 0) {
      const loc = str(row[cLocation]);
      const label = `${opts.locationName?.(loc) ?? loc}, акт ${num(row[cAct])} · клетка ${num(row[cRoom])}`;
      spots.set(label, (spots.get(label) ?? 0) + 1);
    }
    if (cLast >= 0) {
      const last = str(row[cLast]);
      if (last) killers.set(last, (killers.get(last) ?? 0) + 1);
    }
  }
  const deaths = runs - wins;
  return {
    runs,
    wins,
    abandoned,
    heroes: [...heroes.values()],
    winDuration: wins ? Math.round(winSeconds / wins) : 0,
    winTurns: wins ? Math.round(winTurns / wins) : 0,
    deathSpots: topOf(spots, deaths, top),
    killers: topOf(killers, deaths, top),
    damageDealt: dealt,
    damageTaken: taken,
  };
}

/** «12 мин 05 с» — длительность для сводки. */
export function durationText(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m} мин ${String(s).padStart(2, '0')} с` : `${s} с`;
}
