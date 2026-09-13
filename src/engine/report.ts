import type { ArtifactInstance, BattleLog, GearInstance, HeroPersistent, RunPhase, RunState, RunStats } from './types';
import { GAME_VERSION } from './types';
import { ROOMS_PER_LOCATION } from '../data/locations';
import { currentLocation, currentRoomKind, heroStats } from './run';

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
  detail: RunReportDetail;
}

/** Полная картина для разбора: снаряжение как есть, цифры, бои без строк лога (строки — десятки килобайт). */
export interface RunReportDetail {
  hero: HeroPersistent;
  stats: RunStats;
  locations: string[];
  locationIndex: number;
  roomIndex: number;
  /** Вид события, если герой в нём. */
  event: string | null;
  battles: Omit<BattleLog, 'lines'>[];
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
  const last = run.logs.at(-1);
  return {
    event: ctx.event,
    version: GAME_VERSION,
    debug: ctx.debug,
    player: ctx.player,
    playerRuns: ctx.playerRuns,
    hero: run.hero.defId,
    seed: run.seed,
    phase: run.phase,
    act: run.locationIndex + 1,
    location: currentLocation(run).id,
    // После победы roomIndex уже за краем этажа — победа записывается клеткой босса.
    room: Math.min(run.roomIndex, ROOMS_PER_LOCATION - 1) + 1,
    roomKind: run.event ? `event:${run.event.kind}` : currentRoomKind(run),
    locations: run.locations.join(','),
    roomsCleared: s.roomsCleared,
    kills: s.kills,
    turns: s.turns,
    damageDealt: s.damageDealt,
    damageTaken: s.damageTaken,
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
    battles: run.logs.length,
    detail: {
      hero: run.hero,
      stats: s,
      locations: run.locations,
      locationIndex: run.locationIndex,
      roomIndex: run.roomIndex,
      event: run.event?.kind ?? null,
      battles: run.logs.map(({ title, result, turns }) => ({ title, result, turns })),
    },
  };
}
