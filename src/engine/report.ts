import type { ArtifactInstance, BattleLog, GearInstance, HeroPersistent, RunPhase, RunState, RunStats } from './types';
import { GAME_VERSION } from './types';
import { ROOMS_PER_LOCATION } from '../data/locations';
import { battleTitle, currentLocation, currentRoomKind, effectiveRoomKind, heroStats } from './run';

// ─── Запись статистики забега ───────────────────────────────────────────────
// Игра на Pages шлёт одну такую запись на каждый законченный или брошенный забег (ui/telemetry.ts → Google Таблица).
// Здесь только сборка из RunState — чистая функция, чтобы тесты фиксировали формат: колонка таблицы = поле записи.

/** Чем закончился забег: победа, гибель или брошен (новый забег поверх незаконченного, «Бросить забег» в паузе). */
export type RunReportEvent = 'victory' | 'defeat' | 'abandoned';

/** Что движок не знает сам: кто играет, когда и всерьёз ли. */
export interface ReportContext {
  event: RunReportEvent;
  /** Анонимный id игрока из профиля — чтобы считать людей, а не забеги. */
  player: string;
  /** Сколько забегов игрок закончил до этого (профиль считает победы и гибели, брошенные — нет). */
  playerRuns: number;
  /** Отладочный забег (`?hero=`) или отправка с машины разработчика — в общие цифры не идёт. */
  debug: boolean;
  /** Момент записи, мс эпохи: длительность брошенного забега считается до него. */
  now: number;
  /** Уровень мастерства героя на старте забега (v0.45); нет — 0. */
  heroLevel?: number;
}

/**
 * Одна запись — строка таблицы: плоские поля становятся колонками, `detail` — ячейкой с JSON.
 * Ничего личного: ни имени, ни адреса; id игрока — случайная строка из профиля.
 */
export interface RunReport {
  event: RunReportEvent;
  version: string;
  debug: boolean;
  player: string;
  playerRuns: number;
  hero: string;
  /** Врождённый навык, с которым начат забег (v0.33: у героя их два на выбор; с v0.44 — вне сокетов, уровень по локации). */
  signature: string;
  /** Черта героя (v0.44, data/traits.ts); пусто — у забега черты нет. */
  trait: string;
  /** Уровень мастерства героя (v0.45). */
  heroLevel: number;
  /** Сколько вещей было закрыто в этом забеге (v0.45): 0 — открыт весь пул. */
  locked: number;
  /** База стартового оружия (v0.45): родная или вариант мастерства. */
  start: string;
  /** Испытания локаций по порядку (v0.48), через запятую: «pack,acid,cannonade»; пусто — без испытаний. */
  trials: string;
  seed: number;
  /** Фаза в момент записи: у победы и гибели — они же, у брошенного — где бросили (map, battle, shop…). */
  phase: RunPhase;
  /** Акт 1..3 и клетка 1..10; у победы — 3 и 10. */
  act: number;
  location: string;
  room: number;
  /** Вид клетки; внутри события — его вид: «event:shop». */
  roomKind: string;
  /** Три локации забега по порядку через запятую. */
  locations: string;
  roomsCleared: number;
  kills: number;
  turns: number;
  damageDealt: number;
  damageTaken: number;
  /** Секунды от старта до конца (у брошенного — до момента записи) по часам, как таймер в топбаре. */
  duration: number;
  gold: number;
  hp: number;
  maxHp: number;
  /** База и тир, аффикс через плюс: «sword@3 +crit». */
  weapon: string;
  armor: string;
  /** Все артефакты в сокетах с тирами через пробел: «fireball@2 whirlwind@1». */
  artifacts: string;
  potion: string;
  /** Заголовок последнего боя — при гибели это и есть «кто убил». */
  lastBattle: string;
  battles: number;
  /**
   * Доля урона по HP врагов от базового удара за весь забег, проценты (v0.42). Главная метрика реворка сборок:
   * у бота до него было 50–97 %; сборка, в которой связка работает, должна опускать её ниже половины.
   */
  attackShare: number;
  detail: RunReportDetail;
}

/** Бой в записи: как в журнале, но без строк лога и разбора урона. Незакрытый бой (забег брошен посреди него) — `unfinished`. */
export type ReportBattle = Pick<BattleLog, 'title' | 'kind' | 'result' | 'turns'> | { title: string; kind: BattleLog['kind']; result: 'unfinished'; turns: number };

/** Полная картина для разбора: снаряжение как есть, цифры, бои без строк лога (строки — десятки килобайт). */
export interface RunReportDetail {
  hero: HeroPersistent;
  stats: RunStats;
  locations: string[];
  locationIndex: number;
  roomIndex: number;
  /** Вид события, если герой в нём. */
  event: string | null;
  battles: ReportBattle[];
  /** Урон по HP врагов за забег по источникам (v0.42): `attack`, id артефактов, `dot`, `thorns`, `riposte`, `ally`, `potion`. */
  dealt: Record<string, number>;
}

/** «sword@3 +crit»: база, тир и стат аффикса — достаточно, чтобы фильтровать таблицу; имя и цифры лежат в detail. */
function gearShort(g: GearInstance): string {
  return `${g.base}@${g.tier}${g.affix ? ` +${g.affix.stat}` : ''}`;
}

function artifactsShort(hero: HeroPersistent): string {
  return [hero.weapon, hero.armor]
    .flatMap((g) => g.slots)
    .filter((a): a is ArtifactInstance => a !== null)
    .map((a) => `${a.id}@${a.tier}`)
    .join(' ');
}

export function runReport(run: RunState, ctx: ReportContext): RunReport {
  const s = run.stats;
  const finished = s.finishedAt || ctx.now;
  // Бой ещё не закрыт: гибель уходит в момент, когда герой пал, а брошенный забег — прямо посреди боя.
  // Его цифры сворачивает в run.stats только finishBattle, так что здесь они подмешиваются вручную — иначе последний
  // бой пропал бы из записи целиком (а при гибели это ровно тот бой, который и интересен).
  const b = run.battle;
  const live: ReportBattle | null = b
    ? { title: battleTitle(run), kind: effectiveRoomKind(run), result: b.phase === 'lost' ? 'lost' : b.phase === 'won' ? (b.fled ? 'fled' : 'won') : 'unfinished', turns: b.turn }
    : null;
  const stats: RunStats = b
    ? { ...s, kills: s.kills + b.stats.kills, turns: s.turns + b.turn, damageDealt: s.damageDealt + b.stats.damageDealt, damageTaken: s.damageTaken + b.stats.damageTaken }
    : s;
  const battles: ReportBattle[] = run.logs.map(({ title, kind, result, turns }) => ({ title, kind, result, turns }));
  if (live) battles.push(live);
  const dealt: Record<string, number> = {};
  for (const src of [...run.logs.map((l) => l.dealt ?? {}), b?.dealtBy ?? {}]) for (const [k, v] of Object.entries(src)) dealt[k] = (dealt[k] ?? 0) + v;
  const dealtTotal = Object.values(dealt).reduce((a, v) => a + v, 0);
  const last = battles.at(-1);
  return {
    event: ctx.event,
    version: GAME_VERSION,
    debug: ctx.debug,
    player: ctx.player,
    playerRuns: ctx.playerRuns,
    hero: run.hero.defId,
    signature: run.hero.signature,
    trait: run.hero.trait ?? '',
    heroLevel: ctx.heroLevel ?? 0,
    locked: run.hero.locked?.length ?? 0,
    start: run.hero.start ?? '',
    trials: (run.trialLog ?? []).join(','),
    seed: run.seed,
    phase: run.phase,
    act: run.locationIndex + 1,
    location: currentLocation(run).id,
    // После победы roomIndex уже за краем этажа — победа записывается клеткой босса.
    room: Math.min(run.roomIndex, ROOMS_PER_LOCATION - 1) + 1,
    roomKind: run.event ? `event:${run.event.kind}` : currentRoomKind(run),
    locations: run.locations.join(','),
    roomsCleared: stats.roomsCleared,
    kills: stats.kills,
    turns: stats.turns,
    damageDealt: stats.damageDealt,
    damageTaken: stats.damageTaken,
    duration: s.startedAt ? Math.max(0, Math.round((finished - s.startedAt) / 1000)) : 0,
    gold: run.gold,
    // Посреди боя живое HP — в бою, вне боя — у героя.
    hp: run.battle?.hero.hp ?? run.hero.hp,
    maxHp: run.battle?.hero.maxHp ?? heroStats(run).maxHp,
    weapon: gearShort(run.hero.weapon),
    armor: gearShort(run.hero.armor),
    artifacts: artifactsShort(run.hero),
    potion: run.hero.potion ?? '',
    lastBattle: last?.title ?? '',
    battles: battles.length,
    attackShare: dealtTotal > 0 ? Math.round(((dealt.attack ?? 0) / dealtTotal) * 100) : 0,
    detail: {
      hero: run.hero,
      stats,
      locations: run.locations,
      locationIndex: run.locationIndex,
      roomIndex: run.roomIndex,
      event: run.event?.kind ?? null,
      battles,
      dealt,
    },
  };
}
