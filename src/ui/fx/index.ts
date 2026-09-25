import type { BattleEvent, Effect, EventTarget, FxKind, FxSpec, PlayerAction, RunState, SculptId, StatusId } from '../../engine/types';
import { artifactDef } from '../../data/artifacts';
import { potionDef } from '../../data/potions';
import { enemyDef } from '../../data/enemies';
import { heroDef } from '../../data/heroes';
import { weaponBase } from '../../data/gear';
import { drawGrid } from '../sprites';
import type { HeroClip } from '../heroSprite';
import { STATUS_COLORS } from '../icons';
import { echoesEffect, interceptor } from '../../engine/combat';
import { pxLayer } from './layer';
import { platesGain } from './plates';
import { roar } from './cry';
import { slash, STEEL_EDGE } from './strike';
import { arrow, bolt, BOLT_MS, fireball, flask, iceShard, orb, stone } from './shots';
import { bleed, burn, cold, heal, poison, stun } from './status';

/**
 * Анимации боя. Под приём подставляется семейство, а не свой рисунок: взмах клинком по цели (оружие и приёмы ближнего
 * боя), стрела (дальнее оружие), снаряд заклинания (огненный шар, лёд, молния, камень пращи или сгусток цвета приёма),
 * склянка (зелья и Флакон яда); на бойце — рисунок статуса, латы блока, лечение, свечение бафа, облако дебафа.
 * Снаряды летят по старому полю до перерисовки: App ждёт `impact` мс, потом рисует новое состояние и всплывающие числа;
 * слой `.fx-layer` при перерисовке переезжает в новое дерево, так что взрыв шара и брызги склянки доигрываются в нём.
 * Эффекты на бойце выводятся после перерисовки. Враги с `fx` у приёма получают снаряды и след удара на жертве;
 * остальные используют свой клип лепки или наскок.
 *
 * Эффекты — пиксельная лепка (docs/lepka.md, «Лепка эффектов»): холст в сетке 2 px поверх поля (layer.ts), кадры
 * из движка врагов (bake.ts). Латы блока — plates.ts, рёв Боевого клича — cry.ts, мазок клинка — strike.ts, снаряды —
 * shots.ts, статусы на цели и лечение — status.ts. Типовыми (DOM) здесь остались свечение бафов, облако прочих
 * дебафов, глоток зелья и вспышка второй фазы босса.
 */

// ─── План ────────────────────────────────────────────────────────────────────

/** Один снаряд или взмах: кто, в кого, каким и с какой задержкой от начала розыгрыша. */
export interface Shot {
  kind: FxKind;
  /** Цвет снаряда, склянки или кромки мазка. */
  color: string;
  /** Цвет оружия: у героя — клинок с его спрайта, у врага — цвет `fx` приёма (кромка следа его удара). */
  blade: string;
  from: EventTarget;
  to: EventTarget;
  delay: number;
  /** Сколько летит до попадания, мс (у молнии — почти сразу). */
  flight: number;
  /** Лепка снаряда из `fx.sculpt`: огненный шар, лёд, молния, камень; без неё — по роду `kind`. */
  sculpt?: SculptId;
}

/**
 * Эффект на бойце после перерисовки: свечение (баф), облако (дебаф), латы (блок), глоток зелья, вспышка второй фазы
 * босса или эффект лепки приёма (`sculpt`).
 */
export interface AfterFx {
  kind: 'glow' | 'cloud' | 'drink' | 'shield' | 'burst' | 'sculpt' | 'status' | 'heal';
  color: string;
  target: EventTarget;
  sculpt?: SculptId;
  /** Статус с рисунком лепки (`kind: 'status'`): кровь, горение, оглушение, холод, яд. */
  status?: StatusId;
}

export interface FxPlan {
  /** До перерисовки, на старом поле. */
  shots: Shot[];
  /** Через сколько мс снаряды попадают — тогда перерисовка и всплывающие числа. 0 — сразу. */
  impact: number;
  /** После перерисовки: приёмы без снаряда (Боевой клич, зелье на себя). */
  after: AfterFx[];
  /** Бойцы, чей наскок уже сыгран вместе с ударом или заменён снарядом — класс acting им не ставить. */
  lunged: Set<EventTarget>;
  /** У героя играет нарисованный клип приёма: наскок ему не нужен, движение уже в анимации. */
  clipped?: boolean;
}

/** Время полёта снаряда или взмаха до попадания, мс. */
const FLIGHT: Record<FxKind, number> = { melee: 260, arrow: 260, orb: 330, flask: 440 };
/** Задержка между снарядами по нескольким целям. */
const STAGGER = 70;
/** Шаг между ударами многоударного приёма: каждый удар — свой взмах или наскок и своя цифра (app.ts: playEvents). */
export const HIT_GAP = 200;
const DEFAULT_BLADE = '#dcdcdc';
const SHIELD = '#8ecae6';
const HEAL = '#80ed99';

/** Дебафы без своего рисунка ложатся облаком, остальные статусы — свечением. */
const DEBUFFS = new Set<StatusId>(['weak', 'exhaust', 'vulnerable']);

/** Статусы со своим рисунком лепки (status.ts): играют у всех, у рядовых тоже. */
const STATUS_FX: Partial<Record<StatusId, (root: HTMLElement, target: EventTarget) => void>> = {
  bleed: (root, t) => withLayer(root, (L) => bleed(L, t)),
  burn: (root, t) => withLayer(root, (L) => burn(L, t)),
  stun: (root, t) => withLayer(root, (L) => stun(L, t)),
  cold: (root, t) => withLayer(root, (L) => cold(L, t)),
  frozen: (root, t) => withLayer(root, (L) => cold(L, t)),
  poison: (root, t) => withLayer(root, (L) => poison(L, t)),
};

function withLayer(root: HTMLElement, fn: (L: NonNullable<ReturnType<typeof pxLayer>>) => void): void {
  const L = pxLayer(root);
  if (L) fn(L);
}

function emptyPlan(): FxPlan {
  return { shots: [], impact: 0, after: [], lunged: new Set() };
}

/** Время до попадания: по роду снаряда, у молнии — почти сразу. */
const flightOf = (kind: FxKind, sculpt?: SculptId): number => (sculpt === 'bolt' ? BOLT_MS : FLIGHT[kind]);

function addShots(plan: FxPlan, kind: FxKind, color: string, blade: string, from: EventTarget, targets: EventTarget[], offset = 0, sculpt?: SculptId): void {
  const flight = flightOf(kind, sculpt);
  targets.forEach((to, i) => {
    plan.shots.push({ kind, color, blade, from, to, delay: offset + i * STAGGER, flight, ...(sculpt ? { sculpt } : {}) });
    plan.impact = Math.max(plan.impact, offset + i * STAGGER + flight);
  });
  if (targets.length) plan.lunged.add(from);
}

/** Повторный наскок бойца — на каждый удар многоударного приёма после первого. */
export function lungeAgain(root: HTMLElement, t: EventTarget): void {
  restart(zone(root, t), 'acting');
}

/** Снаряд оружия героя: ближнее — взмах, дальнее — стрела, магическое — шар; праща кидает камень через `fx` базы. */
function weaponShot(run: RunState): { kind: FxKind; color: string; sculpt?: SculptId } {
  const base = weaponBase(run.hero.weapon);
  const type = base.type ?? 'melee';
  const kind = base.fx?.kind ?? (type === 'ranged' ? 'arrow' : type === 'magic' ? 'orb' : 'melee');
  const color = base.fx?.color ?? (kind === 'melee' ? '#ffffff' : kind === 'arrow' ? '#e9c46a' : '#b388ff');
  return { kind, color, ...(base.fx?.sculpt ? { sculpt: base.fx.sculpt } : {}) };
}

/**
 * Анимация по списку эффектов приёма: есть эффект по врагам — снаряд по ним (род из `fx`, иначе атака — оружием,
 * заклинание — шаром; один статус без урона летит только если `fx` задан, иначе хватит облака из события);
 * только на себя — свечение героя, у зелья — глоток. `echo` — на герое висит «Эхо удара»: движок повторит все удары приёма.
 */
function planEffects(
  plan: FxPlan,
  effects: Effect[],
  fx: FxSpec | undefined,
  weapon: { kind: FxKind; color: string; sculpt?: SculptId },
  blade: string,
  target: number | undefined,
  all: number[],
  selfColor: string,
  potion: boolean,
  echo = false,
): void {
  const hostile = effects.find(
    (e) => (e.type === 'attack' || e.type === 'blockStrike' || e.type === 'spell' || e.type === 'status' || e.type === 'pull' || e.type === 'push' || e.type === 'detonate' || e.type === 'spread' || e.type === 'breakBlock' || e.type === 'finisher' || e.type === 'chain' || e.type === 'scorch') && e.target !== 'self',
  );
  if (!hostile || !('target' in hostile)) {
    // Приём на себя с лепкой (Боевой клич — рёв) рисует её вместо свечения.
    if (fx?.sculpt && !potion) {
      plan.after.push({ kind: 'sculpt', sculpt: fx.sculpt, color: fx.color ?? selfColor, target: 'hero' });
      return;
    }
    // Приём на себя: зелье — глоток, блок — латы по силуэту героя, лечение — круг и искры, остальное — свечение.
    const kind = potion ? 'drink' : effects.some((e) => e.type === 'block') ? 'shield' : effects.some((e) => e.type === 'heal') ? 'heal' : 'glow';
    const color = kind === 'shield' ? (fx?.color ?? SHIELD) : kind === 'heal' ? (fx?.color ?? HEAL) : (fx?.color ?? selfColor);
    plan.after.push({ kind, color, target: 'hero' });
    return;
  }
  const targets = hostile.target === 'allEnemies' ? all : target !== undefined && all.includes(target) ? [target] : all.slice(0, 1);
  let kind = fx?.kind;
  let color = fx?.color;
  let sculpt = fx?.sculpt;
  if (!kind) {
    if (effects.some((e) => e.type === 'attack' || e.type === 'blockStrike' || e.type === 'breakBlock' || e.type === 'finisher' || e.type === 'chain')) {
      kind = weapon.kind;
      color ??= weapon.color;
      sculpt ??= weapon.sculpt;
    } else if (effects.some((e) => e.type === 'spell' || e.type === 'detonate' || e.type === 'scorch')) {
      kind = 'orb';
      color ??= '#b388ff';
    } else return;
  }
  // Сколько раз приём бьёт: у Двойного выпада два удара своими эффектами, «Эхо удара» повторяет все бьющие оружием ещё раз
  // (тот же список, что в движке, — Финишер и Таран с v0.40.4 тоже). Каждый удар — свой взмах с шагом HIT_GAP, как у элиты (v0.40.2).
  const hits = effects.filter((e) => echoesEffect(e.type)).length;
  addSwings(plan, kind, color ?? DEFAULT_BLADE, blade, targets, Math.max(1, hits * (echo && hits > 0 ? 2 : 1)), sculpt);
  // Цепная молния бьёт по ряду цепью: каждая следующая дуга — от прошлой цели, а не от героя.
  if (sculpt === 'bolt') plan.shots.forEach((sh, i) => { if (i > 0) sh.from = plan.shots[i - 1].to; });
}

/**
 * Несколько взмахов подряд по тем же целям. Перерисовка — по первому удару (`impact`): остальные снаряды доигрываются
 * в перенесённом слое `.fx-layer`, а цифры подтягивает playEvents с тем же шагом HIT_GAP — взмах и число сходятся.
 */
function addSwings(plan: FxPlan, kind: FxKind, color: string, blade: string, targets: EventTarget[], swings: number, sculpt?: SculptId): void {
  for (let i = 0; i < swings; i++) addShots(plan, kind, color, blade, 'hero', targets, i * HIT_GAP, sculpt);
  if (swings > 1) plan.impact = flightOf(kind, sculpt);
}

/** План анимации действия героя. Считается до применения действия: цели ещё живы, зелье ещё в слоте. */
export function planHeroFx(run: RunState, action: PlayerAction): FxPlan {
  const plan = emptyPlan();
  const b = run.battle;
  if (!b) return plan;
  const hero = heroDef(run.hero.defId);
  const blade = (hero.sprite.type === 'humanoid' && hero.sprite.palette.w) || DEFAULT_BLADE;
  const all = b.enemies.map((e) => e.uid);
  const weapon = weaponShot(run);
  // «Эхо удара» повторит атаку ещё раз — значит, и взмахов будет два.
  const echo = b.hero.statuses.some((st) => st.id === 'echo');
  // Страж заслоняет того, кто за ним: удар, как и в движке, летит в стража.
  const guard = interceptor(b, action);
  if (guard && (action.type === 'attack' || action.type === 'artifact')) action = { ...action, target: guard.uid };
  if (action.type === 'attack') {
    // Плеть хлещет весь ряд: взмах по каждому врагу.
    addSwings(plan, weapon.kind, weapon.color, blade, b.hero.stats.sweep > 0 ? all : [action.target], echo ? 2 : 1, weapon.sculpt);
  } else if (action.type === 'artifact') {
    const def = artifactDef(action.artifactId);
    const inst = b.hero.artifacts.find((a) => a.id === def.id);
    const effects = def.effects?.(inst?.tier ?? 1) ?? [];
    planEffects(plan, effects, def.fx, weapon, blade, action.target, all, def.school === 'magic' ? '#b388ff' : '#ffd166', false, echo);
  } else if (action.type === 'potion' && b.hero.potion) {
    const def = potionDef(b.hero.potion);
    planEffects(plan, def.effects, { kind: 'flask', ...def.fx }, weapon, blade, action.target, all, '#ffffff', true);
  }
  return plan;
}

/**
 * Приём с `fx` летит в жертву (первый союзник, иначе герой), независимо от ранга врага.
 */
export function planEnemyFx(run: RunState, events: BattleEvent[], victim: EventTarget): FxPlan {
  const plan = emptyPlan();
  const b = run.battle;
  if (!b) return plan;
  for (const ev of events) {
    if (ev.type !== 'enemyAction') continue;
    const e = b.enemies.find((x) => x.uid === ev.target);
    if (!e) continue;
    const def = enemyDef(e.defId);
    const action = def.actions.find((a) => a.name === ev.name);
    const fx = action?.fx;
    if (!action || !fx?.kind) continue;
    const blade = fx.color ?? DEFAULT_BLADE;
    // Многоударный приём — столько же взмахов с шагом HIT_GAP; перерисовка и первая цифра — по первому удару,
    // остальные цифры подтягивает playEvents с тем же шагом.
    const hits = Math.max(1, ...action.effects.map((x) => (x.type === 'attack' ? (x.hits ?? 1) : 1)));
    for (let i = 0; i < hits; i++) addShots(plan, fx.kind, fx.kind === 'melee' ? '#ffffff' : blade, blade, e.uid, [victim], i * HIT_GAP, fx.sculpt);
    if (hits > 1) plan.impact = flightOf(fx.kind, fx.sculpt);
  }
  return plan;
}

/** Снаряды рисованного врага стартуют после замаха; цифры урона ждут первого попадания. */
export function delayEnemyShots(plan: FxPlan, target: EventTarget, windup: number): void {
  const shots = plan.shots.filter((s) => s.from === target);
  if (!shots.length) return;
  for (const shot of shots) shot.delay += windup;
  plan.impact = Math.max(plan.impact, Math.min(...shots.map((s) => s.delay + s.flight)));
}

/**
 * Эффект по событию боя: статус со своим рисунком — лепкой (кровь, горение, оглушение, холод, яд), прочий дебаф —
 * облаком, баф — свечением; блок — латы по силуэту бойца; лечение — круг света и искры.
 */
export function eventFx(ev: BattleEvent): { kind: AfterFx['kind']; color: string; status?: StatusId } | null {
  switch (ev.type) {
    case 'status':
      // Оцепенение — тот же иней, что Холод: переход «холод → оцепенение» одним ударом рисуется один раз.
      if (STATUS_FX[ev.status]) return { kind: 'status', color: STATUS_COLORS[ev.status], status: ev.status === 'frozen' ? 'cold' : ev.status };
      return { kind: DEBUFFS.has(ev.status) ? 'cloud' : 'glow', color: STATUS_COLORS[ev.status] };
    case 'block':
      return { kind: 'shield', color: SHIELD };
    case 'heal':
      return { kind: 'heal', color: HEAL };
    default:
      return null;
  }
}

// ─── Спрайты ─────────────────────────────────────────────────────────────────

const cache = new Map<string, string>();

function hex(c: string): [number, number, number] {
  const n = parseInt(c.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Смешать цвет с другим: t 0 — исходный, 1 — целевой. */
function mix(c: string, to: string, t: number): string {
  const a = hex(c);
  const b = hex(to);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

function gridUrl(key: string, rows: string[], palette: Record<string, string>): string {
  const hit = cache.get(key);
  if (hit) return hit;
  const url = drawGrid(rows[0].length, rows.length, (x, y) => {
    const ch = rows[y][x];
    return ch === '.' ? null : (palette[ch] ?? null);
  });
  cache.set(key, url);
  return url;
}

function img(url: string, w: number, h: number, scale: number): HTMLImageElement {
  const el = document.createElement('img');
  el.src = url;
  el.width = w * scale;
  el.height = h * scale;
  el.className = 'fx';
  el.draggable = false;
  el.alt = '';
  return el;
}

const OUTLINE = '#1b1b2a';

/** Склянка 7×9: пробка, горлышко, стекло, жидкость цветом. */
const FLASK = ['..ooo..', '..oco..', '..oGo..', '.oGGGo.', 'oGLLLGo', 'oLLLLLo', 'oLLLLLo', '.oLLLo.', '..ooo..'];
function flaskImg(color: string): HTMLImageElement {
  return img(gridUrl(`flask:${color}`, FLASK, { o: OUTLINE, c: '#8a6b3f', G: '#cfe8ff', L: color }), 7, 9, 4);
}

/** Клуб облака 9×9 без контура, два тона. */
const PUFF = ['...ccc...', '.ccccccc.', '.ccCCCcc.', 'ccCCCCCcc', 'ccCCCCCcc', 'ccCCCCCcc', '.ccCCCcc.', '.ccccccc.', '...ccc...'];
function puffImg(color: string): HTMLImageElement {
  return img(gridUrl(`puff:${color}`, PUFF, { c: color, C: mix(color, '#ffffff', 0.35) }), 9, 9, 4);
}

const SPARK = ['.W.', 'WWW', '.W.'];
function sparkImg(color: string): HTMLImageElement {
  return img(gridUrl(`spark:${color}`, SPARK, { W: mix(color, '#ffffff', 0.4) }), 3, 3, 3);
}

// ─── Розыгрыш ────────────────────────────────────────────────────────────────

interface Pt {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Спрайт бойца. Именно из .sprite-wrap: у иконок статусов над головой тот же класс sprite. */
function spriteOf(root: HTMLElement, t: EventTarget): HTMLElement | null {
  return root.querySelector<HTMLElement>(t === 'hero' ? '.hero-zone .sprite-wrap .sprite' : `[data-uid="${t}"] .sprite-wrap .sprite`);
}

/** Центр спрайта бойца в координатах слоя эффектов (кадр масштабируется целиком — делим на масштаб). */
function anchor(root: HTMLElement, layer: HTMLElement, t: EventTarget): Pt | null {
  const el = spriteOf(root, t);
  if (!el) return null;
  const lr = layer.getBoundingClientRect();
  const k = lr.width / (layer.offsetWidth || 1) || 1;
  const r = el.getBoundingClientRect();
  return { x: (r.left - lr.left + r.width / 2) / k, y: (r.top - lr.top + r.height / 2) / k, w: r.width / k, h: r.height / k };
}

function zone(root: HTMLElement, t: EventTarget): HTMLElement | null {
  return root.querySelector<HTMLElement>(t === 'hero' ? '.hero-zone' : `[data-uid="${t}"]`);
}

/** Перезапустить CSS-анимацию класса, даже если класс уже стоит. */
function restart(el: HTMLElement | null, cls: string): void {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

const noop = (): void => {};

/** Анимация с закреплёнными крайними кадрами: с задержкой элемент ждёт в первом кадре, а не в углу слоя. */
function animate(el: HTMLElement, frames: Keyframe[], opts: KeyframeAnimationOptions, done?: () => void): void {
  const a = el.animate(frames, { fill: 'both', ...opts });
  a.finished.then(() => done?.(), noop);
}

/**
 * Клип героя под его приём. Клипы названы по роли, а не по рисунку: `attack` — обычная атака оружием,
 * `heavy` — приём в упор, `power` — заклинание или бросок, `heal` — приём, который лечит, `block` — защита.
 * Чего у героя не нарисовано, то подменяется по цепочке (heroSprite.ts), так что решение одно на всех.
 */
export function heroClip(plan: FxPlan, action: PlayerAction): HeroClip | null {
  if (action.type === 'defend') return 'block'; // «Защититься» до плана не доходит: щит ему рисует событие блока
  if (action.type === 'attack') return 'attack';
  // Лечащий приём узнаём по эффектам (тир на род не влияет); у зелья лечение видно по глотку ниже.
  if (action.type === 'artifact' && (artifactDef(action.artifactId).effects?.(1) ?? []).some((e) => e.type === 'heal')) return 'heal';
  const shot = plan.shots.find((s) => s.from === 'hero');
  if (shot) return shot.kind === 'melee' ? 'heavy' : 'power';
  if (plan.after.some((a) => a.target === 'hero' && a.kind === 'shield')) return 'block';
  if (plan.after.some((a) => a.target === 'hero' && (a.kind === 'drink' || a.kind === 'heal'))) return 'heal';
  return null;
}

export function playShots(root: HTMLElement, plan: FxPlan): number {
  const L = pxLayer(root);
  if (!L || plan.shots.length === 0) return 0;
  const lunged = new Set<EventTarget>(plan.clipped ? ['hero' as EventTarget] : []);
  for (const s of plan.shots) {
    // Наскок — у героя и союзников при ударе вплотную; враг-лепка замахивается своим клипом, ему наскок не нужен.
    if (s.kind === 'melee' && !lunged.has(s.from)) {
      lunged.add(s.from);
      const z = zone(root, s.from);
      if (s.from === 'hero' || !z?.querySelector('.mob-sheet')) restart(z, 'acting');
    }
    shoot(L, s);
  }
  return plan.impact;
}

/**
 * Снаряд или взмах лепкой (strike.ts, shots.ts): вылет через `delay`, попадание через `flight` после него — туда же,
 * куда App ставит перерисовку и цифры. Взмах врага — след удара на жертве кромкой цвета его оружия.
 */
function shoot(L: NonNullable<ReturnType<typeof pxLayer>>, s: Shot): void {
  const hit = s.delay + s.flight;
  switch (s.kind) {
    case 'melee': {
      const edge = s.color !== '#ffffff' ? s.color : s.from === 'hero' ? STEEL_EDGE : s.blade;
      slash(L, s.from, s.to, edge, hit);
      break;
    }
    case 'arrow':
      arrow(L, s.from, s.to, s.color, s.delay, s.flight);
      break;
    case 'flask':
      flask(L, s.from, s.to, s.color, s.delay, s.flight);
      break;
    case 'orb':
      if (s.sculpt === 'fire') fireball(L, s.from, s.to, s.delay, s.flight);
      else if (s.sculpt === 'ice') iceShard(L, s.from, s.to, s.delay, s.flight);
      else if (s.sculpt === 'bolt') bolt(L, s.from, s.to, s.delay, s.color);
      else if (s.sculpt === 'stone') stone(L, s.from, s.to, s.delay, s.flight);
      else orb(L, s.from, s.to, s.color, s.delay, s.flight);
      break;
  }
}

/** Облако из клубов внутри спрайта: расползаются вверх и тают. Разброс детерминирован номером клуба. */
function cloud(layer: HTMLElement, p: Pt, color: string, n = 5): void {
  for (let i = 0; i < n; i++) {
    const puff = puffImg(color);
    const ox = (((i * 37) % 23) - 11) / 11 * p.w * 0.3;
    const oy = (((i * 53) % 17) - 8) / 8 * p.h * 0.25;
    const x = p.x + ox - puff.width / 2;
    const y = p.y + oy - puff.height / 2 + 8;
    layer.appendChild(puff);
    animate(puff, [
      { transform: `translate(${x}px, ${y}px) scale(0.4)`, opacity: 0 },
      { transform: `translate(${x}px, ${y - 10}px) scale(1)`, opacity: 0.8, offset: 0.3 },
      { transform: `translate(${x}px, ${y - 30}px) scale(1.25)`, opacity: 0 },
    ], { duration: 700, delay: i * 70, easing: 'ease-out' }, () => puff.remove());
  }
}

/** Свечение бойца: спрайт вспыхивает ореолом цвета бафа, вокруг поднимаются искры. */
function glow(root: HTMLElement, layer: HTMLElement, t: EventTarget, color: string): void {
  const sprite = spriteOf(root, t);
  const p = anchor(root, layer, t);
  if (!sprite || !p) return;
  sprite.animate(
    [
      { filter: 'drop-shadow(0 0 0 transparent) brightness(1)' },
      { filter: `drop-shadow(0 0 10px ${color}) brightness(1.8)`, offset: 0.35 },
      { filter: 'drop-shadow(0 0 0 transparent) brightness(1)' },
    ],
    { duration: 650, easing: 'ease-out' },
  );
  for (let i = 0; i < 4; i++) {
    const spark = sparkImg(color);
    const x = p.x + (i - 1.5) * p.w * 0.28 - spark.width / 2;
    const y = p.y + p.h * 0.3 - (i % 2) * p.h * 0.25;
    layer.appendChild(spark);
    animate(spark, [
      { transform: `translate(${x}px, ${y}px)`, opacity: 0 },
      { transform: `translate(${x}px, ${y - 14}px)`, opacity: 1, offset: 0.3 },
      { transform: `translate(${x}px, ${y - 44}px)`, opacity: 0 },
    ], { duration: 600, delay: i * 60, easing: 'ease-out' }, () => spark.remove());
  }
}

/** Глоток: склянка появляется у лица героя, наклоняется и исчезает, герой светится её цветом. */
function drink(root: HTMLElement, layer: HTMLElement, color: string): void {
  const p = anchor(root, layer, 'hero');
  if (!p) return;
  const flask = flaskImg(color);
  flask.style.transformOrigin = '20% 90%';
  const x = p.x + p.w * 0.2;
  const y = p.y - p.h * 0.35 - flask.height;
  layer.appendChild(flask);
  animate(flask, [
    { transform: `translate(${x}px, ${y + 10}px) rotate(0deg)`, opacity: 0 },
    { transform: `translate(${x}px, ${y}px) rotate(0deg)`, opacity: 1, offset: 0.3 },
    { transform: `translate(${x}px, ${y}px) rotate(-70deg)`, opacity: 1, offset: 0.75 },
    { transform: `translate(${x}px, ${y}px) rotate(-70deg)`, opacity: 0 },
  ], { duration: 500, easing: 'ease-out' }, () => flask.remove());
  window.setTimeout(() => glow(root, layer, 'hero', color), 300);
}

/**
 * Вторая фаза босса: приглушённая вспышка — спрайт темнеет и вспыхивает цветом ауры, от него расходится кольцо,
 * поднимается тёмное облако и искры. Дальше ауру держит CSS (`.enemy.aura`), здесь только момент перехода.
 */
function phaseBurst(root: HTMLElement, layer: HTMLElement, t: EventTarget, color: string): void {
  const sprite = spriteOf(root, t);
  const p = anchor(root, layer, t);
  if (!sprite || !p) return;
  sprite.animate(
    [
      { filter: 'brightness(1) drop-shadow(0 0 0 transparent)', transform: 'scale(1)' },
      { filter: 'brightness(0.2)', transform: 'scale(0.94)', offset: 0.3 },
      { filter: `brightness(2.2) drop-shadow(0 0 16px ${color})`, transform: 'scale(1.1)', offset: 0.5 },
      { filter: 'brightness(1) drop-shadow(0 0 0 transparent)', transform: 'scale(1)' },
    ],
    { duration: 900, easing: 'ease-in-out' },
  );
  const ring = document.createElement('div');
  ring.className = 'fx fx-ring';
  ring.style.borderColor = color;
  ring.style.width = ring.style.height = `${Math.round(p.w * 0.6)}px`;
  layer.appendChild(ring);
  const cx = p.x - p.w * 0.3;
  const cy = p.y - p.w * 0.3;
  animate(ring, [
    { transform: `translate(${cx}px, ${cy}px) scale(0.3)`, opacity: 0 },
    { transform: `translate(${cx}px, ${cy}px) scale(1)`, opacity: 0.8, offset: 0.2 },
    { transform: `translate(${cx}px, ${cy}px) scale(2.6)`, opacity: 0 },
  ], { duration: 800, delay: 250, easing: 'ease-out' }, () => ring.remove());
  window.setTimeout(() => cloud(layer, p, mix(color, '#000000', 0.5), 7), 300);
  for (let i = 0; i < 6; i++) {
    const spark = sparkImg(color);
    const ang = (i / 6) * Math.PI * 2;
    const x = p.x - spark.width / 2;
    const y = p.y - spark.height / 2;
    const dx = Math.cos(ang) * p.w * 0.9;
    const dy = Math.sin(ang) * p.h * 0.7;
    layer.appendChild(spark);
    animate(spark, [
      { transform: `translate(${x}px, ${y}px)`, opacity: 0 },
      { transform: `translate(${x + dx * 0.3}px, ${y + dy * 0.3}px)`, opacity: 1, offset: 0.3 },
      { transform: `translate(${x + dx}px, ${y + dy}px)`, opacity: 0 },
    ], { duration: 700, delay: 400 + i * 30, easing: 'ease-out' }, () => spark.remove());
  }
}

/** Эффекты лепки приёмов по `FxSpec.sculpt`: рисуют себя в слое лепки поля. */
const SCULPTS: Partial<Record<SculptId, (root: HTMLElement, target: EventTarget) => void>> = {
  roar: (root, target) => withLayer(root, (L) => roar(L, target)),
};

/** Эффект на бойце после перерисовки: облако, свечение, латы блока, глоток, вспышка фазы или лепка приёма. */
export function playAfter(root: HTMLElement, fx: AfterFx): void {
  const layer = root.querySelector<HTMLElement>('.fx-layer');
  if (!layer) return;
  if (fx.kind === 'glow') glow(root, layer, fx.target, fx.color);
  else if (fx.kind === 'shield') platesGain(root, fx.target);
  else if (fx.kind === 'sculpt') {
    if (fx.sculpt) SCULPTS[fx.sculpt]?.(root, fx.target);
  } else if (fx.kind === 'status') {
    if (fx.status) STATUS_FX[fx.status]?.(root, fx.target);
  } else if (fx.kind === 'heal') withLayer(root, (L) => heal(L, fx.target, fx.color));
  else if (fx.kind === 'burst') phaseBurst(root, layer, fx.target, fx.color);
  else if (fx.kind === 'drink') drink(root, layer, fx.color);
  else {
    const p = anchor(root, layer, fx.target);
    if (p) cloud(layer, p, fx.color);
  }
}
