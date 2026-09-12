import type {
  AiCtx,
  AllyState,
  BattleState,
  Combatant,
  Effect,
  EnemyDef,
  EnemyEffect,
  EnemyState,
  HeroBattle,
  EventTarget,
  HeroDef,
  HeroPersistent,
  PlayerAction,
  Status,
  StatusId,
} from './types';
import { MAX_ALLIES, MAX_ENEMIES } from './types';
import { chance, int, weighted, type Rng } from './rng';
import { enemyAction, enemyDef } from '../data/enemies';
import { enemyScale, locationDef } from '../data/locations';
import { artifactCost, artifactDef } from '../data/artifacts';
import { potionDef } from '../data/potions';
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
  poison: 'Яд',
  stealth: 'Скрытность',
  smoke: 'Дымовая завеса',
  vulnerable: 'Уязвимость',
  doom: 'Предсмертие',
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
  poison: 'N урона в начале хода, игнорирует блок',
  stealth: 'Враги не видят героя: атаки и проклятия мимо. Любая атака героя — удар в спину: крит, снимает скрытность',
  vulnerable: 'Получает на 25 % больше урона от ударов и заклинаний; раны не усиливает',
  smoke: 'Каждый удар врага с шансом 80 % проходит мимо. Атака героя из дыма — удар в спину: крит, снимает завесу',
  doom: 'Погибнув, враг напоследок сделает ещё кое-что: наведи на метку, чтобы увидеть, что именно',
};

/**
 * Уязвимость: удары и заклинания по цели сильнее на четверть. Округление к ближайшему, не вниз:
 * при уроне 3–7 за удар округление вниз съедало бонус целиком (3 × 1.25 = 3.75 → 3), и статус был декоративным.
 */
export const VULNERABLE_MULT = 1.25;

/** Ниже этой доли HP цель считается раненой: «Клеймо палача» добавляет шанс крита по ней. */
export const EXECUTE_HP_PCT = 0.2;

/** Шанс, что удар врага пройдёт мимо героя в дымовой завесе («Дымовая шашка»). */
export const SMOKE_MISS_CHANCE = 0.8;

// ─── Статусы ───────────────────────────────────────────────────────────────

/** Число врага, домноженное под акт: HP, блок и лечение — на hpMult, урон и DoT — на dmgMult. */
function scaled(mult: number, amount: number): number {
  return Math.max(1, Math.round(amount * mult));
}

function isDot(id: StatusId): boolean {
  return id === 'bleed' || id === 'burn';
}

function scaleFor(state: BattleState, def: EnemyDef): { hp: number; dmg: number } {
  return state.act === null ? { hp: 1, dmg: 1 } : enemyScale(locationDef(def.location).tier, state.act, def.rank);
}

export function getStatus(c: Combatant, id: StatusId): Status | undefined {
  return c.statuses.find((s) => s.id === id);
}

export function statusValue(c: Combatant, id: StatusId): number {
  return getStatus(c, id)?.value ?? 0;
}

function removeStatus(c: Combatant, id: StatusId): void {
  c.statuses = c.statuses.filter((s) => s.id !== id);
}

const STACKING: StatusId[] = ['strength', 'thorns', 'regen', 'bleed', 'burn', 'poison', 'dodge'];

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
  const amount = STACKING.includes(id) || id === 'exhaust' ? ` ${value}` : '';
  log(state, `${nameOf(state, ref)}: ${STATUS_NAMES[id]}${amount} ${turnsText(turns)}`);
}

/** Конец хода владельца: временные статусы теряют ход. */
function tickDurations(c: Combatant): void {
  for (const s of c.statuses) if (s.turns > 0) s.turns--;
  c.statuses = c.statuses.filter((s) => s.turns !== 0);
}

// ─── Утилиты ───────────────────────────────────────────────────────────────

function log(state: BattleState, text: string): void {
  state.log.push(text);
  // Лог боя хранится целиком (уходит в логи забега); страховка от бесконечного боя.
  if (state.log.length > 600) state.log.splice(0, state.log.length - 600);
  state.events.push({ type: 'log', text });
}

/** Имя бойца для лога: герой, враг или союзник по uid. */
function nameOf(state: BattleState, ref: EventTarget): string {
  if (ref === 'hero') return 'Герой';
  return state.enemies.find((e) => e.uid === ref)?.name ?? state.allies.find((a) => a.uid === ref)?.name ?? '???';
}

/** «на 2 хода», «до конца боя». */
function turnsText(turns: number): string {
  if (turns === -1) return 'до конца боя';
  return `на ${turns} ${turns === 1 ? 'ход' : turns < 5 ? 'хода' : 'ходов'}`;
}

/** Прибавка блока любому бойцу: событие для интерфейса и строка лога с источником. */
function gainBlock(state: BattleState, c: Combatant, ref: EventTarget, amount: number, why?: string): void {
  if (amount <= 0) return;
  c.block += amount;
  state.events.push({ type: 'block', target: ref, amount });
  log(state, `${nameOf(state, ref)}: +${amount} блока${why ? ` (${why})` : ''}`);
}

/** Что случилось с ударом по дороге к HP — для строки лога. Заполняется damageEnemy/damageHero. */
interface HitDetail {
  /** Съедено блоком. */
  blocked: number;
  /** Урон после уязвимости, если она была; 0 — не было. */
  vuln: number;
  /** Гашение удара кольчугой. */
  reduced: number;
  /** Почему урон не дошёл вовсе: уклонение, неуязвимость, тень, дым. */
  miss: string;
}

function newDetail(): HitDetail {
  return { blocked: 0, vuln: 0, reduced: 0, miss: '' };
}

/** Хвост строки лога по деталям удара: «→ 4 по HP (уязвимость ×1.25, кольчуга −1, блок −3)». */
function hitTail(dmg: number, dealt: number, d: HitDetail, pierce = false): string {
  if (d.miss) return ` → 0 по HP (${d.miss})`;
  const notes: string[] = [];
  if (d.vuln) notes.push(`уязвимость ×${VULNERABLE_MULT} = ${d.vuln}`);
  if (d.reduced) notes.push(`кольчуга −${d.reduced}`);
  if (d.blocked) notes.push(`блок −${d.blocked}`);
  if (pierce) notes.push('сквозь блок');
  if (dealt === dmg && notes.length === 0) return '';
  return ` → ${dealt} по HP${notes.length ? ` (${notes.join(', ')})` : ''}`;
}

export function findEnemy(state: BattleState, uid: number): EnemyState | undefined {
  return state.enemies.find((e) => e.uid === uid);
}

function aiCtx(state: BattleState, e: EnemyState): AiCtx {
  return { self: e, enemies: state.enemies, hero: state.hero, turn: state.turn };
}

// ─── Урон и лечение ────────────────────────────────────────────────────────

type DamageKind = 'hit' | 'spell' | 'dot' | 'thorns';

interface HitOpts {
  crit?: boolean;
  /** Игнорировать блок цели (Дробящая булава). */
  pierce?: boolean;
  /** Не отвечать шипами: сквозной урон копья. */
  noThorns?: boolean;
  /** Бьёт союзник, а не герой: шипы отвечают ему. */
  attacker?: AllyState;
  /** Куда записать, что съел блок и уязвимость — для строки лога. */
  detail?: HitDetail;
}

function damageEnemy(state: BattleState, e: EnemyState, amount: number, kind: DamageKind, opts: HitOpts = {}): number {
  const crit = opts.crit ?? false;
  const detail = opts.detail ?? newDetail();
  if (getStatus(e, 'invuln')) {
    state.events.push({ type: 'damage', target: e.uid, amount: 0, kind: 'blocked' });
    detail.miss = 'неуязвим';
    if (!opts.detail) log(state, `${e.name} неуязвим`);
    return 0;
  }
  if (kind === 'hit') {
    const d = getStatus(e, 'dodge');
    if (d) {
      d.value -= 1;
      if (d.value <= 0) removeStatus(e, 'dodge');
      state.events.push({ type: 'damage', target: e.uid, amount: 0, kind: 'blocked' });
      detail.miss = 'уклонился';
      if (!opts.detail) log(state, `${e.name} уворачивается`);
      return 0;
    }
  }
  let rest = Math.max(0, amount);
  if ((kind === 'hit' || kind === 'spell') && getStatus(e, 'vulnerable')) {
    rest = Math.round(rest * VULNERABLE_MULT);
    detail.vuln = rest;
  }
  if ((kind === 'hit' && !opts.pierce) || kind === 'spell') {
    const b = Math.min(e.block, rest);
    e.block -= b;
    rest -= b;
    detail.blocked = b;
  }
  e.hp -= rest;
  state.stats.damageDealt += rest;
  state.events.push({ type: 'damage', target: e.uid, amount: rest, kind: rest === 0 ? 'blocked' : crit ? 'crit' : kind });
  if (kind === 'hit' && !opts.noThorns) {
    const th = statusValue(e, 'thorns');
    if (th > 0 && opts.attacker) {
      log(state, `Шипы ${e.name}: ${th} урона ${opts.attacker.name}`);
      damageAlly(state, opts.attacker, th, true);
    } else if (th > 0 && state.hero.stats.thornsImmune <= 0) {
      log(state, `Шипы ${e.name}: ${th} урона герою`);
      damageHero(state, th, 'thorns');
    }
  }
  return rest;
}

/**
 * `rng` нужен только ударам (`hit`): дымовая завеса решает бросок за каждый удар отдельно.
 * `detail` — куда записать судьбу удара для строки лога; без него промахи пишутся в лог отдельной строкой.
 */
function damageHero(state: BattleState, amount: number, kind: DamageKind, source?: EnemyState, pierce = false, rng?: Rng, detail?: HitDetail): number {
  const h = state.hero;
  const d = detail ?? newDetail();
  const miss = (why: string): number => {
    state.events.push({ type: 'damage', target: 'hero', amount: 0, kind: 'blocked' });
    d.miss = why;
    if (!detail) log(state, `Герой: ${why}`);
    return 0;
  };
  let rest = Math.max(0, amount);
  if (kind === 'hit') {
    if (getStatus(h, 'stealth')) return miss('враг не видит героя');
    if (rng && getStatus(h, 'smoke') && chance(rng, SMOKE_MISS_CHANCE)) return miss('удар уходит в дым');
    if (getStatus(h, 'invuln')) return miss('неуязвим');
    const dg = getStatus(h, 'dodge');
    if (dg) {
      dg.value -= 1;
      if (dg.value <= 0) removeStatus(h, 'dodge');
      return miss('уклонился');
    }
    if (getStatus(h, 'vulnerable')) {
      rest = Math.round(rest * VULNERABLE_MULT);
      d.vuln = rest;
    }
    // Кольца кольчуги гасят часть каждого удара ещё до блока.
    if (h.stats.hitReduce > 0) {
      d.reduced = Math.min(rest, h.stats.hitReduce);
      rest = Math.max(0, rest - h.stats.hitReduce);
    }
    if (!pierce) {
      const b = Math.min(h.block, rest);
      h.block -= b;
      rest -= b;
      d.blocked = b;
    }
  }
  h.hp -= rest;
  state.stats.damageTaken += rest;
  state.events.push({ type: 'damage', target: 'hero', amount: rest, kind: rest === 0 ? 'blocked' : kind });
  if (kind === 'hit' && source) {
    const th = h.stats.thorns + statusValue(h, 'thorns');
    if (th > 0) {
      log(state, `Шипы героя: ${th} урона ${source.name}`);
      damageEnemy(state, source, th, 'thorns', { noThorns: true });
    }
  }
  if (h.hp <= 0) {
    h.hp = 0;
    state.phase = 'lost';
    log(state, 'Герой пал.');
  }
  return rest;
}

function healHero(state: BattleState, amount: number, why?: string): void {
  const h = state.hero;
  const healed = Math.min(amount, h.maxHp - h.hp);
  if (healed <= 0) return;
  h.hp += healed;
  state.events.push({ type: 'heal', target: 'hero', amount: healed });
  log(state, `Герой: +${healed} HP${why ? ` (${why})` : ''}`);
}

// ─── Союзники ──────────────────────────────────────────────────────────────

function spawnAlly(state: BattleState, defId: string, hpBonus: number): AllyState {
  const def = enemyDef(defId);
  const a: AllyState = { uid: state.nextUid++, defId, name: def.name, hp: def.hp + hpBonus, maxHp: def.hp + hpBonus, block: 0, statuses: [], cycleIdx: 0 };
  state.allies.push(a);
  state.events.push({ type: 'summon', target: a.uid });
  log(state, `Рядом с героем появляется ${a.name}`);
  return a;
}

function damageAlly(state: BattleState, a: AllyState, amount: number, pierce = false): number {
  let rest = Math.max(0, amount);
  if (!pierce) {
    const b = Math.min(a.block, rest);
    a.block -= b;
    rest -= b;
  }
  a.hp -= rest;
  state.events.push({ type: 'damage', target: a.uid, amount: rest, kind: rest === 0 ? 'blocked' : 'hit' });
  if (a.hp <= 0) {
    state.events.push({ type: 'death', target: a.uid });
    log(state, `${a.name} пал`);
    state.allies = state.allies.filter((x) => x !== a);
    state.allyQueue = state.allyQueue.filter((uid) => uid !== a.uid);
  }
  return rest;
}

/** Ход союзника: действия по циклу его прототипа. Атаки — по самому раненому врагу, баффы — по своим. */
function actAlly(state: BattleState, a: AllyState, rng: Rng): void {
  const def = enemyDef(a.defId);
  a.block = 0;
  const order = def.ai.type === 'cycle' ? def.ai.order : def.actions.map((x) => x.id);
  const action = enemyAction(def, order[a.cycleIdx % order.length]);
  a.cycleIdx = (a.cycleIdx + 1) % order.length;
  state.events.push({ type: 'enemyAction', target: a.uid, name: action.name });
  log(state, `${a.name}: ${action.name}`);
  for (const eff of action.effects) {
    switch (eff.type) {
      case 'attack': {
        let dmg = eff.amount + statusValue(a, 'strength');
        if (getStatus(a, 'weak')) dmg = Math.floor(dmg * 0.75);
        for (let i = 0; i < (eff.hits ?? 1); i++) {
          const target = state.enemies.filter((e) => e.hp > 0).reduce<EnemyState | null>((m, e) => (!m || e.hp < m.hp ? e : m), null);
          if (!target) break;
          log(state, `${a.name} атакует ${target.name}: ${dmg}`);
          damageEnemy(state, target, dmg, 'hit', { attacker: a });
        }
        break;
      }
      case 'buffStr': {
        const targets = eff.target === 'self' ? [a] : eff.target === 'allies' ? state.allies : state.allies.filter((x) => x.defId === a.defId);
        for (const t of targets) addStatus(state, t, t.uid, 'strength', eff.amount, -1);
        break;
      }
      case 'block':
        gainBlock(state, a, a.uid, eff.amount);
        break;
      case 'heal': {
        const healed = Math.min(eff.amount, a.maxHp - a.hp);
        if (healed > 0) {
          a.hp += healed;
          state.events.push({ type: 'heal', target: a.uid, amount: healed });
          log(state, `${a.name}: +${healed} HP`);
        }
        break;
      }
      default:
        log(state, `${a.name} готовится`);
    }
  }
  tickDurations(a);
  cleanupDead(state, rng);
}

function healEnemy(state: BattleState, e: EnemyState, amount: number, why?: string): void {
  const healed = Math.min(amount, e.maxHp - e.hp);
  if (healed <= 0) return;
  e.hp += healed;
  state.events.push({ type: 'heal', target: e.uid, amount: healed });
  log(state, `${e.name}: +${healed} HP${why ? ` (${why})` : ''}`);
}

function cleanupDead(state: BattleState, rng: Rng): void {
  const dead = state.enemies.filter((e) => e.hp <= 0);
  if (dead.length === 0) return;
  for (const e of dead) {
    state.events.push({ type: 'death', target: e.uid });
    log(state, `${e.name} повержен`);
    state.stats.kills += 1;
    // «Кровавый жетон»: глоток жизни за каждого убитого.
    if (state.hero.stats.onKillHeal > 0 && state.hero.hp > 0) healHero(state, state.hero.stats.onKillHeal, 'Кровавый жетон');
  }
  state.enemies = state.enemies.filter((e) => e.hp > 0);
  state.enemyQueue = state.enemyQueue.filter((uid) => state.enemies.some((e) => e.uid === uid));
  // предсмертные эффекты: деление, взрыв
  for (const e of dead) {
    const def = enemyDef(e.defId);
    if (!def.onDeath || state.phase === 'lost') continue;
    log(state, `${e.name}: ${def.onDeath.name}`);
    for (const eff of def.onDeath.effects) applyEnemyEffect(state, e, eff, rng);
  }
  if (state.enemies.length === 0 && state.phase !== 'lost') {
    state.phase = 'won';
    log(state, 'Победа!');
  }
}

// ─── Герой ─────────────────────────────────────────────────────────────────

/** Герой не виден врагам: в тени или в дымовой завесе. Обе дают удар в спину и спадают после атаки. */
export function isHidden(h: HeroBattle): boolean {
  return !!getStatus(h, 'stealth') || !!getStatus(h, 'smoke');
}

/** Любой урон от героя выдаёт его: скрытность и дымовая завеса спадают после удара или заклинания. */
function breakStealth(state: BattleState): void {
  if (!isHidden(state.hero)) return;
  removeStatus(state.hero, 'stealth');
  removeStatus(state.hero, 'smoke');
  log(state, 'Герой выходит из тени');
}

/**
 * «Защититься» даёт не всю Защиту, а 80 % (округление вверх): при полном DEF одно очко стамины гасило удар целиком,
 * и ни лечение, ни лут не влияли на исход — бот-симулятор приходил к боссам с 90 % HP.
 */
export const DEFEND_MULT = 0.8;

export function defendBlock(stats: { def: number; defendBonus: number }): number {
  return Math.ceil((stats.def + stats.defendBonus) * DEFEND_MULT);
}

/** Каждая следующая атака в ходу слабее: герой выдыхается. Сила штрафа — стат героя. */
export function fatigueMult(state: BattleState): number {
  return state.hero.stats.fatigue ** state.hero.attacks;
}

/** Бонус первого удара в ходу (Прицел лука): пока атак в этом ходу не было. */
function firstHitBonus(state: BattleState): number {
  return state.hero.attacks === 0 ? state.hero.stats.firstHit : 0;
}

/**
 * Урон атаки героя и его раскладка для лога: «кубик 4 + Сила 2 + первый удар 1 = 7, усталость ×0.75 = 5, крит ×2 = 10».
 * Слагаемые с нулём и множители, равные единице, не пишутся.
 */
function heroAttackDamage(state: BattleState, rng: Rng, bonus: number, mult = 1, sureCrit = false, target?: EnemyState): { dmg: number; crit: boolean; why: string } {
  const h = state.hero;
  const roll = int(rng, h.stats.dmgMin, h.stats.dmgMax);
  const stealthed = isHidden(h);
  const parts: string[] = [`кубик ${roll}`];
  const add = (name: string, v: number) => {
    if (v > 0) parts.push(`${name} ${v}`);
  };
  add('Сила', h.stats.str + statusValue(h, 'strength'));
  add('приём', bonus);
  add('первый удар', firstHitBonus(state));
  add('в спину', stealthed ? h.stats.backstab : 0);
  const flat = h.stats.str + statusValue(h, 'strength') + bonus + firstHitBonus(state) + (stealthed ? h.stats.backstab : 0);
  const base = roll + flat;
  const steps: string[] = [parts.length > 1 ? `${parts.join(' + ')} = ${base}` : parts[0]];
  const fatigue = fatigueMult(state);
  let dmg = Math.floor(base * mult * fatigue);
  if (mult !== 1 || fatigue !== 1) {
    const m = [mult !== 1 ? `приём ×${mult}` : '', fatigue !== 1 ? `усталость ×${Math.round(fatigue * 100) / 100}` : ''].filter(Boolean).join(', ');
    steps.push(`${m} = ${dmg}`);
  }
  // Шанс крита: свой стат + накопленное «Азартом» + добивание раненой цели («Клеймо палача»).
  const wounded = !!target && target.hp <= target.maxHp * EXECUTE_HP_PCT;
  const critChance = Math.min(1, h.stats.crit + h.critStack + (wounded ? h.stats.executeCrit : 0));
  const crit = sureCrit || stealthed || (critChance > 0 && chance(rng, critChance));
  if (crit) {
    dmg = Math.floor((dmg * h.stats.critDmg) / 100);
    steps.push(`крит ${h.stats.critDmg} % = ${dmg}`);
  }
  if (getStatus(h, 'weak')) {
    dmg = Math.floor(dmg * 0.75);
    steps.push(`слабость ×0.75 = ${dmg}`);
  }
  return { dmg: Math.max(0, dmg), crit, why: steps.join(', ') };
}

interface StrikeOpts {
  bonus?: number;
  mult?: number;
  sureCrit?: boolean;
  /** Одиночный удар: сквозной урон копья уходит следующему врагу. */
  single?: boolean;
  /** Начало строки лога: «Герой бьёт» у базовой атаки, имя приёма у артефакта. */
  label?: string;
}

/**
 * Удар героя по врагу со всеми перками оружия: пробой блока, оглушение критом, кровотечение, блок за удар, сквозной урон.
 * Строка лога пишется здесь, до побочных статусов: «Герой бьёт Мумия: 10 (кубик 4 + …) → 8 по HP (блок −2)».
 */
function heroStrike(state: BattleState, rng: Rng, e: EnemyState, opts: StrikeOpts = {}): { dmg: number; crit: boolean } {
  const h = state.hero;
  const { dmg, crit, why } = heroAttackDamage(state, rng, opts.bonus ?? 0, opts.mult ?? 1, opts.sureCrit, e);
  const detail = newDetail();
  const pierce = h.stats.pierceBlock > 0;
  const dealt = damageEnemy(state, e, dmg, 'hit', { crit, pierce, detail });
  log(state, `${opts.label ?? 'Герой бьёт'} ${e.name}: ${dmg} (${why})${hitTail(dmg, dealt, detail, pierce && e.block > 0)}`);
  if (dealt > 0 && e.hp > 0) {
    // Праща: оглушает только критом, и то не каждым — бросок делается лишь после крита, чтобы не тратить RNG на обычных ударах.
    if (h.stats.stunOnCrit > 0 && crit && !getStatus(e, 'stun') && chance(rng, h.stats.stunOnCrit)) addStatus(state, e, e.uid, 'stun', 1, -1);
    if (h.stats.onHitBleed > 0) addStatus(state, e, e.uid, 'bleed', h.stats.onHitBleed, 2);
    // «Метка охотника»: первый удар в ходу открывает цель для остальных.
    if (h.stats.markOnHit > 0 && h.attacks === 0) addStatus(state, e, e.uid, 'vulnerable', 1, h.stats.markOnHit);
  }
  // «Азарт» копит шанс с каждого промаха мимо крита, крит обнуляет счётчик; «Жажда крови» лечит за крит.
  if (crit) {
    h.critStack = 0;
    if (h.stats.critHeal > 0) healHero(state, h.stats.critHeal, 'жажда крови');
  } else if (h.stats.critRamp > 0) {
    h.critStack = Math.min(1, h.critStack + h.stats.critRamp);
    log(state, `Азарт: шанс крита +${Math.round(h.stats.critRamp * 100)} % (всего +${Math.round(h.critStack * 100)} %)`);
  }
  if (h.stats.blockOnHit > 0) gainBlock(state, h, 'hero', h.stats.blockOnHit, 'перк оружия');
  if (opts.single && h.stats.splash > 0 && dmg > 0) {
    const next = state.enemies.find((x) => x.uid !== e.uid && x.hp > 0);
    if (next) {
      const part = Math.floor(dmg * h.stats.splash);
      if (part > 0) {
        log(state, `Сквозной удар по ${next.name}: ${part}`);
        damageEnemy(state, next, part, 'hit', { pierce: h.stats.pierceBlock > 0, noThorns: true });
      }
    }
  }
  return { dmg, crit };
}

export interface DamageRange {
  min: number;
  max: number;
}

/** Предпросмотр разброса урона атаки без крита — для интерфейса. */
export function previewAttack(state: BattleState, bonus = 0, mult = 1): DamageRange {
  const h = state.hero;
  const flat = h.stats.str + statusValue(h, 'strength') + bonus + firstHitBonus(state) + (isHidden(h) ? h.stats.backstab : 0);
  const scale = mult * fatigueMult(state);
  let min = Math.floor((h.stats.dmgMin + flat) * scale);
  let max = Math.floor((h.stats.dmgMax + flat) * scale);
  if (getStatus(h, 'weak')) {
    min = Math.floor(min * 0.75);
    max = Math.floor(max * 0.75);
  }
  return { min: Math.max(0, min), max: Math.max(0, max) };
}

/**
 * Сколько HP останется у цели после урона из диапазона — для предпросмотра на полоске врага.
 * Удар гасится блоком, если оружие не пробивает его (pierceBlock); заклинание — всегда. Неуязвимость и уклонение
 * (для удара) съедают урон целиком. min — после максимального урона, max — после минимального.
 */
export function previewOnTarget(state: BattleState, e: EnemyState, range: DamageRange, kind: 'hit' | 'spell' = 'hit'): DamageRange {
  const untouched = { min: e.hp, max: e.hp };
  if (getStatus(e, 'invuln')) return untouched;
  if (kind === 'hit' && getStatus(e, 'dodge')) return untouched;
  const block = kind === 'spell' || state.hero.stats.pierceBlock <= 0 ? e.block : 0;
  const vuln = getStatus(e, 'vulnerable') ? VULNERABLE_MULT : 1;
  const after = (dmg: number) => Math.max(0, e.hp - Math.max(0, Math.round(dmg * vuln) - block));
  return { min: after(range.max), max: after(range.min) };
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
      if (h.defended) return 'Защита — раз за ход';
      if (h.sta < 1) return 'Нет стамины';
      return null;
    case 'artifact': {
      const def = artifactDef(action.artifactId);
      if (def.kind !== 'active') return 'Пассивный артефакт';
      const inst = h.artifacts.find((a) => a.id === def.id);
      if (!inst) return 'Артефакт не вставлен';
      const cd = h.cooldowns[def.id] ?? 0;
      if (cd > 0) return `Перезарядка: ${cd}`;
      const limit = def.usesPerTurn?.(inst.tier);
      if (limit && (h.uses[def.id] ?? 0) >= limit) return `Не больше ${limit} раз за ход`;
      const cost = artifactCost(def, inst.tier);
      if (cost.sta === 'all' ? h.sta < Math.max(1, h.maxSta) : (cost.sta ?? 0) > h.sta) return cost.sta === 'all' ? 'Нужна вся стамина' : 'Нет стамины';
      if ((cost.mp ?? 0) > h.mp) return 'Нет маны';
      if (def.target === 'enemy' && !findEnemy(state, action.target ?? -1)) return 'Нет цели';
      if (state.allies.length >= MAX_ALLIES && def.effects?.(inst.tier).some((e) => e.type === 'summon')) return 'Рядом нет места';
      for (const eff of def.effects?.(inst.tier) ?? []) {
        if (eff.type === 'selfDamage' && h.hp <= eff.amount) return 'Слишком мало HP';
        if (eff.type === 'blockStrike' && h.block <= 0) return 'Нет блока';
      }
      return null;
    }
    case 'potion': {
      if (!h.potion) return 'Нет зелья';
      const def = potionDef(h.potion);
      if (def.effects.some((e) => (e.type === 'attack' || e.type === 'spell') && e.target === 'enemy') && !findEnemy(state, action.target ?? -1)) return 'Нет цели';
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
    case 'attack': {
      let swung = 0;
      for (const e of targetsFor(state, eff.target, targetUid)) {
        const { dmg } = heroStrike(state, rng, e, { bonus: eff.bonus, mult: eff.mult ?? 1, sureCrit: eff.sureCrit, single: eff.target === 'enemy', label: 'Удар по' });
        swung += dmg;
      }
      // Щитовой удар: блок — доля урона замаха, а не того, что дошло до HP: блок и уклонение врага щит не отменяют.
      if (eff.blockPct && swung > 0) gainBlock(state, h, 'hero', Math.round(swung * eff.blockPct), `${Math.round(eff.blockPct * 100)} % замаха ${swung}`);
      break;
    }
    case 'blockStrike': {
      // Таран: урон от текущего блока, как удар — гасится блоком врага (кроме булавы), отвечает шипами, но без усталости и крита.
      const dmg = Math.floor(h.block * eff.mult);
      for (const e of targetsFor(state, eff.target, targetUid)) {
        const detail = newDetail();
        const dealt = damageEnemy(state, e, dmg, 'hit', { pierce: h.stats.pierceBlock > 0, detail });
        log(state, `Таран по ${e.name}: ${dmg} (блок ${h.block} × ${eff.mult})${hitTail(dmg, dealt, detail)}`);
      }
      break;
    }
    case 'spell': {
      const amount = eff.amount + h.stats.spellPower;
      const why = h.stats.spellPower > 0 ? `${eff.amount} + сила заклинаний ${h.stats.spellPower}` : '';
      for (const e of targetsFor(state, eff.target, targetUid)) {
        const detail = newDetail();
        const dealt = damageEnemy(state, e, amount, 'spell', { detail });
        log(state, `Заклинание по ${e.name}: ${amount}${why ? ` (${why})` : ''}${hitTail(amount, dealt, detail)}`);
      }
      if (eff.drain) healHero(state, amount, 'осушение');
      if (h.stats.spellLeech > 0) healHero(state, h.stats.spellLeech, 'перк оружия');
      if (h.stats.blockOnSpell > 0) gainBlock(state, h, 'hero', h.stats.blockOnSpell, 'перк брони');
      break;
    }
    case 'selfDamage':
      log(state, `Герой ранит себя: ${eff.amount}`);
      damageHero(state, eff.amount, 'dot', undefined, true);
      break;
    case 'block':
      gainBlock(state, h, 'hero', eff.amount);
      break;
    case 'heal':
      healHero(state, eff.amount, 'лечение');
      break;
    case 'status':
      if (eff.target === 'self') addStatus(state, h, 'hero', eff.status, eff.value, eff.turns);
      else for (const e of targetsFor(state, eff.target, targetUid)) addStatus(state, e, e.uid, eff.status, eff.value, eff.turns);
      break;
    case 'gainSta':
      h.sta += eff.amount;
      log(state, `Герой: +${eff.amount} STA`);
      break;
    case 'gainMp': {
      const gained = Math.min(h.maxMp, h.mp + eff.amount) - h.mp;
      h.mp += gained;
      log(state, `Герой: +${gained} MP`);
      break;
    }
    case 'cleanse': {
      const bad: StatusId[] = ['bleed', 'burn', 'poison', 'weak', 'exhaust', 'vulnerable'];
      const had = h.statuses.filter((s) => bad.includes(s.id)).map((s) => STATUS_NAMES[s.id]);
      for (const id of bad) removeStatus(h, id);
      log(state, had.length ? `Снято: ${had.join(', ')}` : 'Снимать нечего');
      break;
    }
    case 'summon':
      if (state.allies.length < MAX_ALLIES) spawnAlly(state, eff.enemyId, eff.hpBonus);
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
    heroStrike(state, rng, e, { single: true });
    h.attacks += 1;
    if (h.stats.lifesteal > 0) healHero(state, h.stats.lifesteal, 'вампиризм');
    breakStealth(state);
  } else if (action.type === 'defend') {
    h.sta -= 1;
    h.defended = true;
    const gain = defendBlock(h.stats);
    h.block += gain;
    state.events.push({ type: 'block', target: 'hero', amount: gain });
    log(state, `Герой защищается: +${gain} блока`);
  } else if (action.type === 'potion') {
    // Зелье бесплатно: не тратит стамину и не считается атакой, слот пустеет сразу.
    const def = potionDef(h.potion!);
    h.potion = null;
    log(state, `Герой пьёт: ${def.name}`);
    for (const eff of def.effects) applyEffect(state, eff, action.target, rng);
    if (def.effects.some((e) => e.type === 'attack')) h.attacks += 1;
    if (def.effects.some((e) => e.type === 'attack' || e.type === 'spell')) breakStealth(state);
  } else {
    const def = artifactDef(action.artifactId);
    const inst = h.artifacts.find((a) => a.id === def.id)!;
    const cost = artifactCost(def, inst.tier);
    h.sta = cost.sta === 'all' ? 0 : h.sta - (cost.sta ?? 0);
    h.mp -= cost.mp ?? 0;
    const cd = def.cooldown?.(inst.tier) ?? 0;
    if (cd > 0) h.cooldowns[def.id] = cd;
    h.uses[def.id] = (h.uses[def.id] ?? 0) + 1;
    log(state, `Герой: ${def.name}`);
    const effects = def.effects?.(inst.tier) ?? [];
    for (const eff of effects) applyEffect(state, eff, action.target, rng);
    if (effects.some((e) => e.type === 'attack')) h.attacks += 1;
    if (effects.some((e) => e.type === 'attack' || e.type === 'spell' || e.type === 'blockStrike')) breakStealth(state);
  }
  cleanupDead(state, rng);
}

function startPlayerTurn(state: BattleState): void {
  const h = state.hero;
  state.turn += 1;
  state.phase = 'player';
  // Панцирь оставляет часть блока на следующий ход.
  h.block = Math.min(h.block, h.stats.blockKeep);
  h.defended = false;
  h.attacks = 0;
  h.uses = {};
  const ex = getStatus(h, 'exhaust');
  h.sta = Math.max(0, h.maxSta - (ex?.value ?? 0));
  if (ex) removeStatus(h, 'exhaust');
  if (state.turn === 1) h.sta += h.stats.firstTurnSta;
  else h.mp = Math.min(h.maxMp, h.mp + h.stats.mpRegen);
  for (const k of Object.keys(h.cooldowns)) if (h.cooldowns[k] > 0) h.cooldowns[k] -= 1;
  log(state, `— Ход ${state.turn} —`);
  const regen = h.stats.regen + statusValue(h, 'regen');
  if (regen > 0) healHero(state, regen, 'регенерация');
  const dot = statusValue(h, 'bleed') + statusValue(h, 'burn') + statusValue(h, 'poison');
  if (dot > 0) {
    log(state, `Герой теряет ${dot} HP от ран`);
    damageHero(state, dot, 'dot');
  }
}

export function endTurn(state: BattleState): void {
  if (state.phase !== 'player') return;
  tickDurations(state.hero);
  state.phase = 'enemy';
  state.allyQueue = state.allies.map((a) => a.uid);
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
  const sc = scaleFor(state, def);
  const hp = scaled(sc.hp, def.hp);
  const e: EnemyState = {
    uid: state.nextUid++,
    defId,
    name: def.name,
    hp,
    maxHp: hp,
    block: 0,
    // «Предсмертие» — метка без механики: показывает игроку, что у врага есть эффект при смерти (см. onDeathInfo).
    statuses: def.onDeath ? [{ id: 'doom', value: 0, turns: -1 }] : [],
    intent: def.actions[0].id,
    cycleIdx: 0,
    uses: {},
    lastUsedTurn: {},
    lastAction: null,
    forcedNext: null,
    hpMult: sc.hp,
    dmgMult: sc.dmg,
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
      let dmg = scaled(e.dmgMult, eff.amount) + statusValue(e, 'strength');
      if (getStatus(e, 'weak')) dmg = Math.floor(dmg * 0.75);
      const hits = eff.hits ?? 1;
      for (let i = 0; i < hits; i++) {
        if (state.phase === 'lost') break;
        const ally = state.allies[0];
        if (ally) {
          const dealt = damageAlly(state, ally, dmg, eff.pierce);
          log(state, `${e.name} атакует ${ally.name}: ${dmg} (${dealt} по HP)`);
          if (eff.drain && dealt > 0) healEnemy(state, e, dealt);
          continue;
        }
        const detail = newDetail();
        const dealt = damageHero(state, dmg, 'hit', e, eff.pierce, rng, detail);
        log(state, `${e.name} атакует: ${dmg}${hitTail(dmg, dealt, detail, !!eff.pierce && h.block > 0)}`);
        if (eff.drain && dealt > 0) healEnemy(state, e, dealt, 'вампиризм');
      }
      break;
    }
    case 'block': {
      const targets = eff.target === 'allies' ? state.enemies : [e];
      const amt = scaled(e.hpMult, eff.amount);
      for (const t of targets) gainBlock(state, t, t.uid, amt);
      break;
    }
    case 'buffStr': {
      const targets =
        eff.target === 'self' ? [e] : eff.target === 'allies' ? state.enemies : state.enemies.filter((x) => x.defId === e.defId);
      for (const t of targets) addStatus(state, t, t.uid, 'strength', scaled(e.dmgMult, eff.amount), -1);
      break;
    }
    case 'heal': {
      const targets = eff.target === 'self' ? [e] : state.enemies;
      for (const t of targets) healEnemy(state, t, scaled(e.hpMult, eff.amount));
      break;
    }
    case 'debuff':
      if (getStatus(h, 'stealth')) {
        log(state, `${e.name} не видит героя`);
        break;
      }
      addStatus(state, h, 'hero', eff.status, isDot(eff.status) ? scaled(e.dmgMult, eff.value) : eff.value, eff.turns);
      break;
    case 'drainMp': {
      if (getStatus(h, 'stealth')) {
        log(state, `${e.name} не видит героя`);
        break;
      }
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
      addStatus(state, e, e.uid, 'thorns', scaled(e.dmgMult, eff.amount), -1);
      break;
    case 'dodge':
      addStatus(state, e, e.uid, 'dodge', eff.value, -1);
      break;
    case 'selfDestruct': {
      const dealt = damageHero(state, scaled(e.dmgMult, eff.amount) + statusValue(e, 'strength'), 'hit', e, false, rng);
      log(state, `${e.name} взрывается: ${dealt} по HP`);
      if (eff.burn && state.phase !== 'lost') addStatus(state, h, 'hero', 'burn', scaled(e.dmgMult, eff.burn), 3);
      e.hp = 0;
      break;
    }
    case 'none':
      log(state, `${e.name} готовится`);
      break;
  }
}

function actEnemy(state: BattleState, e: EnemyState, rng: Rng): void {
  const def = enemyDef(e.defId);
  e.block = 0;
  const dot = statusValue(e, 'bleed') + statusValue(e, 'burn') + statusValue(e, 'poison');
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
  while (state.allyQueue.length > 0) {
    const uid = state.allyQueue.shift()!;
    const a = state.allies.find((x) => x.uid === uid);
    if (!a) continue;
    actAlly(state, a, rng);
    return;
  }
  while (state.enemyQueue.length > 0) {
    const uid = state.enemyQueue.shift()!;
    const e = findEnemy(state, uid);
    if (!e) continue;
    actEnemy(state, e, rng);
    cleanupDead(state, rng);
    return;
  }
  startPlayerTurn(state);
}

export function resolveEnemyTurn(state: BattleState, rng: Rng): void {
  let guard = 0;
  while (state.phase === 'enemy' && guard++ < 100) enemyStep(state, rng);
}

// ─── Создание боя ──────────────────────────────────────────────────────────

export function createBattle(heroDef: HeroDef, hero: HeroPersistent, enemyIds: string[], rng: Rng, act: number | null = null): BattleState {
  const stats = computeStats(heroDef, hero.weapon, hero.armor);
  const state: BattleState = {
    roster: enemyIds.map((id) => enemyDef(id).name),
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
      uses: {},
      stats,
      artifacts: socketedArtifacts(hero.weapon, hero.armor),
      potion: hero.potion,
      defended: false,
      attacks: 0,
      critStack: 0,
    },
    enemies: [],
    act,
    allies: [],
    turn: 0,
    phase: 'enemy',
    allyQueue: [],
    enemyQueue: [],
    events: [],
    log: [],
    nextUid: 1,
    stats: { damageDealt: 0, damageTaken: 0, kills: 0 },
  };
  for (const id of enemyIds) spawnEnemy(state, id, rng, false);
  // Скрытность плаща: первые атаки врага в этом бою промахиваются.
  if (stats.dodgeStart > 0) addStatus(state, state.hero, 'hero', 'dodge', stats.dodgeStart, -1);
  // Тень покрова: герой входит в бой невидимым.
  if (stats.stealthStart > 0) addStatus(state, state.hero, 'hero', 'stealth', 1, stats.stealthStart);
  startPlayerTurn(state);
  // «Плащ странника»: блок в начале боя — после старта хода, иначе сгорит вместе с остальным.
  if (stats.blockStart > 0) gainBlock(state, state.hero, 'hero', stats.blockStart, 'в начале боя');
  return state;
}

// ─── Намерения ─────────────────────────────────────────────────────────────

export type IntentKind = 'attack' | 'defend' | 'buff' | 'debuff' | 'heal' | 'summon' | 'special';

/**
 * Описание приёма врага: вид для иконки, короткая подпись (урон/блок) и текст подсказки.
 * `kinds` — все виды эффектов приёма по убыванию важности (первый — `kind`), `statuses` — что он вешает на героя:
 * пилюля показывает их рядом с главной иконкой, чтобы дебаф при ударе не прятался в подсказке.
 */
export interface ActionInfo {
  kind: IntentKind;
  icon: string;
  label: string;
  name: string;
  text: string;
  /** Только перечень эффектов, без названия приёма: «Атака 12, Горение 2 на 2 хода». */
  detail: string;
  kinds: IntentKind[];
  statuses: StatusId[];
}

export interface IntentInfo extends ActionInfo {
  stunned: boolean;
}

/**
 * Чем домножать числа приёма при описании: множители акта и текущие статусы врага.
 * В бою берутся из состояния врага, в бестиарии — родные числа без статусов (BASE_SCALE).
 */
export interface ActionScale {
  hpMult: number;
  dmgMult: number;
  strength: number;
  weak: boolean;
}

export const BASE_SCALE: ActionScale = { hpMult: 1, dmgMult: 1, strength: 0, weak: false };

export const INTENT_ICON: Record<IntentKind, string> = {
  attack: '⚔',
  defend: '⛨',
  buff: '↑',
  debuff: '☠',
  heal: '✚',
  summon: '☍',
  special: '✦',
};

const INTENT_PRIORITY: IntentKind[] = ['attack', 'summon', 'debuff', 'heal', 'buff', 'defend', 'special'];

/** Текст приёма (или эффекта при смерти) по его эффектам — общий для намерения в бою и записи бестиария. */
export function describeAction(def: EnemyDef, a: { name: string; effects: EnemyEffect[] }, s: ActionScale = BASE_SCALE): ActionInfo {
  const parts: string[] = [];
  const kinds: IntentKind[] = [];
  const statuses: StatusId[] = [];
  let label = '';
  for (const eff of a.effects) {
    switch (eff.type) {
      case 'attack': {
        let dmg = scaled(s.dmgMult, eff.amount) + s.strength;
        if (s.weak) dmg = Math.floor(dmg * 0.75);
        const hits = eff.hits ?? 1;
        label = hits > 1 ? `${dmg}×${hits}` : `${dmg}`;
        const notes = [eff.pierce ? 'сквозь блок' : '', eff.drain ? 'вампиризм' : ''].filter(Boolean);
        parts.push(`Атака ${label}${notes.length ? ` (${notes.join(', ')})` : ''}`);
        kinds.push('attack');
        break;
      }
      case 'block': {
        const blk = scaled(s.hpMult, eff.amount);
        if (!label) label = `${blk}`;
        parts.push(`Блок ${blk}${eff.target === 'allies' ? ' всем' : ''}`);
        kinds.push('defend');
        break;
      }
      case 'dodge':
        parts.push(`Уклонение от ${eff.value} атак(и)`);
        kinds.push('buff');
        break;
      case 'selfDestruct': {
        const dmg = scaled(s.dmgMult, eff.amount) + s.strength;
        label = `${dmg}`;
        parts.push(`Самоподрыв ${dmg}${eff.burn ? ` + Горение ${scaled(s.dmgMult, eff.burn)}` : ''}`);
        kinds.push('attack');
        if (eff.burn) {
          kinds.push('debuff');
          statuses.push('burn');
        }
        break;
      }
      case 'none':
        kinds.push('special');
        break;
      case 'buffStr':
        parts.push(
          `+${scaled(s.dmgMult, eff.amount)} к урону (${eff.target === 'self' ? 'себе' : eff.target === 'allies' ? 'всем союзникам' : 'всем: ' + def.name})`,
        );
        kinds.push('buff');
        break;
      case 'heal':
        parts.push(`Лечит ${scaled(s.hpMult, eff.amount)} (${eff.target === 'self' ? 'себя' : 'всех союзников'})`);
        kinds.push('heal');
        break;
      case 'debuff': {
        const dur = eff.turns > 0 ? ` на ${eff.turns} ход(а)` : '';
        const val = isDot(eff.status) ? ` ${scaled(s.dmgMult, eff.value)}` : '';
        parts.push(`${STATUS_NAMES[eff.status]}${val}${dur}`);
        kinds.push('debuff');
        statuses.push(eff.status);
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
        parts.push(`Шипы ${scaled(s.dmgMult, eff.amount)}`);
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
    text: parts.length ? `${a.name}: ${parts.join(', ')}` : a.name,
    detail: parts.join(', '),
    kinds: INTENT_PRIORITY.filter((k) => kinds.includes(k)),
    statuses: statuses.filter((id, i) => statuses.indexOf(id) === i),
  };
}

/**
 * Что случится, когда враг погибнет: описание его onDeath с числами под акт и статусы врага.
 * null — предсмертного эффекта нет. Питает подсказку статуса «Предсмертие».
 */
export function onDeathInfo(e: EnemyState): ActionInfo | null {
  const def = enemyDef(e.defId);
  if (!def.onDeath) return null;
  return describeAction(def, def.onDeath, { hpMult: e.hpMult, dmgMult: e.dmgMult, strength: statusValue(e, 'strength'), weak: !!getStatus(e, 'weak') });
}

export function computeIntent(e: EnemyState): IntentInfo {
  const def = enemyDef(e.defId);
  const a = enemyAction(def, e.intent);
  const info = describeAction(def, a, { hpMult: e.hpMult, dmgMult: e.dmgMult, strength: statusValue(e, 'strength'), weak: !!getStatus(e, 'weak') });
  return { ...info, stunned: !!getStatus(e, 'stun') };
}

export interface AllyIntentInfo extends IntentInfo {
  /** Кого ударит: самый раненый враг на момент расчёта; null — приём без цели. */
  target: string | null;
}

/**
 * Что союзник сделает после хода героя. Цикл детерминирован: cycleIdx и порядок действий прототипа
 * уже в состоянии. Числа без масштаба акта — союзник бьёт «родными» числами прототипа плюс Сила.
 */
export function computeAllyIntent(state: BattleState, a: AllyState): AllyIntentInfo {
  const def = enemyDef(a.defId);
  const order = def.ai.type === 'cycle' ? def.ai.order : def.actions.map((x) => x.id);
  const action = enemyAction(def, order[a.cycleIdx % order.length]);
  const parts: string[] = [];
  const kinds: IntentKind[] = [];
  let label = '';
  let target: string | null = null;
  for (const eff of action.effects) {
    switch (eff.type) {
      case 'attack': {
        let dmg = eff.amount + statusValue(a, 'strength');
        if (getStatus(a, 'weak')) dmg = Math.floor(dmg * 0.75);
        const hits = eff.hits ?? 1;
        label = hits > 1 ? `${dmg}×${hits}` : `${dmg}`;
        const victim = state.enemies.reduce<EnemyState | null>((m, e) => (!m || e.hp < m.hp ? e : m), null);
        target = victim?.name ?? null;
        parts.push(`Атака ${label}${victim ? ` по ${victim.name}` : ''}`);
        kinds.push('attack');
        break;
      }
      case 'block':
        if (!label) label = `${eff.amount}`;
        parts.push(`Блок ${eff.amount}`);
        kinds.push('defend');
        break;
      case 'buffStr':
        parts.push(`+${eff.amount} к урону (${eff.target === 'self' ? 'себе' : 'союзникам'})`);
        kinds.push('buff');
        break;
      case 'heal':
        parts.push(`Лечит ${eff.amount}`);
        kinds.push('heal');
        break;
      default:
        kinds.push('special');
    }
  }
  const kind = INTENT_PRIORITY.find((k) => kinds.includes(k)) ?? 'special';
  return {
    kind,
    icon: INTENT_ICON[kind],
    label: kind === 'attack' || kind === 'defend' ? label : '',
    name: action.name,
    text: parts.length ? `${action.name}: ${parts.join(', ')}` : action.name,
    detail: parts.join(', '),
    kinds: INTENT_PRIORITY.filter((k) => kinds.includes(k)),
    statuses: [],
    stunned: false,
    target,
  };
}
