/**
 * Бот для симулятора баланса. Играет так, как играл бы внимательный игрок:
 * в бою перебирает варианты хода на копии состояния и выбирает лучший по итогу хода врагов,
 * вне боя считает ценность артефактов под своего героя, меняет слабые на сильные,
 * перебрасывает бесполезные награды и тратит золото по ценности за монету.
 *
 * Дайсов бот не видит: варианты оцениваются на своём генераторе, реальный ход бросает свои кубики.
 */
import type { ArtifactInstance, BattleState, GearInstance, HeroPersistent, PlayerAction, RunState, StatMods, StatusId } from '../../src/engine/types';
import { createRng, type Rng } from '../../src/engine/rng';
import { VULNERABLE_MULT, canUseAction, defendBlock, endTurn, getStatus, holdsThroughEnemyTurn, performAction, resolveEnemyTurn, statusValue, tranceReduce, tranceStr } from '../../src/engine/combat';
import { artifactCost, artifactDef } from '../../src/data/artifacts';
import { enemyAction, enemyDef } from '../../src/data/enemies';
import { heroDef } from '../../src/data/heroes';
import { SWEEP_MULT, canWearArmor, canWieldWeapon, upgradeGearTier, weaponDice, weaponReach } from '../../src/data/gear';
import { potionDef } from '../../src/data/potions';
import { equipGear, findSameArtifact, freeSocketFor, gearOf, slotAccepts, slotKindAt, socketRefs, type SocketRef } from '../../src/engine/equipment';
import { REROLL_COST, SHOP_HEAL_COST, SHOP_POTION_PRICE, artifactPrice, forgePrice, gearPrice } from '../../src/engine/loot';
import {
  altarHealAmount,
  altarPray,
  altarSacrifice,
  altarSacrificeCost,
  battleAction,
  battleEndTurn,
  battleEnemyStep,
  campForge,
  campHealAmount,
  campRest,
  canAltarSacrifice,
  canForge,
  canReroll,
  canShopBuyArtifact,
  canShopBuyGear,
  canShopBuyPotion,
  canShopHeal,
  canShopReroll,
  currentRoomKind,
  enterRoom,
  finishBattle,
  forgeUpgrade,
  gnomeTakeLoot,
  heroStats,
  isRunOver,
  leaveEvent,
  leaveShop,
  pendingDiscard,
  pendingPlace,
  rerollReward,
  shopBuyArtifact,
  shopBuyGear,
  shopBuyPotion,
  shopHeal,
  shopHealAmount,
  shopReroll,
  skipReward,
  takeChest,
  takeReward,
} from '../../src/engine/run';

// ─── Настройки ─────────────────────────────────────────────────────────────

/** Веса оценки состояния боя, всё в «HP героя»: сколько HP бот готов отдать за единицу. */
export const W = {
  /** Остаток HP врага при ценности артефактов; в бою вес считается от угрозы и урона героя (см. evaluate). */
  enemyHp: 0.3,
  /** Живой враг: его средний урон за действие, помноженный на горизонт в ходах. */
  threat: 1.5,
  /** Цена каждого ожидаемого хода до конца боя, HP: бой нужно заканчивать, а не тянуть за блоком. */
  turnCost: 4,
  /** Награда за единицу урона, когда враги не теряют HP два хода подряд: пора идти напролом, а не сидеть за блоком. */
  pushReward: 0.5,
  /** Очко маны в запасе. */
  mp: 0.3,
  /** Ширина луча: сколько лучших недоигранных ходов раскрываем дальше. */
  beam: 4,
  /** Сколько лучших вариантов хода проверяем прогоном хода врагов и сколько прогонов на каждый. */
  finalists: 5,
  rollouts: 2,
  maxDepth: 6,
  /**
   * Дальность (v0.26): надбавки ближнему бойцу за приём, который бьёт любого (заклинание, склянка, Молот света), — во столько раз,
   * и за оружие через ряд (лук, копьё, посох) — столько очков. Измерено на 600 забегах: ×1.3 и +4 стоили ближним героям 3–8 пунктов
   * (бот гнался за луками с половиной кубика и за заклинаниями вместо ударов), поэтому по умолчанию надбавок нет — тактику
   * дальности бот и так учитывает перебором ходов, а статическая цена реальной пользы не отражает.
   */
  reachArt: 1,
  reachGear: 0,
  /** Вор: монета срезанного золота в HP (лечение у торговца: 20 % HP за SHOP_HEAL_COST) и потеря артефакта из сокета в HP. */
  goldHp: 0.5,
  stolenArt: 15,
  /**
   * Типы сокетов (v0.31). anySocket — очки за каждый свободный универсальный сокет предмета сверх нынешнего: в него встанет находка любого
   * типа. reseatOverflow — при оценке предмета считать, что не поместившийся артефакт переедет во второй предмет (свободный сокет или
   * замена более слабого), как позволяет игра, а не пропадёт. displacedReplace — вытесненный «Заменить» артефакт может сам вытеснить
   * более слабый, если тот ещё не был вытеснен в этой очереди (иначе пара артефактов крутилась без конца).
   */
  anySocket: 0,
  reseatOverflow: true,
  displacedReplace: true,
};

/** Счётчик применений приёмов и зелий — печатается симулятором. */
export const USES: Record<string, number> = {};

// ─── Клон состояния боя ────────────────────────────────────────────────────

/** Дешёвая копия: движок мутирует только эти поля, статы и артефакты героя общие. Лог и события не нужны. */
function cloneBattle(b: BattleState): BattleState {
  return {
    ...b,
    hero: { ...b.hero, statuses: b.hero.statuses.map((s) => ({ ...s })), cooldowns: { ...b.hero.cooldowns }, uses: { ...b.hero.uses } },
    enemies: b.enemies.map((e) => ({ ...e, statuses: e.statuses.map((s) => ({ ...s })), uses: { ...e.uses }, lastUsedTurn: { ...e.lastUsedTurn } })),
    allies: b.allies.map((a) => ({ ...a, statuses: a.statuses.map((s) => ({ ...s })) })),
    allyQueue: b.allyQueue.slice(),
    enemyQueue: b.enemyQueue.slice(),
    events: [],
    log: [],
    stats: { ...b.stats },
  };
}

// ─── Оценка состояния ──────────────────────────────────────────────────────

const scaled = (mult: number, amount: number) => Math.max(1, Math.round(amount * mult));

const THREAT_CACHE: Record<string, number> = {};

/** Средняя опасность врага за действие по его набору приёмов (до множителя акта): урон, а также лечение, блок и баффы союзникам. */
function baseThreat(defId: string): number {
  if (THREAT_CACHE[defId] !== undefined) return THREAT_CACHE[defId];
  const def = enemyDef(defId);
  let total = 0;
  for (const a of def.actions) {
    for (const eff of a.effects) {
      if (eff.type === 'attack') total += eff.amount * (eff.hits ?? 1);
      else if (eff.type === 'selfDestruct') total += eff.amount;
      else if (eff.type === 'debuff') total += eff.value * Math.max(1, eff.turns) * 0.5;
      else if (eff.type === 'heal') total += eff.amount * (eff.target === 'allies' ? 1 : 0.5);
      else if (eff.type === 'block') total += eff.amount * (eff.target === 'allies' ? 0.5 : 0.2);
      else if (eff.type === 'buffStr') total += eff.amount * (eff.target === 'self' ? 2 : 4);
      else if (eff.type === 'summon') total += 6 * eff.count;
    }
  }
  return (THREAT_CACHE[defId] = total / Math.max(1, def.actions.length));
}

const SPAWN_CACHE: Record<string, { hp: number; threat: number }> = {};

/** Кто появится после смерти врага (деление слизня): их HP и угроза — часть цены самого врага, а не сюрприз после удара. */
function deathSpawn(defId: string): { hp: number; threat: number } {
  if (SPAWN_CACHE[defId]) return SPAWN_CACHE[defId];
  let hp = 0;
  let threat = 0;
  for (const eff of enemyDef(defId).onDeath?.effects ?? []) {
    if (eff.type !== 'summon') continue;
    hp += enemyDef(eff.enemyId).hp * eff.count;
    threat += baseThreat(eff.enemyId) * eff.count;
  }
  return (SPAWN_CACHE[defId] = { hp, threat });
}

/** Режим напора: враги два хода не теряют HP — нанесённый урон награждается напрямую, бот перестаёт прятаться за блоком. */
let pushing = false;
let pushBase = 0;

/** Урон, который враги нанесут герою на ближайшем ходу при нынешних намерениях, с учётом блока, уклонений и скрытности. */
function projectIncoming(b: BattleState): { hit: number; dot: number } {
  const h = b.hero;
  // Враги бьют союзника первым, пока он жив.
  if (b.allies.length > 0) return { hit: 0, dot: 0 };
  const hidden = holdsThroughEnemyTurn(getStatus(h, 'stealth'));
  const invuln = holdsThroughEnemyTurn(getStatus(h, 'invuln'));
  // Уязвимость на герое: удары сильнее на VULNERABLE_MULT.
  const vulMult = holdsThroughEnemyTurn(getStatus(h, 'vulnerable')) ? VULNERABLE_MULT : 1;
  let dodge = statusValue(h, 'dodge');
  let block = h.block;
  let hit = 0;
  let dot = 0;
  for (const e of b.enemies) {
    if (getStatus(e, 'stun')) continue;
    // Умрёт от своих ран до действия.
    if (e.hp <= statusValue(e, 'bleed') + statusValue(e, 'burn') + statusValue(e, 'poison')) continue;
    const a = enemyAction(enemyDef(e.defId), e.intent);
    for (const eff of a.effects) {
      if (eff.type === 'attack' || eff.type === 'selfDestruct') {
        let dmg = scaled(e.dmgMult, eff.amount) + statusValue(e, 'strength');
        if (getStatus(e, 'weak')) dmg = Math.floor(dmg * 0.75);
        const hits = eff.type === 'attack' ? (eff.hits ?? 1) : 1;
        const pierce = eff.type === 'attack' && !!eff.pierce;
        for (let i = 0; i < hits; i++) {
          if (hidden || invuln) continue;
          if (dodge > 0) {
            dodge--;
            continue;
          }
          let rest = Math.max(0, Math.round(dmg * vulMult) - h.stats.hitReduce - tranceReduce(h));
          if (!pierce) {
            const used = Math.min(block, rest);
            block -= used;
            rest -= used;
          }
          hit += rest;
        }
        if (eff.type === 'selfDestruct' && eff.burn && !hidden) dot += scaled(e.dmgMult, eff.burn) * 3;
      } else if (eff.type === 'debuff' && !hidden) {
        if (eff.status === 'bleed' || eff.status === 'burn' || eff.status === 'poison') dot += scaled(e.dmgMult, eff.value) * eff.turns;
        else if (eff.status === 'weak' || eff.status === 'exhaust') hit += 2;
      } else if (eff.type === 'drainMp' && !hidden) {
        hit += Math.min(h.mp, eff.amount) * W.mp;
      } else if (eff.type === 'stealGold') {
        // Вор: срезанное золото — потеря без крови, идёт в мягкую графу (dot), а не в hit, чтобы бот не «умирал» от кражи.
        dot += eff.amount * W.goldHp;
      } else if (eff.type === 'stealArtifact' && h.artifacts.length > 0) {
        dot += W.stolenArt;
      } else if (eff.type === 'flee') {
        // Побег уносит всё срезанное: за ход до него бот должен бить, а не защищаться.
        dot += b.stolen * W.goldHp + (b.stolenArtifact ? W.stolenArt : 0);
      }
    }
  }
  return { hit, dot };
}

function dotTotal(c: { statuses: { id: string; value: number; turns: number }[] }): number {
  let t = 0;
  for (const s of c.statuses) if (s.id === 'bleed' || s.id === 'burn' || s.id === 'poison') t += s.value * (s.turns === -1 ? 4 : s.turns);
  return t;
}

/** Ценность состояния для героя в HP: чем больше, тем лучше. Смерть — провал, победа — приз. */
export function evaluate(b: BattleState): number {
  if (b.phase === 'lost') return -1000;
  if (b.phase === 'won') return 1000 + b.hero.hp;
  const h = b.hero;
  const inc = projectIncoming(b);
  const selfDot = statusValue(h, 'bleed') + statusValue(h, 'burn') + statusValue(h, 'poison');
  const regen = h.stats.regen + statusValue(h, 'regen');
  const hpAfter = Math.min(h.maxHp, h.hp - inc.hit - selfDot + regen);
  if (hpAfter <= 0) return -1000 + hpAfter;
  let s = hpAfter - inc.dot * 0.7;
  // Остаток HP врагов переводим в ходы до конца боя: каждый ход стоит цены хода плюс половины угрозы врагов.
  // Сила «Боевого транса» действует только раненому — в ходах до конца боя её видно, в статике (artifactValue) нет.
  const dpt = Math.max(1, ((h.stats.dmgMin + h.stats.dmgMax) / 2 + h.stats.str + tranceStr(h)) * h.maxSta * 0.85);
  let threat = 0;
  let effTotal = 0;
  for (const e of b.enemies) {
    const spawn = deathSpawn(e.defId);
    // Процентный уворот (вор): чтобы снять HP, ударов нужно больше — в той же пропорции растёт «эффективный» запас.
    const evade = Math.min(90, statusValue(e, 'evade'));
    const effHp = Math.max(0, e.hp - dotTotal(e)) / (1 - evade / 100) + spawn.hp * e.hpMult;
    effTotal += effHp;
    if (effHp > 0) threat += baseThreat(e.defId) * e.dmgMult + spawn.threat * e.dmgMult * 0.7;
    s -= statusValue(e, 'strength') * 2;
    if (getStatus(e, 'stun')) s += 1;
    // Уязвимость и Слабость на живом враге — вклад в следующие ходы: четверть урона по нему и четверть его урона (v0.38).
    if (holdsThroughEnemyTurn(getStatus(e, 'vulnerable'))) s += Math.min(e.hp, dpt) * (VULNERABLE_MULT - 1) * W.enemyHp;
    if (holdsThroughEnemyTurn(getStatus(e, 'weak'))) s += baseThreat(e.defId) * e.dmgMult * 0.25;
  }
  s -= threat * W.threat;
  s -= (effTotal / dpt) * (W.turnCost + threat * 0.5);
  if (pushing) s += (b.stats.damageDealt - pushBase) * W.pushReward;
  const str = getStatus(h, 'strength');
  if (str) s += str.value * Math.min(3, str.turns === -1 ? 3 : str.turns) * 1.5;
  if (holdsThroughEnemyTurn(getStatus(h, 'stealth'))) s += 4;
  s += statusValue(h, 'dodge') * 3;
  if (getStatus(h, 'vulnerable')) s -= 4;
  s += h.mp * W.mp;
  if (h.potion) s += 5 + (12 * h.hp) / h.maxHp;
  for (const a of b.allies) s += a.hp * 0.3;
  return s;
}

// ─── Планирование хода ─────────────────────────────────────────────────────

interface Node {
  state: BattleState;
  actions: PlayerAction[];
  alive: number[];
  score: number;
}

/** Все допустимые действия. Базовые атаки — в порядке врагов не раньше предыдущей цели: порядок ударов почти не важен, ветвление режем. */
function candidates(b: BattleState, prev: PlayerAction | undefined): PlayerAction[] {
  const out: PlayerAction[] = [];
  const first = b.enemies[0]?.uid;
  const minIdx = prev?.type === 'attack' ? b.enemies.findIndex((e) => e.uid === prev.target) : 0;
  // Плеть бьёт весь ряд — цель не важна, один вариант.
  if (b.hero.stats.sweep > 0) out.push({ type: 'attack', target: first ?? -1 });
  else
    b.enemies.forEach((e, i) => {
      if (i >= minIdx) out.push({ type: 'attack', target: e.uid });
    });
  out.push({ type: 'defend' });
  for (const inst of b.hero.artifacts) {
    const def = artifactDef(inst.id);
    if (def.kind !== 'active') continue;
    if (def.target === 'enemy') for (const e of b.enemies) out.push({ type: 'artifact', artifactId: inst.id, target: e.uid });
    else out.push({ type: 'artifact', artifactId: inst.id, target: first });
  }
  if (b.hero.potion) {
    const def = potionDef(b.hero.potion);
    if (def.effects.some((e) => (e.type === 'attack' || e.type === 'spell') && e.target === 'enemy')) for (const e of b.enemies) out.push({ type: 'potion', target: e.uid });
    else out.push({ type: 'potion', target: first });
  }
  return out.filter((a) => canUseAction(b, a) === null);
}

export interface Plan {
  actions: PlayerAction[];
  /** Сколько врагов останется после каждого шага по плану: расхождение с реальностью — повод планировать заново. */
  alive: number[];
}

/** Лучшая последовательность действий на этот ход; пустая — сразу закончить ход. */
export function planTurn(b: BattleState, rng: Rng): Plan {
  const seed = (rng.state ^ 0x5bd1e995) >>> 0;
  const root: Node = { state: b, actions: [], alive: [], score: evaluate(b) };
  let frontier: Node[] = [root];
  const terminals: Node[] = [root];
  for (let depth = 0; depth < W.maxDepth && frontier.length > 0; depth++) {
    const next: Node[] = [];
    for (const n of frontier) {
      for (const a of candidates(n.state, n.actions[n.actions.length - 1])) {
        const s = cloneBattle(n.state);
        // Одни и те же кубики для всех ветвей: сравниваем решения, а не удачу.
        performAction(s, a, createRng(seed));
        const node: Node = { state: s, actions: [...n.actions, a], alive: [...n.alive, s.enemies.length], score: evaluate(s) };
        if (s.phase === 'lost') continue;
        terminals.push(node);
        if (s.phase === 'player') next.push(node);
      }
    }
    next.sort((x, y) => y.score - x.score);
    frontier = next.slice(0, W.beam);
  }
  terminals.sort((x, y) => y.score - x.score);
  let best = terminals[0];
  let bestScore = -Infinity;
  for (const t of terminals.slice(0, W.finalists)) {
    let total = 0;
    for (let i = 0; i < W.rollouts; i++) {
      if (t.state.phase !== 'player') {
        total += evaluate(t.state);
        continue;
      }
      const s = cloneBattle(t.state);
      endTurn(s);
      resolveEnemyTurn(s, createRng((seed + (i + 1) * 7919) >>> 0));
      total += evaluate(s);
    }
    const score = total / W.rollouts + t.score * 0.01;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return { actions: best.actions, alive: best.alive };
}

/**
 * Бой до конца. План исполняется, пока реальность сходится с ним по числу живых врагов; разошлись (кубики) — план заново.
 * Возвращает false, если бой упёрся в лимит действий — пат.
 */
export function playBattle(run: RunState): boolean {
  let guard = 0;
  let plan: Plan = { actions: [], alive: [] };
  let step = 0;
  let lastTurn = -1;
  let bestEnemyHp = Infinity;
  let stallTurns = 0;
  pushing = false;
  while (run.battle && run.battle.phase !== 'won' && run.battle.phase !== 'lost') {
    if (guard++ >= 400) return false;
    const b = run.battle;
    if (b.phase !== 'player') {
      battleEnemyStep(run);
      continue;
    }
    if (b.turn !== lastTurn) {
      lastTurn = b.turn;
      const total = b.enemies.reduce((s, e) => s + e.hp, 0);
      if (total < bestEnemyHp) {
        bestEnemyHp = total;
        stallTurns = 0;
      } else stallTurns++;
      pushing = stallTurns >= 2;
      pushBase = b.stats.damageDealt;
      plan = planTurn(b, run.rng);
      step = 0;
    }
    if (step >= plan.actions.length) {
      battleEndTurn(run);
      continue;
    }
    const a = plan.actions[step];
    if (canUseAction(b, a) !== null) {
      plan = planTurn(b, run.rng);
      step = 0;
      if (plan.actions.length === 0) battleEndTurn(run);
      continue;
    }
    if (a.type === 'artifact') USES[a.artifactId] = (USES[a.artifactId] ?? 0) + 1;
    else if (a.type === 'potion' && b.hero.potion) USES[b.hero.potion] = (USES[b.hero.potion] ?? 0) + 1;
    battleAction(run, a);
    step++;
    if (run.battle && run.battle.phase === 'player' && run.battle.enemies.length !== plan.alive[step - 1]) {
      plan = planTurn(run.battle, run.rng);
      step = 0;
    }
  }
  pushing = false;
  finishBattle(run);
  return true;
}

// ─── Ценность предметов ────────────────────────────────────────────────────

function hasMagicActive(hero: HeroPersistent, except?: string): boolean {
  return socketRefs(hero).some((s) => s.art && s.art.id !== except && artifactDef(s.art.id).kind === 'active' && artifactDef(s.art.id).school === 'magic');
}

/** Ценность артефакта для этого героя за один бой, в HP. Магия без маны не стоит ничего. */
export function artifactValue(run: RunState, inst: ArtifactInstance): number {
  if (inst.id === run.hero.signature) return artifactValueRaw(run, inst) * 2;
  return artifactValueRaw(run, inst);
}
/** Все статусы, которые герой вешает на врагов своими вещами (кроме `except`): приёмы, заклинания, перки оружия — заводки для связок. */
function heroApplies(run: RunState, except?: string): Set<StatusId> {
  const out = new Set<StatusId>();
  const s = heroStats(run);
  if (s.onHitBleed > 0) out.add('bleed');
  if (s.markOnHit > 0) out.add('vulnerable');
  if (s.stunOnCrit > 0) out.add('stun');
  for (const ref of socketRefs(run.hero)) {
    if (!ref.art || ref.art.id === except) continue;
    const def = artifactDef(ref.art.id);
    for (const e of def.effects?.(ref.art.tier) ?? []) {
      if (e.type === 'status' && e.target !== 'self') out.add(e.status);
      if (e.type === 'enchant') for (const id of ['burn', 'poison', 'bleed'] as StatusId[]) out.add(id);
    }
  }
  return out;
}

/** Статусы, на которых у героя есть выплата (кроме `except`): взрыв ран, заражение, «по крови», «Гниль», «Раздуть», крит по оглушённым. */
function heroPaysFor(run: RunState, except?: string): Set<StatusId> {
  const out = new Set<StatusId>();
  for (const ref of socketRefs(run.hero)) {
    if (!ref.art || ref.art.id === except) continue;
    const def = artifactDef(ref.art.id);
    const m = def.mods?.(ref.art.tier) ?? {};
    if (m.vsBleed) out.add('bleed');
    if (m.dotLeech) out.add('bleed').add('poison');
    if (m.poisonVuln) out.add('poison');
    if (m.spellVsBurn) out.add('burn');
    if (m.stunCrit) out.add('stun');
    if (m.perDebuff) for (const id of ['weak', 'bleed', 'burn', 'poison', 'stun', 'vulnerable'] as StatusId[]) out.add(id);
    for (const e of def.effects?.(ref.art.tier) ?? []) {
      if (e.type === 'detonate' || e.type === 'spread') for (const id of e.statuses) out.add(id);
      if (e.type === 'spell' && e.vsWeak) out.add('weak');
    }
  }
  return out;
}

/** Число вставленных приёмов и заклинаний (кроме `except`) — столько раз за ход сработает «Цепная атака». */
function activeCount(hero: HeroPersistent, except?: string): number {
  return socketRefs(hero).filter((r) => r.art && r.art.id !== except && artifactDef(r.art.id).kind === 'active').length;
}

/** Есть ли физический приём (кроме `except`) — вторая половина «Перекрёстного тока». */
function hasPhysicalActive(hero: HeroPersistent, except?: string): boolean {
  return socketRefs(hero).some((s) => s.art && s.art.id !== except && artifactDef(s.art.id).kind === 'active' && artifactDef(s.art.id).school === 'physical');
}

/**
 * Цена стамины в HP врага с усталостью (v0.38): приём вытесняет не первые удары хода, а последние, самые слабые — второй удар
 * идёт на 0.7 кубика, третий на 0.49. Без этого приём за 2 STA сравнивался с двумя полными ударами и не стоил ничего.
 */
function staValue(s: { sta: number; fatigue: number }, avg: number, cost: number): number {
  let v = 0;
  for (let i = 0; i < cost; i++) v += avg * s.fatigue ** Math.max(0, s.sta - 1 - i);
  return v * W.enemyHp;
}

/** Ценность пассивных модов в HP за бой — у пассивок целиком, у приёма с модами («Оглушающий удар») сверх его эффектов. */
function modsValue(run: RunState, m: StatMods, inst: ArtifactInstance): number {
  const def = artifactDef(inst.id);
  const s = heroStats(run);
  const avg = (s.dmgMin + s.dmgMax) / 2 + s.str;
  {
    const magic = hasMagicActive(run.hero, inst.id);
    // Связки (v0.38): выплата стоит полной цены только при заводке в руках, заводка — дороже при выплате (см. artifactValueRaw).
    const applies = heroApplies(run, inst.id);
    const src = (id: StatusId) => (applies.has(id) ? 1 : 0.2);
    let v = 0;
    v += (m.str ?? 0) * 4;
    v += (m.maxHp ?? 0) * 0.7;
    v += (m.def ?? 0) * 4;
    v += (m.maxMp ?? 0) * (magic ? 1.5 : 0.2);
    v += (m.mpRegen ?? 0) * (magic ? 4 : 0.3);
    v += (m.firstTurnSta ?? 0) * 3;
    v += (m.thorns ?? 0) * 2;
    v += (m.lifesteal ?? 0) * 3;
    v += (m.regen ?? 0) * 5;
    // Крит-статы в «HP врага»: шанс стоит ровно столько, сколько даёт крит. урон сверх обычного, и наоборот.
    v += (m.crit ?? 0) * avg * (s.critDmg / 100 - 1) * 12;
    v += ((m.critDmg ?? 0) / 100) * avg * s.crit * 12;
    // «Азарт» копится весь бой: в среднем работает как половина накопленного шанса на каждом ударе.
    v += (m.critRamp ?? 0) * avg * (s.critDmg / 100 - 1) * 30;
    v += (m.executeCrit ?? 0) * avg * (s.critDmg / 100 - 1) * 3;
    v += (m.critHeal ?? 0) * s.crit * 6;
    v += (m.spellPower ?? 0) * (magic ? 4 : 0);
    v += (m.dmgMax ?? 0) * 2;
    v += (m.onKillHeal ?? 0) * 3;
    // «Плащ странника» с v0.37 даёт блок каждый ход — цена та же, что у гашения удара (hitReduce), только блок иногда пропадает зря.
    v += (m.blockTurn ?? 0) * 4;
    v += (m.markOnHit ?? 0) * avg * 0.3;
    // Бронные пассивки v0.31.1: единица с каждого удара — около двух ударов за ход врага; промах первой атаки — средний удар врага.
    v += (m.hitReduce ?? 0) * 5;
    v += (m.defendBonus ?? 0) * 2.5;
    v += (m.blockKeep ?? 0) * 1.5;
    v += (m.dodgeStart ?? 0) * 5;
    // «Боевой транс»: Сила, стамина и гашение только раненому — Берсерк проводит там примерно половину боёв.
    v += (m.lowHpStr ?? 0) * 4 * 0.5 + (m.lowHpSta ?? 0) * avg * W.enemyHp * 0.5 + (m.lowHpReduce ?? 0) * 5 * 0.5;
    // «Ответный удар»: примерно один ответ за ход врага, пока герой держит блок — около половины ходов.
    v += ((m.riposte ?? 0) / 100) * avg * W.enemyHp * 0.5;
    // «Кровавый след»: Сила по кровоточащей цели — как Камень силы, пока кровь есть.
    v += (m.vsBleed ?? 0) * 4 * src('bleed') * 0.8;
    // «Пиявка»: тик на каждом враге по два хода — полтора врага под кровью или ядом.
    v += (m.dotLeech ?? 0) * 3 * Math.max(src('bleed'), src('poison'));
    // «Гниль»: доля урона всех ударов по отравленному — два хода из трёх.
    v += (m.poisonVuln ?? 0) * avg * s.sta * W.enemyHp * 2 * src('poison');
    // «Раздуть»: заклинание в ход по горящей цели.
    v += (m.spellVsBurn ?? 0) * 6 * W.enemyHp * 3 * (magic ? src('burn') : 0);
    // «Резонанс»: за каждое проклятие, которое герой умеет вешать, — примерно две трети ходов оно на цели.
    v += (m.perDebuff ?? 0) * 4 * Math.min(3, applies.size * 0.7 + 0.2);
    // «Перекрёстный ток»: очко стамины за заклинание (ослабленный удар), мана за приём.
    v += (m.spellSta ?? 0) * (magic ? avg * s.fatigue * W.enemyHp * 3 : 0.3);
    v += (m.skillMp ?? 0) * (magic && hasPhysicalActive(run.hero, inst.id) ? W.mp * 3 : 0.2);
    // Крит по оглушённому: один-два удара за оглушение.
    v += (m.stunCrit ?? 0) * avg * (s.critDmg / 100 - 1) * W.enemyHp * 1.5 * (def.kind === 'active' || applies.has('stun') ? 1 : 0.2);
    return v;
  }
}

function artifactValueRaw(run: RunState, inst: ArtifactInstance): number {
  const def = artifactDef(inst.id);
  const s = heroStats(run);
  const avg = (s.dmgMin + s.dmgMax) / 2 + s.str;
  if (def.kind === 'passive') return modsValue(run, def.mods?.(inst.tier) ?? {}, inst);
  const cost = artifactCost(def, inst.tier);
  const applies = heroApplies(run, inst.id);
  const pays = heroPaysFor(run, inst.id);
  /** Выплата без заводки почти пуста; заводка при выплате — дороже. */
  const src = (ids: StatusId[]) => (ids.some((id) => applies.has(id)) ? 1 : 0.15);
  const payoff = (id: StatusId) => (pays.has(id) ? 1.5 : 1);
  if ((cost.mp ?? 0) > s.maxMp) return 0.3;
  // Ближний боец с приёмом через ряд выбирает цель сам — стрелка или шамана за спиной брута; остальным дальность ничего не добавляет.
  const weaponFar = weaponReach(run.hero.weapon) === 'any';
  const artFar = (def.reach ?? (def.school === 'magic' ? 'any' : weaponReach(run.hero.weapon))) === 'any';
  const far = !weaponFar && artFar ? W.reachArt : 1;
  let per = 0;
  for (const e of def.effects?.(inst.tier) ?? []) {
    switch (e.type) {
      case 'attack':
        per += (avg * (e.mult ?? 1) + e.bonus) * (e.sureCrit ? 2 : 1) * (e.target === 'allEnemies' ? 1.8 : far) * W.enemyHp;
        if (e.blockPct) per += avg * (e.mult ?? 1) * e.blockPct * 0.8;
        // «Добивание»: возврат стамины срабатывает примерно на каждом третьем ударе; прибавка по раненому — на каждом третьем тоже.
        if (e.refundOnKill) per += e.refundOnKill * avg * s.fatigue * W.enemyHp * 0.35;
        if (e.lowHp) per += e.lowHp.bonus * W.enemyHp * 0.35;
        break;
      case 'detonate': {
        // Взрыв ран: сколько раны ещё нанесли бы — при заводке в руках примерно два тика средней силы; по всем — суммой каждому.
        const stock = e.statuses.reduce((sum, id) => sum + (applies.has(id) ? 7 : 1), 0);
        per += stock * e.mult * (e.pooled ? 1.8 * 1.5 : e.target === 'allEnemies' ? 1.8 : 1) * W.enemyHp;
        break;
      }
      case 'spread':
        // Заражение: яд с одной цели на остальных полторы — при заводке.
        per += 9 * 1.5 * W.enemyHp * src(e.statuses);
        break;
      case 'breakBlock':
        // Пролом щита: блок у врага бывает через ход, средний — около шести.
        per += 6 * e.mult * W.enemyHp * 0.6;
        break;
      case 'finisher':
        // Финишер после двух ударов хода.
        per += e.per * Math.max(1, s.sta - 1) * W.enemyHp;
        break;
      case 'enchant':
        // Заточка: два хода по два удара, каждый — рана на два тика; выплата любого из трёх семейств её усиливает.
        per += e.value * e.turns * 2 * 2 * W.enemyHp * Math.max(payoff('burn'), payoff('poison'), payoff('bleed'));
        break;
      case 'chain':
        // Цепная атака: бесплатный удар за каждый другой приём в ходу — обычно один-два.
        per += e.amount * W.enemyHp * Math.min(2, activeCount(run.hero, inst.id)) * (activeCount(run.hero, inst.id) > 0 ? 1 : 0.2);
        break;
      case 'blockStrike':
        // Блок в момент тарана — обычно то, что дала «Защититься».
        per += defendBlock(s) * e.mult * W.enemyHp;
        break;
      case 'spell':
        per += (e.amount + s.spellPower) * (e.target === 'allEnemies' ? 1.8 : far) * W.enemyHp + (e.drain ? e.amount * 0.7 : 0);
        // Ледяной осколок: удвоение по Слабому — второй осколок подряд или чужая Слабость.
        if (e.vsWeak) per += (e.amount + s.spellPower) * (e.vsWeak - 1) * W.enemyHp * (applies.has('weak') ? 0.7 : 0.4);
        break;
      case 'block':
        per += e.amount * 0.8;
        break;
      case 'heal':
        per += e.amount;
        break;
      case 'gainSta':
        per += e.amount * avg * W.enemyHp;
        break;
      case 'gainMp':
        per += e.amount * W.mp;
        break;
      case 'selfDamage':
        per -= e.amount;
        break;
      case 'summon':
        per += 8;
        break;
      case 'cleanse':
        per += 2;
        break;
      case 'pull':
        // Вытянуть стрелка под удар стоит примерно одного лишнего удара по нужной цели; дальнобойному не нужно.
        per += weaponFar ? 0.5 : avg * W.enemyHp * 1.5;
        break;
      case 'push':
        // Толчок слабее Крюка: до задних очередь доходит, но цель уходит из-под добивания. Дальнобойному ряд безразличен.
        per += weaponFar ? 0 : avg * W.enemyHp * 0.3;
        break;
      case 'status': {
        const turns = e.turns === -1 ? 3 : e.turns;
        if (e.target === 'self') {
          if (e.status === 'strength') per += e.value * turns * 1.5;
          else if (e.status === 'dodge') per += 4;
          else if (e.status === 'stealth') per += turns * 10;
          else if (e.status === 'echo') per += avg * W.enemyHp * 0.9;
          else if (e.status === 'regen') per += e.value * turns;
          else if (e.status === 'thorns') per += e.value * turns * 1.5;
          else if (e.status === 'exhaust') per -= e.value * avg * W.enemyHp;
          else per += 2;
        } else {
          const many = (e.target === 'allEnemies' ? 1.8 : far) * payoff(e.status);
          if (e.status === 'stun') per += 6 * many;
          else if (e.status === 'vulnerable') per += turns * avg * (VULNERABLE_MULT - 1) * many;
          else if (e.status === 'weak') per += turns * 2 * many;
          else per += e.value * turns * W.enemyHp * many;
        }
        break;
      }
    }
  }
  const staCost = cost.sta === 'all' ? Math.max(1, s.sta) : (cost.sta ?? 0);
  per -= staValue(s, avg, staCost);
  const cd = def.cooldown?.(inst.tier) ?? 0;
  let uses = cd > 0 ? 6 / (cd + 1) : 3;
  if (cost.mp) uses = Math.min(uses, (s.maxMp + s.mpRegen * 5) / cost.mp);
  // Приём с модами (Оглушающий удар): пассивная часть работает весь бой, сверх применений.
  return Math.max(0, per) * uses + (def.mods ? modsValue(run, def.mods(inst.tier), inst) : 0);
}

/** Насколько предмет лучше надетого: тир, кубик в руках героя или защита, владение, аффикс, потеря слотов. */
export function gearGain(run: RunState, gear: GearInstance): number {
  const def = heroDef(run.hero.defId);
  const cur = gearOf(run.hero, gear.kind);
  let score = (gear.tier - cur.tier) * 4;
  if (gear.kind === 'weapon') {
    // Плеть бьёт всех на долю урона: кубик считаем как против полутора врагов — примерно как меч. Коэффициент 1.8 (как у приёмов по всем)
    // заставлял бота брать плеть вместо меча и стоил ближним героям 2 пункта: сосредоточенный урон убивает быстрее размазанного.
    const dice = (g: GearInstance) => {
      const d = weaponDice(def, g);
      return (d.min + d.max) * (weaponReach(g, def) === 'row' ? SWEEP_MULT * 1.5 : 1);
    };
    score += dice(gear) - dice(cur);
    // Перк базы работает только у владеющего — та же надбавка, что у брони.
    score += (canWieldWeapon(def, gear) ? 3 : -8) - (canWieldWeapon(def, cur) ? 3 : -8);
    // Оружие через ряд (лук, копьё, посох) против оружия в упор: свобода выбора цели стоит очков.
    score += (weaponReach(gear) === 'any' ? W.reachGear : 0) - (weaponReach(cur) === 'any' ? W.reachGear : 0);
  } else {
    score += (gear.def - cur.def) * 2 + (gear.hp - cur.hp) * 0.5;
    score += (canWearArmor(def, gear) ? 3 : 0) - (canWearArmor(def, cur) ? 3 : 0);
  }
  score += (gear.affix ? 1 : 0) - (cur.affix ? 1 : 0);
  // Артефакты, которым не найдётся подходящего сокета, пропадут: переезд считаем теми же правилами, что и игра (типы сокетов, v0.31).
  const copy: HeroPersistent = { ...run.hero, weapon: structuredClone(run.hero.weapon), armor: structuredClone(run.hero.armor) };
  const overflow = equipGear(copy, gear);
  for (const x of overflow) {
    if (W.reseatOverflow) {
      // Игра предложит выбор слота: свободный подходящий сокет второго предмета — артефакт цел; занятый более слабым — теряем слабого.
      const free = freeSocketFor(copy, x.id);
      if (free) {
        gearOf(copy, free.kind).slots[free.index] = { ...x };
        continue;
      }
      const weakest = weakestSocketOf(run, copy, x.id);
      if (weakest && artifactValue(run, x) > weakest.value + 1) {
        score -= weakest.value + 2;
        gearOf(copy, weakest.ref.kind).slots[weakest.ref.index] = { ...x };
        continue;
      }
    }
    score -= artifactValue(run, x) + 2;
  }
  if (W.anySocket) {
    const freeAny = (g: GearInstance) => g.slots.filter((a, i) => !a && slotKindAt(g, i) === 'any').length;
    score += (freeAny(gear) - freeAny(cur)) * W.anySocket;
  }
  return score;
}

const POTION_VALUE: Record<string, number> = {
  heal_potion: 6,
  stone_skin: 5,
  strength_potion: 5,
  stamina_potion: 5,
  fire_flask: 5,
  antidote: 3,
  mana_potion: 4,
};

function potionValue(run: RunState, id: string): number {
  if (id === 'mana_potion' && !hasMagicActive(run.hero)) return 0.5;
  return POTION_VALUE[id] ?? 3;
}

/** Выигрыш от зелья: в пустой слот — полная ценность, в занятый — разница. */
function potionGain(run: RunState, id: string): number {
  return potionValue(run, id) - (run.hero.potion ? potionValue(run, run.hero.potion) + 1 : 0);
}

/** Самый слабый вставленный артефакт в сокете, куда встанет новый, — кандидат на замену. `skip` — id, которые трогать нельзя. */
function weakestSocket(run: RunState, forId: string, skip: string[] = []): { ref: SocketRef; value: number } | null {
  return weakestSocketOf(run, run.hero, forId, skip);
}
function weakestSocketOf(run: RunState, hero: HeroPersistent, forId: string, skip: string[] = []): { ref: SocketRef; value: number } | null {
  const slot = artifactDef(forId).slot;
  let best: { ref: SocketRef; value: number } | null = null;
  for (const ref of socketRefs(hero)) {
    if (!ref.art || !slotAccepts(ref.slot, slot) || skip.includes(ref.art.id)) continue;
    const value = artifactValue(run, ref.art);
    if (!best || value < best.value) best = { ref, value };
  }
  return best;
}

/** Выигрыш от нового артефакта: апгрейд стоящего, свободный слот или замена самого слабого. */
export function artifactGain(run: RunState, art: ArtifactInstance): number {
  const same = findSameArtifact(run.hero, art.id);
  if (same?.art) {
    if (same.art.tier >= 3) return 0;
    const nextTier = Math.min(3, Math.max(same.art.tier + 1, art.tier)) as ArtifactInstance['tier'];
    return artifactValue(run, { id: art.id, tier: nextTier }) - artifactValue(run, same.art);
  }
  const value = artifactValue(run, art);
  if (freeSocketFor(run.hero, art.id)) return value;
  // Подходящих сокетов нет вовсе — артефакт некуда ставить, он ничего не стоит.
  const weakest = weakestSocket(run, art.id);
  return weakest ? value - weakest.value - 1 : 0;
}

// ─── Решения вне боя ───────────────────────────────────────────────────────

/**
 * Ожидающий артефакт: в свободный слот, иначе вместо самого слабого, если он слабее; иначе выбросить.
 * Вытесненный «Заменить» артефакт (v0.31) сам никого не вытесняет — только свободный сокет или выброс:
 * ценности зависят от статов героя и после перестановки меняются, и пара артефактов вытесняла друг друга без конца (паты 1 → 67 у Воина).
 */
export function resolvePending(run: RunState): void {
  const p = run.pending;
  const art = p?.artifacts[0];
  if (!p || !art) return;
  const free = freeSocketFor(run.hero, art.id);
  if (free) {
    pendingPlace(run, free.kind, free.index);
    return;
  }
  // Вытесненный может вытеснить только того, кого в этой очереди ещё не вытесняли: цепочка конечна, качели A ↔ B невозможны.
  const displaced = !!p.displaced?.includes(art.id);
  if (displaced && !W.displacedReplace) {
    pendingDiscard(run);
    return;
  }
  const weakest = weakestSocket(run, art.id, displaced ? p.displaced : []);
  if (weakest && artifactValue(run, art) > weakest.value + 1) pendingPlace(run, weakest.ref.kind, weakest.ref.index);
  else pendingDiscard(run);
}

function rewardScore(run: RunState, o: RunState['rewards'][number]['options'][number]): number {
  if (o.kind === 'gear') return gearGain(run, o.gear);
  if (o.kind === 'potion') return potionGain(run, o.potion);
  return artifactGain(run, o.artifact);
}

/** Награда: лучший вариант по выигрышу; если всё бесполезно и золото есть — переброс, иначе пропуск. */
export function chooseReward(run: RunState): void {
  const opts = run.rewards[0]?.options ?? [];
  let best = -1;
  let bestScore = 0.5;
  opts.forEach((o, i) => {
    const score = rewardScore(run, o);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  if (best < 0 && !canReroll(run) && run.gold >= REROLL_COST + 4) {
    rerollReward(run);
    return;
  }
  if (best >= 0) takeReward(run, best);
  else skipReward(run);
}

/** Сундук, алтарь, кузнец: то же, что награда и торговец — по ценности, лишнее оставить. */
export function chooseEventRoom(run: RunState): void {
  const ev = run.event;
  if (!ev) return;
  if (ev.kind === 'chest') {
    if (gearGain(run, ev.gear) > 0) takeChest(run);
    else leaveEvent(run);
    return;
  }
  if (ev.kind === 'altar') {
    const max = heroStats(run).maxHp;
    const heal = altarHealAmount(run);
    const cost = altarSacrificeCost(run);
    const gain = ev.artifact && !canAltarSacrifice(run) && run.hero.hp - cost >= max * 0.3 ? artifactGain(run, ev.artifact) * 2 - cost : -Infinity;
    if (gain > heal && gain > 0) altarSacrifice(run);
    else altarPray(run);
    return;
  }
  if (ev.kind === 'gnome_art') {
    // Своя вещь и так на месте; из мешка вора может выпасть чужой артефакт — его берём.
    if (ev.result === 'slain' && ev.loot) gnomeTakeLoot(run);
    else leaveEvent(run);
    return;
  }
  if (ev.kind === 'gnome') {
    // Мешок вора: артефакт бесплатный, брать всегда — бот сам решит, в какой сокет его девать.
    if (ev.result === 'slain' && ev.artifact) gnomeTakeLoot(run);
    else leaveEvent(run);
    return;
  }
  // Кузнец: ценность апгрейда — как у нового предмета того же тира на месте надетого; цена за монету — как у торговца.
  let best: { kind: GearInstance['kind']; ratio: number } | null = null;
  for (const kind of ['weapon', 'armor'] as GearInstance['kind'][]) {
    if (canForge(run, kind)) continue;
    const cur = gearOf(run.hero, kind);
    const copy: GearInstance = { ...cur, slots: cur.slots.slice(), affix: cur.affix ? { ...cur.affix } : null };
    upgradeGearTier(createRng(1), copy);
    const ratio = gearGain(run, copy) / forgePrice(cur);
    if (ratio >= 0.6 && (!best || ratio > best.ratio)) best = { kind, ratio };
  }
  if (best) forgeUpgrade(run, best.kind);
  else leaveEvent(run);
}

function chooseCamp(run: RunState): void {
  const heal = campHealAmount(run);
  let best: SocketRef | null = null;
  let bestGain = 0;
  for (const s of socketRefs(run.hero)) {
    if (!s.art || s.art.tier >= 3) continue;
    const gain = artifactValue(run, { id: s.art.id, tier: (s.art.tier + 1) as ArtifactInstance['tier'] }) - artifactValue(run, s.art);
    if (gain > bestGain) {
      bestGain = gain;
      best = s;
    }
  }
  // Апгрейд работает все оставшиеся бои, отдых — один раз.
  if (best && bestGain * 5 > heal) campForge(run, best.kind, best.index);
  else campRest(run);
}

/** Торговец: покупки по ценности за монету, пока хватает золота; ничего стоящего — переброс; потом уйти. */
function shopVisit(run: RunState): void {
  const shop = run.shop!;
  const max = heroStats(run).maxHp;
  const deals: { value: number; price: number; buy: () => boolean }[] = [];
  if (!canShopHeal(run)) deals.push({ value: shopHealAmount(run) * (run.hero.hp < max * 0.5 ? 1.5 : 1), price: SHOP_HEAL_COST, buy: () => shopHeal(run) });
  if (shop.gear && !canShopBuyGear(run)) deals.push({ value: gearGain(run, shop.gear), price: gearPrice(shop.gear), buy: () => shopBuyGear(run) });
  if (shop.artifact && !canShopBuyArtifact(run)) deals.push({ value: artifactGain(run, shop.artifact) * 2, price: artifactPrice(shop.artifact), buy: () => shopBuyArtifact(run) });
  if (shop.potion && !canShopBuyPotion(run)) deals.push({ value: potionGain(run, shop.potion), price: SHOP_POTION_PRICE, buy: () => shopBuyPotion(run) });
  const worth = deals.filter((d) => d.value / d.price >= 0.6).sort((a, b) => b.value / b.price - a.value / a.price);
  if (worth.length > 0) {
    worth[0].buy();
    return;
  }
  if (!canShopReroll(run) && run.gold >= REROLL_COST + 6) {
    shopReroll(run);
    return;
  }
  leaveShop(run);
}

export type RunOutcome = 'victory' | 'defeat' | 'stall';

/** Забег до конца. `onBoss` зовётся перед входом к боссу — для статистики. Пат — бой, который бот не смог ни выиграть, ни проиграть. */
export function playRun(run: RunState, onBoss?: (run: RunState) => void): RunOutcome {
  let guard = 0;
  while (!isRunOver(run) && guard++ < 800) {
    if (run.pending) {
      resolvePending(run);
      continue;
    }
    switch (run.phase) {
      case 'map':
        if (currentRoomKind(run) === 'boss') onBoss?.(run);
        enterRoom(run);
        break;
      case 'battle':
        if (!playBattle(run)) return 'stall';
        break;
      case 'reward':
        chooseReward(run);
        break;
      case 'event':
        chooseEventRoom(run);
        break;
      case 'shop':
        shopVisit(run);
        break;
      case 'camp':
        chooseCamp(run);
        break;
    }
  }
  return run.phase === 'victory' ? 'victory' : run.phase === 'defeat' ? 'defeat' : 'stall';
}
