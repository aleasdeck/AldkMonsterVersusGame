import type { ArchetypeId, ArtifactInstance, DerivedStats, Difficulty, EventKind, GearKind, LootItem, PlayerAction, RewardFocus, RewardScreen, RoomKind, RunState } from './types';
import { MAX_ENEMIES, SAVE_VERSION } from './types';
import { chance, createRng, pick, shuffle } from './rng';
import { defaultSignature, heroDef } from '../data/heroes';
import { makeStartingGear, upgradeGearTier } from '../data/gear';
import { ACTS, ACTS_PER_RUN, BOSS_HEAL_PCT, ROOMS_PER_LOCATION, ROOM_NAMES, locationDef, pickRunLocations, roomKind, type ActDef, type LocationDef } from '../data/locations';
import { createBattle, endTurn, enemyStep, performAction } from './combat';
import { computeStats, heroStatsOf, innateOf } from './stats';
import { addArtifact, canPlaceArtifact, equipGear, findSameArtifact, gearOf, replaceArtifact, socketRefs, type SocketRef } from './equipment';
import { activeSets, archetypeCounts, artifactTags } from '../data/archetypes';
import { trialValue, trialsOf } from '../data/trials';
import { boonsOf } from '../data/boons';
import {
  ALTAR_HEAL_PCT,
  ALTAR_SACRIFICE_PCT,
  GNOME_ART_CHANCE,
  GNOME_BOUNTY,
  POTION_DROP_CHANCE,
  REROLL_COST,
  SHOP_HEAL_COST,
  SHOP_HEAL_PCT,
  SHOP_POTION_PRICE,
  START_GOLD,
  artifactPrice,
  forgePrice,
  gearPrice,
  goldReward,
  potionRewardScreen,
  rollArtifact,
  rollBossRewards,
  rollEventKind,
  rollGear,
  rollPotion,
  rollRewardOptions,
  rollRewards,
  rollShop,
} from './loot';

/** Враги событий «Вор»: деньгокрад режет кошель, вещекрад тянет артефакт. */
const GNOME_ID = 'gnome_thief';
const GNOME_ART_ID = 'gnome_snatcher';

export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

/**
 * `now` — момент старта; тесты и симулятор могут подставить свой, чтобы состояние не зависело от часов.
 * `signature` — с каким из пары персональных артефактов начать (по умолчанию первый); чужой id — ошибка.
 */
/** Что задаёт мастерство (v0.45): закрытые артефакты и вариант стартового оружия. */
export interface RunOpts {
  locked?: string[];
  start?: string;
  /**
   * Сложность забега: «Сложный» — испытания локаций (v0.48), «Лёгкий» — благословения. Тесты движка по умолчанию играют
   * на «Среднем» — без выбора перед локацией.
   */
  difficulty?: Difficulty;
}

export function newRun(
  heroId: string,
  seed: number = randomSeed(),
  now: number = Date.now(),
  signature: string = defaultSignature(heroDef(heroId)),
  trait: string = heroDef(heroId).traits[0],
  opts: RunOpts = {},
): RunState {
  const def = heroDef(heroId);
  if (!def.signatures.includes(signature)) throw new Error(`Not a signature of ${heroId}: ${signature}`);
  if (!def.traits.includes(trait)) throw new Error(`Not a trait of ${heroId}: ${trait}`);
  const gear = makeStartingGear(def, opts.start);
  const stats = computeStats(def, gear.weapon, gear.armor, { innate: { id: signature, tier: 1 }, trait });
  const rng = createRng(seed);
  const run: RunState = {
    version: SAVE_VERSION,
    seed,
    debug: false,
    reported: false,
    rng,
    hero: { defId: heroId, signature, innateTier: 1, trait, locked: opts.locked ?? [], start: gear.weapon.base, hp: stats.maxHp, weapon: gear.weapon, armor: gear.armor, potion: null },
    gold: START_GOLD,
    locations: pickRunLocations(rng),
    locationIndex: 0,
    roomIndex: 0,
    phase: 'map',
    battle: null,
    rewards: [],
    shop: null,
    event: null,
    pending: null,
    stats: { kills: 0, turns: 0, damageDealt: 0, damageTaken: 0, roomsCleared: 0, startedAt: now, finishedAt: 0 },
    logs: [],
    setsReached: [],
    bossSets: [],
    difficulty: opts.difficulty ?? 'normal',
    trial: null,
    trialOffer: [],
    trialLog: [],
    boon: null,
    boonOffer: [],
    boonLog: [],
    encounters: [],
  };
  offerThreshold(run);
  return run;
}

// ─── Порог локации: испытания (v0.48) и благословения ─────────────────────

/**
 * Предложение перед локацией по сложности забега: на «Сложном» — два испытания из трёх, на «Лёгком» — два благословения
 * из трёх, на «Среднем» — ничего. Прежний выбор снимается: испытание и благословение действуют только до конца локации.
 */
export function offerThreshold(run: RunState): void {
  run.trial = null;
  run.trialOffer = [];
  run.boon = null;
  run.boonOffer = [];
  if (run.difficulty === 'hard') offerTrials(run);
  else if (run.difficulty === 'easy') offerBoons(run);
}

/** Два случайных испытания из трёх испытаний локации: выбор обязателен до первой клетки. */
export function offerTrials(run: RunState): void {
  const pool = trialsOf(currentLocation(run).id).map((t) => t.id);
  run.trial = null;
  run.trialOffer = shuffle(run.rng, pool).slice(0, 2);
}

/** Два случайных благословения из трёх благословений локации — как испытания, только в пользу героя. */
export function offerBoons(run: RunState): void {
  const pool = boonsOf(currentLocation(run).id).map((b) => b.id);
  run.boon = null;
  run.boonOffer = shuffle(run.rng, pool).slice(0, 2);
}

/** Ждёт ли забег выбора испытания: пока не выбрано, в клетку не войти. */
export function awaitsTrial(run: RunState): boolean {
  return run.trial === null && run.trialOffer.length > 0;
}

/** Ждёт ли забег выбора благословения. */
export function awaitsBoon(run: RunState): boolean {
  return run.boon === null && run.boonOffer.length > 0;
}

/** Порог локации не пройден: ждёт выбора испытания или благословения. */
export function awaitsThreshold(run: RunState): boolean {
  return awaitsTrial(run) || awaitsBoon(run);
}

export function canChooseTrial(run: RunState, id: string): string | null {
  if (!awaitsTrial(run)) return 'Испытание уже выбрано';
  if (!run.trialOffer.includes(id)) return 'Этого испытания нет в предложении';
  return null;
}

export function chooseTrial(run: RunState, id: string): boolean {
  if (canChooseTrial(run, id)) return false;
  run.trial = id;
  run.trialOffer = [];
  run.trialLog.push(id);
  return true;
}

export function canChooseBoon(run: RunState, id: string): string | null {
  if (!awaitsBoon(run)) return 'Благословение уже выбрано';
  if (!run.boonOffer.includes(id)) return 'Этого благословения нет в предложении';
  return null;
}

export function chooseBoon(run: RunState, id: string): boolean {
  if (canChooseBoon(run, id)) return false;
  run.boon = id;
  run.boonOffer = [];
  run.boonLog.push(id);
  return true;
}

/** Локация по номеру акта в этом забеге. */
export function runLocation(run: RunState, index: number): LocationDef {
  return locationDef(run.locations[Math.max(0, Math.min(index, run.locations.length - 1))]);
}

export function currentLocation(run: RunState): LocationDef {
  return runLocation(run, run.locationIndex);
}

/** Награды и тиры лута текущего акта — не зависят от того, какая локация выпала. */
export function currentAct(run: RunState): ActDef {
  return ACTS[Math.max(0, Math.min(run.locationIndex, ACTS.length - 1))];
}

export function currentRoomKind(run: RunState): RoomKind {
  return roomKind(run.roomIndex);
}

/** Чем считать текущую комнату для золота и наград: элита из события — элитой, остальное — по клетке. */
export function effectiveRoomKind(run: RunState): RoomKind {
  return run.event?.kind === 'elite' ? 'elite' : currentRoomKind(run);
}

export function heroStats(run: RunState): DerivedStats {
  return heroStatsOf(heroDef(run.hero.defId), run.hero);
}

export function isRunOver(run: RunState): boolean {
  return run.phase === 'victory' || run.phase === 'defeat';
}

/** Пересчитать HP после изменения максимума: прирост добавляется, излишек срезается. */
function syncMaxHp(run: RunState, before: number): void {
  const after = heroStats(run).maxHp;
  if (after > before) run.hero.hp += after - before;
  run.hero.hp = Math.max(0, Math.min(run.hero.hp, after));
}

// ─── Комнаты ───────────────────────────────────────────────────────────────

export function enterRoom(run: RunState): void {
  if (run.phase !== 'map' || awaitsThreshold(run)) return;
  const kind = currentRoomKind(run);
  if (kind === 'event') {
    startEvent(run, rollEventKind(run.rng));
    return;
  }
  if (kind === 'shop') {
    openShop(run);
    return;
  }
  startBattle(run, kind);
}

function startBattle(run: RunState, kind: 'fight' | 'elite' | 'boss'): void {
  const loc = currentLocation(run);
  const table =
    kind === 'fight'
      ? run.roomIndex < 2
        ? loc.encounters.fight1
        : loc.encounters.fight2
      : kind === 'elite'
        ? loc.encounters.elite
        : loc.encounters.boss;
  // Встреча не повторяется в локации, пока в таблице есть несыгранные (v0.53.1). Выбор с возвратом давал второй бой, как
  // первый, в каждой шестой локации, а хоть один повтор за локацию — почти в каждой второй. Сыгранное — в `run.encounters`;
  // у босса вариант один, и когда таблица кончилась, выбор идёт из всей.
  const played = (run.encounters ??= []);
  const keyOf = (enc: string[]) => `${run.locationIndex}:${enc.join(',')}`;
  const fresh = table.filter((enc) => !played.includes(keyOf(enc)));
  let ids = pick(run.rng, fresh.length ? fresh : table);
  played.push(keyOf(ids));
  // «Стая» и «Кладка» (v0.48): лишний противник в каждом бою, кроме босса.
  const extra = run.trial === 'pack' ? 'wolf' : run.trial === 'clutch' ? 'egg_cluster' : null;
  if (extra && kind !== 'boss' && ids.length < MAX_ENEMIES) ids = [...ids, extra];
  run.battle = createBattle(heroDef(run.hero.defId), run.hero, ids, run.rng, run.locationIndex, run.trial, run.boon);
  run.phase = 'battle';
  noteSets(run);
}

/**
 * Набор 3/3 засчитывается, как только сработал (v0.45): в бой герой вошёл с тремя вещами архетипа — достижение забега.
 * Засчитывается и в проигранном забеге.
 */
function noteSets(run: RunState): void {
  for (const arch of fullSets(run)) if (!run.setsReached.includes(arch)) run.setsReached.push(arch);
}

/** Архетипы, у которых сейчас сработал набор 3/3: вставленные артефакты и навык героя. */
export function fullSets(run: RunState): ArchetypeId[] {
  const arts = socketRefs(run.hero).flatMap((r) => (r.art ? [r.art] : []));
  const innate = innateOf(run.hero);
  if (innate) arts.push(innate);
  return activeSets(archetypeCounts(arts))
    .filter((s) => s.count >= 3 && s.arch.sets[3])
    .map((s) => s.arch.id);
}

/**
 * Войти в событие известного вида. Сам вид разыгрывает enterRoom по весам EVENT_WEIGHTS;
 * тесты и debug-параметры задают его напрямую. Содержимое сундука и алтаря выпадает при входе.
 */
export function startEvent(run: RunState, kind: EventKind): void {
  if (run.phase !== 'map') return;
  const act = currentAct(run);
  switch (kind) {
    case 'camp':
      run.event = { kind };
      run.phase = 'camp';
      return;
    case 'shop':
      run.event = { kind };
      openShop(run);
      return;
    case 'elite':
      run.event = { kind };
      startBattle(run, 'elite');
      return;
    case 'chest':
      run.event = { kind, gear: rollGear(run.rng, run.hero, act.gearTiers, undefined, act.rareGear) };
      run.phase = 'event';
      return;
    case 'altar':
      run.event = { kind, artifact: rollArtifact(run.rng, run.hero, act.artTiers, []) };
      run.phase = 'event';
      return;
    case 'forge':
      run.event = { kind };
      run.phase = 'event';
      return;
    case 'gnome':
    case 'gnome_art':
      // Вор не даёт выбора «войти или пройти мимо»: он уже тянет руку к кошельку, драка начинается сразу. Испытание бой
      // с вором не видит (лишний враг или засада сломали бы бегство), благословение — видит: «в каждом бою».
      run.event = kind === 'gnome' ? { kind, result: 'fight', gold: 0, artifact: null } : { kind, result: 'fight', gold: 0, artifact: null, loot: null };
      run.battle = createBattle(heroDef(run.hero.defId), run.hero, [kind === 'gnome' ? GNOME_ID : GNOME_ART_ID], run.rng, run.locationIndex, null, run.boon);
      run.phase = 'battle';
      return;
  }
}

/** Следующая клетка; после последней — следующая локация без остановки, после третьего босса — победа. */
export function advanceRoom(run: RunState): void {
  run.battle = null;
  run.event = null;
  run.rewards = [];
  run.shop = null;
  run.pending = null;
  run.roomIndex += 1;
  if (run.roomIndex >= ROOMS_PER_LOCATION) {
    if (run.locationIndex >= ACTS_PER_RUN - 1) {
      run.phase = 'victory';
      return;
    }
    run.locationIndex += 1;
    run.roomIndex = 0;
    // Врождённый навык растёт с каждой локацией (v0.44): уровень — номер локации.
    const before = heroStats(run).maxHp;
    run.hero.innateTier = Math.min(3, run.locationIndex + 1) as ArtifactInstance['tier'];
    syncMaxHp(run, before);
    // Новая локация — новые испытания или благословения.
    offerThreshold(run);
  }
  run.phase = 'map';
}

// ─── Бой ───────────────────────────────────────────────────────────────────

export function battleAction(run: RunState, action: PlayerAction): void {
  if (!run.battle) throw new Error('No battle');
  performAction(run.battle, action, run.rng);
}

export function battleEndTurn(run: RunState): void {
  if (!run.battle) throw new Error('No battle');
  endTurn(run.battle);
}

export function battleEnemyStep(run: RunState): void {
  if (!run.battle) throw new Error('No battle');
  enemyStep(run.battle, run.rng);
}

/** Заголовок боя для журнала: «Акт 1 · Лес · Бой 2: Волк, Волк». Элита из события подписывается элитой. */
export function battleTitle(run: RunState): string {
  const kind = effectiveRoomKind(run);
  const roster = run.battle?.roster.join(', ') ?? '';
  return `Акт ${run.locationIndex + 1} · ${currentLocation(run).name} · ${ROOM_NAMES[kind]} ${run.roomIndex + 1}: ${roster}`;
}

/** Закрыть бой после победы или поражения: перенести HP, статистику, выдать награды. */
export function finishBattle(run: RunState): void {
  const b = run.battle;
  if (!b || (b.phase !== 'won' && b.phase !== 'lost')) return;
  run.stats.kills += b.stats.kills;
  run.stats.turns += b.turn;
  run.stats.damageDealt += b.stats.damageDealt;
  run.stats.damageTaken += b.stats.damageTaken;
  run.logs.push({ title: battleTitle(run), kind: effectiveRoomKind(run), result: b.phase === 'won' && b.fled ? 'fled' : b.phase, turns: b.turn, dealt: { ...b.dealtBy }, lines: b.log.slice(), marks: b.logMarks.slice() });
  if (b.phase === 'lost') {
    run.hero.hp = 0;
    run.battle = null;
    run.phase = 'defeat';
    return;
  }
  run.hero.hp = b.hero.hp;
  // Выпитое в бою зелье не возвращается; невыпитое остаётся в слоте.
  run.hero.potion = b.hero.potion;
  // «Целебные травы»: после выигранного боя (вор, удравший с добычей, — не победа) герой подлечивается.
  const herbs = b.boon === 'herbs' && !b.fled ? healAmount(run, 0, trialValue(4, run.locationIndex)) : 0;
  run.hero.hp += herbs;
  run.stats.roomsCleared += 1;
  const kind = effectiveRoomKind(run);
  const act = currentAct(run);
  if (run.event?.kind === 'gnome') {
    run.battle = null;
    finishGnome(run, b.fled, b.stolen, act);
    return;
  }
  if (run.event?.kind === 'gnome_art') {
    run.battle = null;
    finishSnatcher(run, b.fled, b.stolenArtifact, act);
    return;
  }
  run.battle = null;
  run.gold += goldReward(kind);
  if (kind === 'boss') {
    // Достижение «босс с набором 3/3» (v0.45): набор, с которым герой закончил бой с боссом.
    for (const arch of fullSets(run)) if (!run.bossSets.includes(arch)) run.bossSets.push(arch);
    // Привала после босса нет: герой сразу подлечивается и идёт дальше. Сколько дало — подписью на трофее.
    const heal = bossHealAmount(run);
    run.hero.hp += heal;
    run.rewards = rollBossRewards(run.rng, run.hero, act);
    if (run.rewards[0] && heal > 0) run.rewards[0].note = `Раны затянулись: +${heal} HP (${run.hero.hp}/${heroStats(run).maxHp}). Можно взять только одно.`;
  } else {
    // Пул («Нападение» / «Защита») игрок выбирает вслепую, бросок — после выбора (chooseRewardFocus).
    const source = kind === 'elite' ? 'elite' : 'fight';
    run.rewards = [{ title: kind === 'elite' ? 'Награда за элиту' : 'Награда', source, options: [], rerolled: false }];
    if (herbs > 0) run.rewards[0].note = `Целебные травы: +${herbs} HP. Можно взять только одно.`;
  }
  // С любого монстра может выпасть зелье — отдельным экраном после награды. После финального босса некуда: забег окончен.
  const finalBoss = kind === 'boss' && !act.bossGearTier;
  if (!finalBoss && chance(run.rng, POTION_DROP_CHANCE)) run.rewards.push(potionRewardScreen(rollPotion(run.rng, run.hero)));
  if (run.rewards.length === 0) {
    advanceRoom(run);
    return;
  }
  run.phase = 'reward';
}

// ─── Гном-деньгокрад ───────────────────────────────────────────────────────

/**
 * Итог боя с вором отдельным экраном: удрал — унёс срезанное (больше, чем есть в кошеле, не унесёт),
 * убит — герой забирает украденное обратно, мешок вора сверху и с шансом GNOME_ART_CHANCE артефакт.
 */
function finishGnome(run: RunState, fled: boolean, stolen: number, act: ActDef): void {
  if (fled) {
    const lost = Math.min(stolen, run.gold);
    run.gold -= lost;
    run.event = { kind: 'gnome', result: 'fled', gold: lost, artifact: null };
  } else {
    const gold = stolen + GNOME_BOUNTY;
    run.gold += gold;
    const artifact = chance(run.rng, GNOME_ART_CHANCE) ? rollArtifact(run.rng, run.hero, act.artTiers, []) : null;
    run.event = { kind: 'gnome', result: 'slain', gold, artifact };
  }
  run.phase = 'event';
}

/**
 * Итог боя с вещекрадом: удрал — стянутый артефакт выдирается из сокета навсегда (сокет пустеет, максимум HP пересчитывается),
 * убит — вещь так и осталась на месте. Красть было нечего — за труд платят золотом, иначе награда и есть спасённый артефакт.
 */
function finishSnatcher(run: RunState, fled: boolean, stolen: ArtifactInstance | null, act: ActDef): void {
  if (fled) {
    if (stolen) {
      const before = heroStats(run).maxHp;
      const slot = socketRefs(run.hero).find((s) => s.art?.id === stolen.id && s.art?.tier === stolen.tier);
      if (slot) gearOf(run.hero, slot.kind).slots[slot.index] = null;
      syncMaxHp(run, before);
    }
    run.event = { kind: 'gnome_art', result: 'fled', gold: 0, artifact: stolen, loot: null };
    run.phase = 'event';
    return;
  }
  // В мешке у вора не только твоё: с тем же шансом, что у брата, оттуда выпадает чужой артефакт.
  // Золотом это событие не выкупить (проверено симулятором: +12 золота не сдвинули Мага ни на пункт), а артефакт — рычаг.
  const loot = chance(run.rng, GNOME_ART_CHANCE) ? rollArtifact(run.rng, run.hero, act.artTiers, []) : null;
  run.event = { kind: 'gnome_art', result: 'slain', gold: 0, artifact: stolen, loot };
  run.phase = 'event';
}

/** Забрать артефакт из мешка вора: как жертва на алтаре — размещение без отмены, потом дальше по этажу. */
export function gnomeTakeLoot(run: RunState): boolean {
  const ev = run.event;
  if (run.phase !== 'event' || run.pending) return false;
  if (ev?.kind === 'gnome_art') {
    if (ev.result !== 'slain' || !ev.loot) return false;
    const found = ev.loot;
    ev.loot = null;
    giveArtifact(run, { kind: 'artifact', artifact: found }, { cancellable: false, consumeReward: false });
    if (!run.pending) advanceRoom(run);
    return true;
  }
  if (ev?.kind !== 'gnome' || ev.result !== 'slain' || !ev.artifact) return false;
  const artifact = ev.artifact;
  ev.artifact = null;
  giveArtifact(run, { kind: 'artifact', artifact }, { cancellable: false, consumeReward: false });
  if (!run.pending) advanceRoom(run);
  return true;
}

// ─── Награды и размещение ──────────────────────────────────────────────────

/**
 * Выдать артефакт. Дубликат апгрейдит стоящий сразу; новый артефакт ждёт выбора слота
 * (игрок сам решает, куда ставить и что заменять).
 */
function giveArtifact(run: RunState, art: LootItem & { kind: 'artifact' }, opts: { cancellable: boolean; consumeReward: boolean }): void {
  if (findSameArtifact(run.hero, art.artifact.id)) {
    const before = heroStats(run).maxHp;
    addArtifact(run.hero, art.artifact);
    syncMaxHp(run, before);
    return;
  }
  run.pending = { artifacts: [art.artifact], cancellable: opts.cancellable, consumeReward: opts.consumeReward };
}

function giveGear(run: RunState, gear: LootItem & { kind: 'gear' }): void {
  const before = heroStats(run).maxHp;
  const overflow = equipGear(run.hero, gear.gear);
  syncMaxHp(run, before);
  if (overflow.length > 0) run.pending = { artifacts: overflow, cancellable: false, consumeReward: false };
}

function afterReward(run: RunState): void {
  if (run.rewards.length === 0) advanceRoom(run);
}

/** Экран награды ждёт выбора пула: награда за бой или элиту, пул ещё не выбран. */
export function awaitsFocus(screen: RewardScreen | undefined): boolean {
  return !!screen && (screen.source === 'fight' || screen.source === 'elite') && !screen.focus;
}

/** Почему сейчас нельзя выбрать пул награды; null — можно. */
export function canChooseFocus(run: RunState): string | null {
  if (run.phase !== 'reward' || run.pending) return 'Сейчас нельзя';
  if (!awaitsFocus(run.rewards[0])) return 'Пул уже выбран';
  return null;
}

/**
 * Выбор пула награды (v0.39): «Нападение» — оружие и оружейные артефакты, «Защита» — броня и бронные.
 * Выбор слепой: три варианта катятся только после него, переброс перебрасывает внутри выбранного пула.
 */
export function chooseRewardFocus(run: RunState, focus: RewardFocus): boolean {
  if (canChooseFocus(run)) return false;
  const screen = run.rewards[0];
  screen.focus = focus;
  screen.options = rollRewards(run.rng, run.hero, currentAct(run), screen.source as 'fight' | 'elite', focus);
  return true;
}

export function takeReward(run: RunState, index: number): void {
  if (run.phase !== 'reward' || run.pending) return;
  const screen = run.rewards[0];
  const item = screen?.options[index];
  if (!item) return;
  if (item.kind === 'artifact') {
    giveArtifact(run, item, { cancellable: true, consumeReward: true });
    if (run.pending) return; // ждём выбора слота, награда ещё на экране
    run.rewards.shift();
    afterReward(run);
    return;
  }
  run.rewards.shift();
  if (item.kind === 'potion') {
    // Слот один: новое зелье вытесняет старое.
    run.hero.potion = item.potion;
    afterReward(run);
    return;
  }
  giveGear(run, item);
  if (!run.pending) afterReward(run);
}

export function skipReward(run: RunState): void {
  if (run.phase !== 'reward' || run.pending) return;
  run.rewards.shift();
  afterReward(run);
}

/** Почему нельзя перебросить текущую награду; null — можно. */
export function canReroll(run: RunState): string | null {
  if (run.phase !== 'reward' || run.pending) return 'Сейчас нельзя';
  const screen = run.rewards[0];
  if (!screen) return 'Нет награды';
  if (screen.source === 'potion') return 'Зелье не перебросить';
  if (awaitsFocus(screen)) return 'Сначала выберите пул';
  if (screen.rerolled) return 'Переброс уже использован';
  if (run.gold < REROLL_COST) return `Нужно ${REROLL_COST} золота`;
  return null;
}

/** Перебросить варианты награды за золото. Один раз на экран. */
export function rerollReward(run: RunState): boolean {
  if (canReroll(run)) return false;
  const screen = run.rewards[0];
  run.gold -= REROLL_COST;
  screen.rerolled = true;
  screen.options = rollRewardOptions(run.rng, run.hero, currentAct(run), screen.source, screen.focus);
  return true;
}

function continueAfterPending(run: RunState): void {
  if (run.phase === 'reward') afterReward(run);
  else if (run.phase === 'event') advanceRoom(run);
  // В магазине после покупки остаёмся: уйти игрок решает сам.
}

function finishPendingStep(run: RunState): void {
  const p = run.pending;
  if (!p || p.artifacts.length > 0) return;
  run.pending = null;
  if (p.consumeReward) run.rewards.shift();
  continueAfterPending(run);
}

/** Почему ожидающий артефакт нельзя поставить в этот сокет; null — можно. */
export function canPendingPlace(run: RunState, kind: GearKind, index: number): string | null {
  const art = run.pending?.artifacts[0];
  if (!art) return 'Нечего ставить';
  return canPlaceArtifact(run.hero, kind, index, art.id);
}

/**
 * Поставить ожидающий артефакт в слот (пустой или вместо стоящего). Неподходящий сокет — ничего не делает.
 * Вытесненный артефакт встаёт в конец очереди (v0.31): его можно переставить в другой сокет или выбросить.
 * После первой вставки отменить уже нельзя — награда потрачена, а очередь закрывается только «Выбросить».
 */
export function pendingPlace(run: RunState, kind: GearKind, index: number): boolean {
  const p = run.pending;
  if (!p || p.artifacts.length === 0 || canPendingPlace(run, kind, index)) return false;
  const before = heroStats(run).maxHp;
  const art = p.artifacts.shift()!;
  const removed = replaceArtifact(run.hero, kind, index, art);
  if (removed && removed.id !== art.id) {
    p.artifacts.push(removed);
    p.displaced = [...(p.displaced ?? []), removed.id];
  }
  p.cancellable = false;
  syncMaxHp(run, before);
  finishPendingStep(run);
  return true;
}

// ─── Переплавка (v0.43) ─────────────────────────────────────────────────────
// docs/plan-reworka.md §2.5: к середине второго акта сокеты полны, и находку было некуда деть. Лишний артефакт
// переплавляется в тир другому — того же архетипа (общая вещь — любому). Рюкзака и новой траты золота нет.

/** Куда можно переплавить артефакт: вставленные не на максимуме, с общей меткой архетипа; у общей вещи — любые. */
export function smeltTargets(run: RunState, id: string): SocketRef[] {
  const tags = artifactTags(id);
  return socketRefs(run.hero).filter((s) => s.art && s.art.tier < 3 && s.art.id !== id && (tags.length === 0 || artifactTags(s.art.id).some((t) => tags.includes(t))));
}

/** Почему ожидающий артефакт нельзя переплавить в этот сокет; null — можно. */
export function canPendingSmelt(run: RunState, kind: GearKind, index: number): string | null {
  const art = run.pending?.artifacts[0];
  if (!art) return 'Нечего переплавлять';
  const target = gearOf(run.hero, kind).slots[index];
  if (!target) return 'Сокет пуст';
  if (target.tier >= 3) return 'Уже максимальный тир';
  if (!smeltTargets(run, art.id).some((s) => s.kind === kind && s.index === index)) return 'Нет общего архетипа';
  return null;
}

/** Переплавить ожидающий артефакт: он пропадает, артефакт в сокете получает +1 тир. Отменить после этого нельзя. */
export function pendingSmelt(run: RunState, kind: GearKind, index: number): boolean {
  const p = run.pending;
  if (!p || p.artifacts.length === 0 || canPendingSmelt(run, kind, index)) return false;
  const before = heroStats(run).maxHp;
  p.artifacts.shift();
  const target = gearOf(run.hero, kind).slots[index]!;
  target.tier = (target.tier + 1) as ArtifactInstance['tier'];
  p.cancellable = false;
  syncMaxHp(run, before);
  finishPendingStep(run);
  return true;
}

/** Выбросить ожидающий артефакт. */
export function pendingDiscard(run: RunState): void {
  const p = run.pending;
  if (!p || p.artifacts.length === 0) return;
  p.artifacts.shift();
  finishPendingStep(run);
}

/** Передумать: вернуться к выбору награды, если она ещё не потрачена. */
export function pendingCancel(run: RunState): void {
  const p = run.pending;
  if (!p || !p.cancellable) return;
  run.pending = null;
}

// ─── События: сундук, алтарь, кузнец ───────────────────────────────────────

/** Лечение долей максимума `pct` плюс `flat`, но не сверх максимума. */
function healAmount(run: RunState, pct: number, flat = 0): number {
  const max = heroStats(run).maxHp;
  return Math.max(0, Math.min(Math.floor(max * pct) + flat, max - run.hero.hp));
}

/** Сколько HP вернёт босс локации. */
export function bossHealAmount(run: RunState): number {
  return healAmount(run, BOSS_HEAL_PCT);
}

/** Уйти из события ни с чем: захлопнуть сундук, пройти мимо алтаря или кузнеца. */
export function leaveEvent(run: RunState): void {
  if (run.phase !== 'event' || run.pending) return;
  advanceRoom(run);
}

/** Сундук: экипировка надевается сразу, старый предмет пропадает, лишние артефакты ждут выбора слота. */
export function takeChest(run: RunState): void {
  if (run.phase !== 'event' || run.event?.kind !== 'chest' || run.pending) return;
  giveGear(run, { kind: 'gear', gear: run.event.gear });
  if (!run.pending) advanceRoom(run);
}

export function altarHealAmount(run: RunState): number {
  return healAmount(run, ALTAR_HEAL_PCT);
}

/** Сколько HP заберёт жертва: доля максимума, но герой не умирает — остаётся хотя бы 1. */
export function altarSacrificeCost(run: RunState): number {
  const max = heroStats(run).maxHp;
  return Math.min(Math.floor(max * ALTAR_SACRIFICE_PCT), Math.max(0, run.hero.hp - 1));
}

/** Алтарь, молитва: восстановить долю максимума HP. */
export function altarPray(run: RunState): void {
  if (run.phase !== 'event' || run.event?.kind !== 'altar' || run.pending) return;
  run.hero.hp += altarHealAmount(run);
  advanceRoom(run);
}

/** Почему нельзя принести жертву; null — можно. */
export function canAltarSacrifice(run: RunState): string | null {
  if (run.phase !== 'event' || run.event?.kind !== 'altar') return 'Сейчас нельзя';
  if (run.pending) return 'Сначала разместите артефакт';
  if (!run.event.artifact) return 'Все артефакты уже на максимуме';
  return null;
}

/** Алтарь, жертва: отдать долю HP за артефакт. Дубликат апгрейдит стоящий, новый ждёт выбора слота без отмены. */
export function altarSacrifice(run: RunState): boolean {
  if (canAltarSacrifice(run)) return false;
  const ev = run.event;
  if (!ev || ev.kind !== 'altar' || !ev.artifact) return false;
  const artifact = ev.artifact;
  run.hero.hp -= altarSacrificeCost(run);
  giveArtifact(run, { kind: 'artifact', artifact }, { cancellable: false, consumeReward: false });
  if (!run.pending) advanceRoom(run);
  return true;
}

/** Почему кузнец не улучшит этот предмет; null — можно. */
export function canForge(run: RunState, kind: GearKind): string | null {
  if (run.phase !== 'event' || run.event?.kind !== 'forge') return 'Сейчас нельзя';
  if (run.pending) return 'Сначала разместите артефакт';
  const gear = gearOf(run.hero, kind);
  if (gear.tier >= 5) return 'Предел тира';
  return needGold(run, forgePrice(gear));
}

/** Кузнец: поднять тир оружия или брони на 1 за золото, один предмет за визит. */
export function forgeUpgrade(run: RunState, kind: GearKind): boolean {
  if (canForge(run, kind)) return false;
  const gear = gearOf(run.hero, kind);
  const before = heroStats(run).maxHp;
  run.gold -= forgePrice(gear);
  upgradeGearTier(run.rng, gear);
  syncMaxHp(run, before);
  advanceRoom(run);
  return true;
}

// ─── Торговец ──────────────────────────────────────────────────────────────

/** Торговец из события: товары раскладываются при входе. */
function openShop(run: RunState): void {
  run.shop = rollShop(run.rng, run.hero, currentAct(run));
  run.phase = 'shop';
}

/** Сколько HP даст лекарь сейчас: 30 % максимума, но не больше недостающего. */
export function shopHealAmount(run: RunState): number {
  const max = heroStats(run).maxHp;
  return Math.max(0, Math.min(Math.floor(max * SHOP_HEAL_PCT), max - run.hero.hp));
}

function shopOpen(run: RunState): string | null {
  if (run.phase !== 'shop' || !run.shop) return 'Магазин закрыт';
  if (run.pending) return 'Сначала разместите артефакт';
  return null;
}

function needGold(run: RunState, cost: number): string | null {
  return run.gold < cost ? `Нужно ${cost} золота` : null;
}

/** Почему нельзя купить лечение; null — можно. */
export function canShopHeal(run: RunState): string | null {
  const err = shopOpen(run);
  if (err) return err;
  if (run.shop!.healed) return 'Лекарь уже помог';
  if (shopHealAmount(run) <= 0) return 'HP и так полное';
  return needGold(run, SHOP_HEAL_COST);
}

export function canShopBuyGear(run: RunState): string | null {
  const err = shopOpen(run);
  if (err) return err;
  const gear = run.shop!.gear;
  if (!gear) return 'Продано';
  return needGold(run, gearPrice(gear));
}

export function canShopBuyArtifact(run: RunState): string | null {
  const err = shopOpen(run);
  if (err) return err;
  const art = run.shop!.artifact;
  if (!art) return 'Продано';
  return needGold(run, artifactPrice(art));
}

export function canShopBuyPotion(run: RunState): string | null {
  const err = shopOpen(run);
  if (err) return err;
  if (!run.shop!.potion) return 'Продано';
  return needGold(run, SHOP_POTION_PRICE);
}

export function canShopReroll(run: RunState): string | null {
  const err = shopOpen(run);
  if (err) return err;
  const shop = run.shop!;
  if (shop.rerolled) return 'Переброс уже использован';
  return needGold(run, REROLL_COST);
}

export function shopHeal(run: RunState): boolean {
  if (canShopHeal(run)) return false;
  run.hero.hp += shopHealAmount(run);
  run.gold -= SHOP_HEAL_COST;
  run.shop!.healed = true;
  return true;
}

/** Купить экипировку: надевается сразу, старая пропадает; лишние артефакты ждут выбора слота. */
export function shopBuyGear(run: RunState): boolean {
  if (canShopBuyGear(run)) return false;
  const gear = run.shop!.gear!;
  run.gold -= gearPrice(gear);
  run.shop!.gear = null;
  giveGear(run, { kind: 'gear', gear });
  return true;
}

/** Купить артефакт: дубликат апгрейдит стоящий, новый ждёт выбора слота. Отменить покупку нельзя. */
export function shopBuyArtifact(run: RunState): boolean {
  if (canShopBuyArtifact(run)) return false;
  const artifact = run.shop!.artifact!;
  run.gold -= artifactPrice(artifact);
  run.shop!.artifact = null;
  giveArtifact(run, { kind: 'artifact', artifact }, { cancellable: false, consumeReward: false });
  return true;
}

/** Купить зелье: ложится в слот, стоявшее там пропадает. */
export function shopBuyPotion(run: RunState): boolean {
  if (canShopBuyPotion(run)) return false;
  run.gold -= SHOP_POTION_PRICE;
  run.hero.potion = run.shop!.potion;
  run.shop!.potion = null;
  return true;
}

/** Перебросить прилавок за золото: новые экипировка, артефакт и зелье вместо любых, купленных в том числе, и лекарь снова готов помочь. Один раз за визит. */
export function shopReroll(run: RunState): boolean {
  if (canShopReroll(run)) return false;
  run.gold -= REROLL_COST;
  run.shop = { ...rollShop(run.rng, run.hero, currentAct(run)), rerolled: true };
  return true;
}

export function leaveShop(run: RunState): void {
  if (run.phase !== 'shop' || run.pending) return;
  advanceRoom(run);
}

// ─── Привал (из события) ───────────────────────────────────────────────────

export const CAMP_HEAL_PCT = 0.5;

export function campHealAmount(run: RunState): number {
  return healAmount(run, CAMP_HEAL_PCT);
}

export function campRest(run: RunState): void {
  if (run.phase !== 'camp') return;
  run.hero.hp += campHealAmount(run);
  advanceRoom(run);
}

export function campForge(run: RunState, kind: GearKind, index: number): boolean {
  if (run.phase !== 'camp') return false;
  const slot = gearOf(run.hero, kind).slots[index];
  if (!slot || slot.tier >= 3) return false;
  const before = heroStats(run).maxHp;
  slot.tier += 1;
  syncMaxHp(run, before);
  advanceRoom(run);
  return true;
}
