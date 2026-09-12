/**
 * Бот для симулятора баланса. Играет так, как играл бы внимательный игрок:
 * в бою перебирает варианты хода на копии состояния и выбирает лучший по итогу хода врагов,
 * вне боя считает ценность артефактов под своего героя, меняет слабые на сильные,
 * перебрасывает бесполезные награды и тратит золото по ценности за монету.
 *
 * Дайсов бот не видит: варианты оцениваются на своём генераторе, реальный ход бросает свои кубики.
 */
import type { ArtifactInstance, BattleState, GearInstance, HeroPersistent, PlayerAction, RunState } from '../../src/engine/types';
import { createRng, type Rng } from '../../src/engine/rng';
import { SMOKE_MISS_CHANCE, VULNERABLE_MULT, canUseAction, defendBlock, endTurn, getStatus, performAction, resolveEnemyTurn, statusValue } from '../../src/engine/combat';
import { artifactCost, artifactDef } from '../../src/data/artifacts';
import { enemyAction, enemyDef } from '../../src/data/enemies';
import { heroDef } from '../../src/data/heroes';
import { canWearArmor, canWieldWeapon, upgradeGearTier, weaponDice } from '../../src/data/gear';
import { potionDef } from '../../src/data/potions';
import { findSameArtifact, gearOf, socketRefs, type SocketRef } from '../../src/engine/equipment';
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
  const st = getStatus(h, 'stealth');
  const hidden = !!st && (st.turns === -1 || st.turns > 1);
  const inv = getStatus(h, 'invuln');
  const invuln = !!inv && (inv.turns === -1 || inv.turns > 1);
  // Дымовая завеса гасит удар с шансом SMOKE_MISS_CHANCE — в ожидании считаем долю урона.
  // Уязвимость на герое: удары сильнее на VULNERABLE_MULT.
  const vul = getStatus(h, 'vulnerable');
  const vulMult = vul && (vul.turns === -1 || vul.turns > 1) ? VULNERABLE_MULT : 1;
  const sm = getStatus(h, 'smoke');
  const smokeMult = sm && (sm.turns === -1 || sm.turns > 1) ? 1 - SMOKE_MISS_CHANCE : 1;
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
          let rest = Math.max(0, Math.round(Math.round(dmg * smokeMult) * vulMult) - h.stats.hitReduce);
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
  const dpt = Math.max(1, ((h.stats.dmgMin + h.stats.dmgMax) / 2 + h.stats.str) * h.maxSta * 0.85);
  let threat = 0;
  let effTotal = 0;
  for (const e of b.enemies) {
    const spawn = deathSpawn(e.defId);
    const effHp = Math.max(0, e.hp - dotTotal(e)) + spawn.hp * e.hpMult;
    effTotal += effHp;
    if (effHp > 0) threat += baseThreat(e.defId) * e.dmgMult + spawn.threat * e.dmgMult * 0.7;
    s -= statusValue(e, 'strength') * 2;
    if (getStatus(e, 'stun')) s += 1;
  }
  s -= threat * W.threat;
  s -= (effTotal / dpt) * (W.turnCost + threat * 0.5);
  if (pushing) s += (b.stats.damageDealt - pushBase) * W.pushReward;
  const str = getStatus(h, 'strength');
  if (str) s += str.value * Math.min(3, str.turns === -1 ? 3 : str.turns) * 1.5;
  const st = getStatus(h, 'stealth') ?? getStatus(h, 'smoke');
  if (st && (st.turns === -1 || st.turns > 1)) s += 4;
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
  const def = artifactDef(inst.id);
  const s = heroStats(run);
  const avg = (s.dmgMin + s.dmgMax) / 2 + s.str;
  if (def.kind === 'passive') {
    const m = def.mods?.(inst.tier) ?? {};
    const magic = hasMagicActive(run.hero, inst.id);
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
    v += (m.blockStart ?? 0) * 1.5;
    v += (m.markOnHit ?? 0) * avg * 0.3;
    return v;
  }
  const cost = artifactCost(def, inst.tier);
  if ((cost.mp ?? 0) > s.maxMp) return 0.3;
  let per = 0;
  for (const e of def.effects?.(inst.tier) ?? []) {
    switch (e.type) {
      case 'attack':
        per += (avg * (e.mult ?? 1) + e.bonus) * (e.sureCrit ? 2 : 1) * (e.target === 'allEnemies' ? 1.8 : 1) * W.enemyHp;
        if (e.blockPct) per += avg * (e.mult ?? 1) * e.blockPct * 0.8;
        break;
      case 'blockStrike':
        // Блок в момент тарана — обычно то, что дала «Защититься».
        per += defendBlock(s) * e.mult * W.enemyHp;
        break;
      case 'spell':
        per += (e.amount + s.spellPower) * (e.target === 'allEnemies' ? 1.8 : 1) * W.enemyHp + (e.drain ? e.amount * 0.7 : 0);
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
      case 'status': {
        const turns = e.turns === -1 ? 3 : e.turns;
        if (e.target === 'self') {
          if (e.status === 'strength') per += e.value * turns * 1.5;
          else if (e.status === 'dodge') per += 4;
          else if (e.status === 'stealth') per += turns * 4;
          else if (e.status === 'smoke') per += turns * 3;
          else if (e.status === 'regen') per += e.value * turns;
          else if (e.status === 'exhaust') per -= e.value * avg * W.enemyHp;
          else per += 2;
        } else {
          const many = e.target === 'allEnemies' ? 1.8 : 1;
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
  per -= staCost * avg * W.enemyHp;
  const cd = def.cooldown?.(inst.tier) ?? 0;
  let uses = cd > 0 ? 6 / (cd + 1) : 3;
  if (cost.mp) uses = Math.min(uses, (s.maxMp + s.mpRegen * 5) / cost.mp);
  return Math.max(0, per) * uses;
}

/** Насколько предмет лучше надетого: тир, кубик в руках героя или защита, владение, аффикс, потеря слотов. */
export function gearGain(run: RunState, gear: GearInstance): number {
  const def = heroDef(run.hero.defId);
  const cur = gearOf(run.hero, gear.kind);
  let score = (gear.tier - cur.tier) * 10;
  if (gear.kind === 'weapon') {
    const a = weaponDice(def, gear);
    const c = weaponDice(def, cur);
    score += a.min + a.max - c.min - c.max;
    // Перк базы работает только у владеющего — та же надбавка, что у брони.
    score += (canWieldWeapon(def, gear) ? 3 : 0) - (canWieldWeapon(def, cur) ? 3 : 0);
  } else {
    score += (gear.def - cur.def) * 2 + (gear.hp - cur.hp) * 0.5;
    score += (canWearArmor(def, gear) ? 3 : 0) - (canWearArmor(def, cur) ? 3 : 0);
  }
  score += (gear.affix ? 1 : 0) - (cur.affix ? 1 : 0);
  // Артефакты, которым не хватит слотов, пропадут — считаем по самым слабым.
  const lost = cur.slots.filter(Boolean).length - gear.slots.length;
  if (lost > 0) {
    const vals = cur.slots
      .filter((a): a is ArtifactInstance => !!a)
      .map((a) => artifactValue(run, a))
      .sort((x, y) => x - y);
    score -= vals.slice(0, lost).reduce((a, b) => a + b, 0) + 2 * lost;
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

/** Самый слабый вставленный артефакт — кандидат на замену. */
function weakestSocket(run: RunState): { ref: SocketRef; value: number } | null {
  let best: { ref: SocketRef; value: number } | null = null;
  for (const ref of socketRefs(run.hero)) {
    if (!ref.art) continue;
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
  if (socketRefs(run.hero).some((s) => !s.art)) return value;
  const weakest = weakestSocket(run);
  return weakest ? value - weakest.value - 1 : value;
}

// ─── Решения вне боя ───────────────────────────────────────────────────────

/** Ожидающий артефакт: в свободный слот, иначе вместо самого слабого, если он слабее; иначе выбросить. */
export function resolvePending(run: RunState): void {
  const art = run.pending?.artifacts[0];
  if (!art) return;
  const free = socketRefs(run.hero).find((s) => !s.art);
  if (free) {
    pendingPlace(run, free.kind, free.index);
    return;
  }
  const weakest = weakestSocket(run);
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
