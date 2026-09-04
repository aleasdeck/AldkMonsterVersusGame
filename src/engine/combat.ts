import type {
  AiCtx,
  BattleState,
  Combatant,
  Effect,
  EnemyEffect,
  EnemyState,
  EventTarget,
  HeroDef,
  HeroPersistent,
  PlayerAction,
  Status,
  StatusId,
} from './types';
import { MAX_ENEMIES } from './types';
import { chance, int, weighted, type Rng } from './rng';
import { enemyAction, enemyDef } from '../data/enemies';
import { artifactDef } from '../data/artifacts';
import { computeStats, socketedArtifacts } from './stats';

export const STATUS_NAMES: Record<StatusId, string> = {
  strength: 'Сила',
  weak: 'Слабость',
  bleed: 'Кровотечение',
  burn: 'Горение',
  stun: 'Оглушение',
  exhaust: 'Изнурение',
  dodge: 'Уклонение',
  thorns: 'Шипы',
  regen: 'Регенерация',
  invuln: 'Неуязвимость',
};

export const STATUS_HINTS: Record<StatusId, string> = {
  strength: '+N к урону атак до конца боя',
  weak: 'Урон атак −25 %',
  bleed: 'N урона в начале хода, игнорирует блок',
  burn: 'N урона в начале хода, игнорирует блок',
  stun: 'Пропускает следующее действие',
  exhaust: '−1 стамины на следующем ходу',
  dodge: 'Следующая атака не наносит урона',
  thorns: 'Атакующий получает N урона',
  regen: '+N HP в начале хода',
  invuln: 'Не получает урона',
};

// ─── Статусы ───────────────────────────────────────────────────────────────

export function getStatus(c: Combatant, id: StatusId): Status | undefined {
  return c.statuses.find((s) => s.id === id);
}

export function statusValue(c: Combatant, id: StatusId): number {
  return getStatus(c, id)?.value ?? 0;
}

function removeStatus(c: Combatant, id: StatusId): void {
  c.statuses = c.statuses.filter((s) => s.id !== id);
}

const STACKING: StatusId[] = ['strength', 'thorns', 'regen', 'bleed', 'burn', 'dodge'];

function addStatus(state: BattleState, c: Combatant, ref: EventTarget, id: StatusId, value: number, turns: number): void {
  const ex = getStatus(c, id);
  if (ex) {
    if (STACKING.includes(id)) ex.value += value;
    else ex.value = Math.max(ex.value, value);
    if (ex.turns !== -1 && turns !== -1) ex.turns = Math.max(ex.turns, turns);
    else ex.turns = -1;
  } else {
    c.statuses.push({ id, value, turns });
  }
  state.events.push({ type: 'status', target: ref, status: id, value });
}

/** Конец хода владельца: временные статусы теряют ход. */
function tickDurations(c: Combatant): void {
  for (const s of c.statuses) if (s.turns > 0) s.turns--;
  c.statuses = c.statuses.filter((s) => s.turns !== 0);
}

// ─── Утилиты ───────────────────────────────────────────────────────────────

function log(state: BattleState, text: string): void {
  state.log.push(text);
  if (state.log.length > 60) state.log.splice(0, state.log.length - 60);
  state.events.push({ type: 'log', text });
}

export function findEnemy(state: BattleState, uid: number): EnemyState | undefined {
  return state.enemies.find((e) => e.uid === uid);
}

function aiCtx(state: BattleState, e: EnemyState): AiCtx {
  return { self: e, enemies: state.enemies, hero: state.hero, turn: state.turn };
}

// ─── Урон и лечение ────────────────────────────────────────────────────────

type DamageKind = 'hit' | 'spell' | 'dot' | 'thorns';

function damageEnemy(state: BattleState, e: EnemyState, amount: number, kind: DamageKind, crit = false): number {
  if (getStatus(e, 'invuln')) {
    state.events.push({ type: 'damage', target: e.uid, amount: 0, kind: 'blocked' });
    log(state, `${e.name} неуязвим`);
    return 0;
  }
  let rest = Math.max(0, amount);
  if (kind === 'hit' || kind === 'spell') {
    const b = Math.min(e.block, rest);
    e.block -= b;
    rest -= b;
  }
  e.hp -= rest;
  state.stats.damageDealt += rest;
  state.events.push({ type: 'damage', target: e.uid, amount: rest, kind: rest === 0 ? 'blocked' : crit ? 'crit' : kind });
  if (kind === 'hit') {
    const th = statusValue(e, 'thorns');
    if (th > 0) {
      log(state, `Шипы ${e.name}: ${th} урона герою`);
      damageHero(state, th, 'thorns');
    }
  }
  return rest;
}

function damageHero(state: BattleState, amount: number, kind: DamageKind, source?: EnemyState): number {
  const h = state.hero;
  let rest = Math.max(0, amount);
  if (kind === 'hit') {
    if (getStatus(h, 'invuln')) {
      state.events.push({ type: 'damage', target: 'hero', amount: 0, kind: 'blocked' });
      return 0;
    }
    const d = getStatus(h, 'dodge');
    if (d) {
      d.value -= 1;
      if (d.value <= 0) removeStatus(h, 'dodge');
      state.events.push({ type: 'damage', target: 'hero', amount: 0, kind: 'blocked' });
      log(state, 'Герой уклоняется');
      return 0;
    }
    const b = Math.min(h.block, rest);
    h.block -= b;
    rest -= b;
  }
  h.hp -= rest;
  state.stats.damageTaken += rest;
  state.events.push({ type: 'damage', target: 'hero', amount: rest, kind: rest === 0 ? 'blocked' : kind });
  if (kind === 'hit' && source) {
    const th = h.stats.thorns + statusValue(h, 'thorns');
    if (th > 0) {
      log(state, `Шипы героя: ${th} урона ${source.name}`);
      damageEnemy(state, source, th, 'thorns');
    }
  }
  if (h.hp <= 0) {
    h.hp = 0;
    state.phase = 'lost';
    log(state, 'Герой пал.');
  }
  return rest;
}

function healHero(state: BattleState, amount: number): void {
  const h = state.hero;
  const healed = Math.min(amount, h.maxHp - h.hp);
  if (healed <= 0) return;
  h.hp += healed;
  state.events.push({ type: 'heal', target: 'hero', amount: healed });
}

function healEnemy(state: BattleState, e: EnemyState, amount: number): void {
  const healed = Math.min(amount, e.maxHp - e.hp);
  if (healed <= 0) return;
  e.hp += healed;
  state.events.push({ type: 'heal', target: e.uid, amount: healed });
}

function cleanupDead(state: BattleState): void {
  const dead = state.enemies.filter((e) => e.hp <= 0);
  if (dead.length === 0) return;
  for (const e of dead) {
    state.events.push({ type: 'death', target: e.uid });
    log(state, `${e.name} повержен`);
    state.stats.kills += 1;
  }
  state.enemies = state.enemies.filter((e) => e.hp > 0);
  state.enemyQueue = state.enemyQueue.filter((uid) => state.enemies.some((e) => e.uid === uid));
  if (state.enemies.length === 0 && state.phase !== 'lost') {
    state.phase = 'won';
    log(state, 'Победа!');
  }
}

// ─── Герой ─────────────────────────────────────────────────────────────────

function heroAttackDamage(state: BattleState, rng: Rng, bonus: number): { dmg: number; crit: boolean } {
  const h = state.hero;
  const roll = int(rng, h.stats.dmgMin, h.stats.dmgMax);
  let dmg = roll + h.stats.str + statusValue(h, 'strength') + bonus;
  const crit = h.stats.crit > 0 && chance(rng, h.stats.crit);
  if (crit) dmg *= 2;
  if (getStatus(h, 'weak')) dmg = Math.floor(dmg * 0.75);
  return { dmg: Math.max(0, dmg), crit };
}

export interface DamageRange {
  min: number;
  max: number;
}

/** Предпросмотр разброса урона атаки без крита — для интерфейса. */
export function previewAttack(state: BattleState, bonus = 0): DamageRange {
  const h = state.hero;
  const flat = h.stats.str + statusValue(h, 'strength') + bonus;
  let min = h.stats.dmgMin + flat;
  let max = h.stats.dmgMax + flat;
  if (getStatus(h, 'weak')) {
    min = Math.floor(min * 0.75);
    max = Math.floor(max * 0.75);
  }
  return { min: Math.max(0, min), max: Math.max(0, max) };
}

export function rangeText(r: DamageRange): string {
  return r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`;
}

export function canUseAction(state: BattleState, action: PlayerAction): string | null {
  if (state.phase !== 'player') return 'Не ваш ход';
  const h = state.hero;
  switch (action.type) {
    case 'attack':
      if (h.sta < 1) return 'Нет стамины';
      if (!findEnemy(state, action.target)) return 'Нет цели';
      return null;
    case 'defend':
      if (h.sta < 1) return 'Нет стамины';
      return null;
    case 'artifact': {
      const def = artifactDef(action.artifactId);
      if (def.kind !== 'active') return 'Пассивный артефакт';
      const inst = h.artifacts.find((a) => a.id === def.id);
      if (!inst) return 'Артефакт не вставлен';
      const cd = h.cooldowns[def.id] ?? 0;
      if (cd > 0) return `Перезарядка: ${cd}`;
      if ((def.cost?.sta ?? 0) > h.sta) return 'Нет стамины';
      if ((def.cost?.mp ?? 0) > h.mp) return 'Нет маны';
      if (def.target === 'enemy' && !findEnemy(state, action.target ?? -1)) return 'Нет цели';
      return null;
    }
  }
}

function targetsFor(state: BattleState, target: 'enemy' | 'allEnemies', uid?: number): EnemyState[] {
  if (target === 'allEnemies') return state.enemies.slice();
  const e = findEnemy(state, uid ?? -1) ?? state.enemies[0];
  return e ? [e] : [];
}

function applyEffect(state: BattleState, eff: Effect, targetUid: number | undefined, rng: Rng): void {
  const h = state.hero;
  switch (eff.type) {
    case 'attack':
      for (const e of targetsFor(state, eff.target, targetUid)) {
        const { dmg, crit } = heroAttackDamage(state, rng, eff.bonus);
        log(state, `Удар по ${e.name}: ${dmg}${crit ? ' (крит!)' : ''}`);
        damageEnemy(state, e, dmg, 'hit', crit);
      }
      break;
    case 'spell': {
      const amount = eff.amount + h.stats.spellPower;
      for (const e of targetsFor(state, eff.target, targetUid)) {
        log(state, `Заклинание по ${e.name}: ${amount}`);
        damageEnemy(state, e, amount, 'spell');
      }
      if (eff.drain) healHero(state, amount);
      break;
    }
    case 'block':
      h.block += eff.amount;
      state.events.push({ type: 'block', target: 'hero', amount: eff.amount });
      break;
    case 'heal':
      healHero(state, eff.amount);
      break;
    case 'status':
      if (eff.target === 'self') addStatus(state, h, 'hero', eff.status, eff.value, eff.turns);
      else for (const e of targetsFor(state, eff.target, targetUid)) addStatus(state, e, e.uid, eff.status, eff.value, eff.turns);
      break;
    case 'gainSta':
      h.sta += eff.amount;
      break;
  }
}

export function performAction(state: BattleState, action: PlayerAction, rng: Rng): void {
  const err = canUseAction(state, action);
  if (err) throw new Error(err);
  const h = state.hero;
  if (action.type === 'attack') {
    h.sta -= 1;
    const e = findEnemy(state, action.target)!;
    const { dmg, crit } = heroAttackDamage(state, rng, 0);
    log(state, `Герой бьёт ${e.name}: ${dmg}${crit ? ' (крит!)' : ''}`);
    damageEnemy(state, e, dmg, 'hit', crit);
    if (h.stats.lifesteal > 0) healHero(state, h.stats.lifesteal);
  } else if (action.type === 'defend') {
    h.sta -= 1;
    h.block += h.stats.def;
    state.events.push({ type: 'block', target: 'hero', amount: h.stats.def });
    log(state, `Герой защищается: +${h.stats.def} блока`);
  } else {
    const def = artifactDef(action.artifactId);
    const inst = h.artifacts.find((a) => a.id === def.id)!;
    h.sta -= def.cost?.sta ?? 0;
    h.mp -= def.cost?.mp ?? 0;
    const cd = def.cooldown?.(inst.tier) ?? 0;
    if (cd > 0) h.cooldowns[def.id] = cd;
    log(state, `Герой: ${def.name}`);
    for (const eff of def.effects?.(inst.tier) ?? []) applyEffect(state, eff, action.target, rng);
  }
  cleanupDead(state);
}

function startPlayerTurn(state: BattleState): void {
  const h = state.hero;
  state.turn += 1;
  state.phase = 'player';
  h.block = 0;
  const ex = getStatus(h, 'exhaust');
  h.sta = Math.max(0, h.maxSta - (ex?.value ?? 0));
  if (ex) removeStatus(h, 'exhaust');
  if (state.turn === 1) h.sta += h.stats.firstTurnSta;
  else h.mp = Math.min(h.maxMp, h.mp + h.stats.mpRegen);
  for (const k of Object.keys(h.cooldowns)) if (h.cooldowns[k] > 0) h.cooldowns[k] -= 1;
  log(state, `— Ход ${state.turn} —`);
  const regen = h.stats.regen + statusValue(h, 'regen');
  if (regen > 0) healHero(state, regen);
  const dot = statusValue(h, 'bleed') + statusValue(h, 'burn');
  if (dot > 0) {
    log(state, `Герой теряет ${dot} HP от ран`);
    damageHero(state, dot, 'dot');
  }
}

export function endTurn(state: BattleState): void {
  if (state.phase !== 'player') return;
  tickDurations(state.hero);
  state.phase = 'enemy';
  state.enemyQueue = state.enemies.map((e) => e.uid);
}

// ─── Враги ─────────────────────────────────────────────────────────────────

function chooseIntent(state: BattleState, e: EnemyState, rng: Rng): void {
  const def = enemyDef(e.defId);
  const ctx = aiCtx(state, e);
  if (def.ai.type === 'cycle') {
    const order = def.ai.order;
    for (let i = 0; i < order.length; i++) {
      const idx = (e.cycleIdx + i) % order.length;
      const a = enemyAction(def, order[idx]);
      if (!a.condition || a.condition(ctx)) {
        e.cycleIdx = idx;
        e.intent = a.id;
        return;
      }
    }
    e.intent = order[e.cycleIdx];
    return;
  }
  if (e.forcedNext) {
    e.intent = e.forcedNext;
    e.forcedNext = null;
    return;
  }
  const nextTurn = state.turn + 1;
  const rules = def.ai.rules;
  let cands = rules.filter((r) => {
    if (r.weight <= 0) return false;
    if (r.condition && !r.condition(ctx)) return false;
    if (r.cooldown) {
      const last = e.lastUsedTurn[r.action];
      if (last !== undefined && nextTurn - last < r.cooldown) return false;
    }
    if (r.maxUses && (e.uses[r.action] ?? 0) >= r.maxUses) return false;
    return true;
  });
  if (cands.length > 1) {
    const noRepeat = cands.filter((r) => r.action !== e.lastAction);
    if (noRepeat.length > 0) cands = noRepeat;
  }
  if (cands.length === 0) cands = rules.filter((r) => r.weight > 0);
  e.intent = weighted(
    rng,
    cands.map((r) => ({ item: r.action, weight: r.weight })),
  );
}

function spawnEnemy(state: BattleState, defId: string, rng: Rng, announce: boolean): EnemyState {
  const def = enemyDef(defId);
  const e: EnemyState = {
    uid: state.nextUid++,
    defId,
    name: def.name,
    hp: def.hp,
    maxHp: def.hp,
    block: 0,
    statuses: [],
    intent: def.actions[0].id,
    cycleIdx: 0,
    uses: {},
    lastUsedTurn: {},
    lastAction: null,
    forcedNext: null,
  };
  state.enemies.push(e);
  chooseIntent(state, e, rng);
  if (announce) {
    state.events.push({ type: 'summon', target: e.uid });
    log(state, `Появляется ${e.name}`);
  }
  return e;
}

function applyEnemyEffect(state: BattleState, e: EnemyState, eff: EnemyEffect, rng: Rng): void {
  const h = state.hero;
  switch (eff.type) {
    case 'attack': {
      let dmg = eff.amount + statusValue(e, 'strength');
      if (getStatus(e, 'weak')) dmg = Math.floor(dmg * 0.75);
      const hits = eff.hits ?? 1;
      for (let i = 0; i < hits; i++) {
        if (state.phase === 'lost') break;
        const dealt = damageHero(state, dmg, 'hit', e);
        log(state, `${e.name} атакует: ${dmg} (${dealt} по HP)`);
      }
      break;
    }
    case 'block':
      e.block += eff.amount;
      state.events.push({ type: 'block', target: e.uid, amount: eff.amount });
      break;
    case 'buffStr': {
      const targets =
        eff.target === 'self' ? [e] : eff.target === 'allies' ? state.enemies : state.enemies.filter((x) => x.defId === e.defId);
      for (const t of targets) addStatus(state, t, t.uid, 'strength', eff.amount, -1);
      break;
    }
    case 'heal': {
      const targets = eff.target === 'self' ? [e] : state.enemies;
      for (const t of targets) healEnemy(state, t, eff.amount);
      break;
    }
    case 'debuff':
      addStatus(state, h, 'hero', eff.status, eff.value, eff.turns);
      log(state, `На героя наложено: ${STATUS_NAMES[eff.status]}`);
      break;
    case 'drainMp': {
      const drained = Math.min(h.mp, eff.amount);
      h.mp -= drained;
      log(state, `Герой теряет ${drained} маны`);
      break;
    }
    case 'summon':
      for (let i = 0; i < eff.count; i++) {
        if (state.enemies.length >= MAX_ENEMIES) break;
        spawnEnemy(state, eff.enemyId, rng, true);
      }
      break;
    case 'invuln':
      // +1 ход: статус наложен в собственный ход владельца
      addStatus(state, e, e.uid, 'invuln', 1, 2);
      break;
    case 'thorns':
      addStatus(state, e, e.uid, 'thorns', eff.amount, -1);
      break;
  }
}

function actEnemy(state: BattleState, e: EnemyState, rng: Rng): void {
  const def = enemyDef(e.defId);
  e.block = 0;
  const dot = statusValue(e, 'bleed') + statusValue(e, 'burn');
  if (dot > 0) {
    log(state, `${e.name} теряет ${dot} HP от ран`);
    damageEnemy(state, e, dot, 'dot');
    if (e.hp <= 0) return;
  }
  if (getStatus(e, 'stun')) {
    removeStatus(e, 'stun');
    state.events.push({ type: 'stunned', target: e.uid });
    log(state, `${e.name} оглушён и пропускает ход`);
    tickDurations(e);
    return;
  }
  const action = enemyAction(def, e.intent);
  state.events.push({ type: 'enemyAction', target: e.uid, name: action.name });
  log(state, `${e.name}: ${action.name}`);
  for (const eff of action.effects) applyEnemyEffect(state, e, eff, rng);
  e.uses[action.id] = (e.uses[action.id] ?? 0) + 1;
  e.lastUsedTurn[action.id] = state.turn;
  e.lastAction = action.id;
  if (def.ai.type === 'boss') {
    const rule = def.ai.rules.find((r) => r.action === action.id);
    e.forcedNext = rule?.followUp ?? null;
  } else {
    e.cycleIdx = (e.cycleIdx + 1) % def.ai.order.length;
  }
  tickDurations(e);
  if (state.phase === 'lost' || e.hp <= 0) return;
  chooseIntent(state, e, rng);
}

/** Выполнить действие одного врага из очереди. Пустая очередь — начало хода игрока. */
export function enemyStep(state: BattleState, rng: Rng): void {
  if (state.phase !== 'enemy') return;
  while (state.enemyQueue.length > 0) {
    const uid = state.enemyQueue.shift()!;
    const e = findEnemy(state, uid);
    if (!e) continue;
    actEnemy(state, e, rng);
    cleanupDead(state);
    return;
  }
  startPlayerTurn(state);
}

export function resolveEnemyTurn(state: BattleState, rng: Rng): void {
  let guard = 0;
  while (state.phase === 'enemy' && guard++ < 100) enemyStep(state, rng);
}

// ─── Создание боя ──────────────────────────────────────────────────────────

export function createBattle(heroDef: HeroDef, hero: HeroPersistent, enemyIds: string[], rng: Rng): BattleState {
  const stats = computeStats(heroDef, hero.weapon, hero.armor);
  const state: BattleState = {
    hero: {
      hp: Math.min(hero.hp, stats.maxHp),
      maxHp: stats.maxHp,
      block: 0,
      statuses: [],
      sta: stats.sta,
      maxSta: stats.sta,
      mp: stats.maxMp,
      maxMp: stats.maxMp,
      cooldowns: {},
      stats,
      artifacts: socketedArtifacts(hero.weapon, hero.armor),
    },
    enemies: [],
    turn: 0,
    phase: 'enemy',
    enemyQueue: [],
    events: [],
    log: [],
    nextUid: 1,
    stats: { damageDealt: 0, damageTaken: 0, kills: 0 },
  };
  for (const id of enemyIds) spawnEnemy(state, id, rng, false);
  startPlayerTurn(state);
  return state;
}

// ─── Намерения ─────────────────────────────────────────────────────────────

export type IntentKind = 'attack' | 'defend' | 'buff' | 'debuff' | 'heal' | 'summon' | 'special';

export interface IntentInfo {
  kind: IntentKind;
  icon: string;
  label: string;
  name: string;
  text: string;
  stunned: boolean;
}

const INTENT_ICON: Record<IntentKind, string> = {
  attack: '⚔',
  defend: '⛨',
  buff: '↑',
  debuff: '☠',
  heal: '✚',
  summon: '☍',
  special: '✦',
};

const INTENT_PRIORITY: IntentKind[] = ['attack', 'summon', 'debuff', 'heal', 'buff', 'defend', 'special'];

export function computeIntent(e: EnemyState): IntentInfo {
  const def = enemyDef(e.defId);
  const a = enemyAction(def, e.intent);
  const parts: string[] = [];
  const kinds: IntentKind[] = [];
  let label = '';
  for (const eff of a.effects) {
    switch (eff.type) {
      case 'attack': {
        let dmg = eff.amount + statusValue(e, 'strength');
        if (getStatus(e, 'weak')) dmg = Math.floor(dmg * 0.75);
        const hits = eff.hits ?? 1;
        label = hits > 1 ? `${dmg}×${hits}` : `${dmg}`;
        parts.push(`Атака ${label}`);
        kinds.push('attack');
        break;
      }
      case 'block':
        if (!label) label = `${eff.amount}`;
        parts.push(`Блок ${eff.amount}`);
        kinds.push('defend');
        break;
      case 'buffStr':
        parts.push(
          `+${eff.amount} к урону (${eff.target === 'self' ? 'себе' : eff.target === 'allies' ? 'всем союзникам' : 'всем: ' + def.name})`,
        );
        kinds.push('buff');
        break;
      case 'heal':
        parts.push(`Лечит ${eff.amount} (${eff.target === 'self' ? 'себя' : 'всех союзников'})`);
        kinds.push('heal');
        break;
      case 'debuff': {
        const dur = eff.turns > 0 ? ` на ${eff.turns} ход(а)` : '';
        const val = eff.status === 'bleed' || eff.status === 'burn' ? ` ${eff.value}` : '';
        parts.push(`${STATUS_NAMES[eff.status]}${val}${dur}`);
        kinds.push('debuff');
        break;
      }
      case 'drainMp':
        parts.push(`−${eff.amount} маны герою`);
        kinds.push('debuff');
        break;
      case 'summon':
        parts.push(`Призыв: ${enemyDef(eff.enemyId).name}${eff.count > 1 ? ` ×${eff.count}` : ''}`);
        kinds.push('summon');
        break;
      case 'invuln':
        parts.push('Неуязвимость на ход');
        kinds.push('special');
        break;
      case 'thorns':
        parts.push(`Шипы ${eff.amount}`);
        kinds.push('buff');
        break;
    }
  }
  const kind = INTENT_PRIORITY.find((k) => kinds.includes(k)) ?? 'special';
  return {
    kind,
    icon: INTENT_ICON[kind],
    label: kind === 'attack' || kind === 'defend' ? label : '',
    name: a.name,
    text: `${a.name}: ${parts.join(', ')}`,
    stunned: !!getStatus(e, 'stun'),
  };
}
