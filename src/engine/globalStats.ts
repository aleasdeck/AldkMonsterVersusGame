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

/** Строка «где гибнут»: локация, клетка и последний бой (он и есть убийца), доля от всех гибелей. */
export interface SpotSummary {
  label: string;
  count: number;
  share: number;
}

/** Предмет (база оружия или брони, артефакт) в конце законченного забега: сколько раз был у героя и сколько из них — победы. */
export interface ItemSummary {
  id: string;
  runs: number;
  wins: number;
}

export interface GlobalSummary {
  runs: number;
  wins: number;
  abandoned: number;
  heroes: HeroSummary[];
  /** Победный забег в среднем: секунды и ходы. 0 — побед нет. */
  winDuration: number;
  winTurns: number;
  /** Клетка и убийца по числу гибелей, самые частые первыми; отдельно — убийцы сами по себе (последний бой), по всем клеткам. */
  deathSpots: SpotSummary[];
  killers: SpotSummary[];
  /** Урон за все законченные забеги: нанесённый героями и полученный ими. */
  damageDealt: number;
  damageTaken: number;
  /** Чем заканчивали: базы оружия, брони и артефакты на момент конца забега, самые частые первыми; тир и аффикс не различаются. */
  weapons: ItemSummary[];
  armors: ItemSummary[];
  artifacts: ItemSummary[];
}

export interface SummarizeOpts {
  /** Порядок героев в сводке; герои, которых в ответе нет, всё равно попадают с нулями. */
  heroes: string[];
  /** Имя локации по id для подписи клетки; без него — id как есть. */
  locationName?: (id: string) => string;
  /** Сколько строк «где гибнут» и «убийцы». */
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

/** «sword@3 +crit» → «sword», «fireball@2» → «fireball»: id без тира и аффикса. */
function itemId(token: string): string {
  return token.split('@')[0].trim();
}

function bump(map: Map<string, ItemSummary>, id: string, win: boolean): void {
  if (!id) return;
  const it = map.get(id) ?? { id, runs: 0, wins: 0 };
  it.runs += 1;
  if (win) it.wins += 1;
  map.set(id, it);
}

function itemsOf(map: Map<string, ItemSummary>): ItemSummary[] {
  return [...map.values()].sort((a, b) => b.runs - a.runs || b.wins - a.wins || a.id.localeCompare(b.id));
}

function topOf(counts: Map<string, number>, total: number, top: number): SpotSummary[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, top)
    .map(([label, count]) => ({ label, count, share: total ? count / total : 0 }));
}

/** Сводка по записям: забеги и победы по героям, средний победный забег, урон, где и от кого гибнут, чем заканчивали. */
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
  const cWeapon = col(feed, 'weapon');
  const cArmor = col(feed, 'armor');
  const cArts = col(feed, 'artifacts');
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
  const weapons = new Map<string, ItemSummary>();
  const armors = new Map<string, ItemSummary>();
  const artifacts = new Map<string, ItemSummary>();
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
    const win = event === 'victory';
    if (cWeapon >= 0) bump(weapons, itemId(str(row[cWeapon])), win);
    if (cArmor >= 0) bump(armors, itemId(str(row[cArmor])), win);
    if (cArts >= 0) for (const tok of str(row[cArts]).split(/\s+/)) bump(artifacts, itemId(tok), win);
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
    // Гибель: клетка и последний бой одной строкой — он и есть убийца.
    const parts: string[] = [];
    if (cLocation >= 0 && cAct >= 0 && cRoom >= 0) {
      const loc = str(row[cLocation]);
      parts.push(`${opts.locationName?.(loc) ?? loc}, акт ${num(row[cAct])} · клетка ${num(row[cRoom])}`);
    }
    const last = cLast >= 0 ? str(row[cLast]) : '';
    if (last) {
      parts.push(last);
      killers.set(last, (killers.get(last) ?? 0) + 1);
    }
    if (parts.length) {
      const label = parts.join(' — ');
      spots.set(label, (spots.get(label) ?? 0) + 1);
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
    weapons: itemsOf(weapons),
    armors: itemsOf(armors),
    artifacts: itemsOf(artifacts),
  };
}

/** «12 мин 05 с» — длительность для сводки. */
export function durationText(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m} мин ${String(s).padStart(2, '0')} с` : `${s} с`;
}
