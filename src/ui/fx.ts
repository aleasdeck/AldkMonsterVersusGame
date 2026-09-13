import type { BattleEvent, Effect, EventTarget, FxKind, FxSpec, PlayerAction, RunState, StatusId } from '../engine/types';
import { artifactDef } from '../data/artifacts';
import { potionDef } from '../data/potions';
import { enemyDef } from '../data/enemies';
import { heroDef } from '../data/heroes';
import { weaponBase } from '../data/gear';
import { drawGrid } from './sprites';
import { STATUS_COLORS } from './icons';

/**
 * Типовые анимации боя. Их пять, под каждый приём подставляется одна и меняется только цвет:
 * взмах клинком по цели (оружие и приёмы ближнего боя), стрела (дальнее оружие), магический снаряд
 * (заклинания и магическое оружие), склянка (зелья и Флакон яда), облако на цели (дебаф) и свечение бойца (баф).
 * Снаряды летят по старому полю до перерисовки: App ждёт `impact` мс, потом рисует новое состояние и всплывающие числа;
 * слой `.fx-layer` при перерисовке переезжает в новое дерево, так что взрыв шара и облако склянки доигрываются в нём.
 * Облако и свечение выводятся из событий боя уже после перерисовки. Рядовые враги анимаций не имеют — только наскок;
 * элита и боссы получают снаряды и взмахи через `fx` своих приёмов.
 */

// ─── План ────────────────────────────────────────────────────────────────────

/** Один снаряд или взмах: кто, в кого, каким и с какой задержкой от начала розыгрыша. */
export interface Shot {
  kind: FxKind;
  /** Цвет снаряда, склянки или росчерка удара. */
  color: string;
  /** Цвет клинка при взмахе: у героя — оружие с его спрайта. */
  blade: string;
  from: EventTarget;
  to: EventTarget;
  delay: number;
}

/** Эффект на бойце после перерисовки: свечение (баф), облако (дебаф), щит (блок) или глоток зелья. */
export interface AfterFx {
  kind: 'glow' | 'cloud' | 'drink' | 'shield';
  color: string;
  target: EventTarget;
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
}

/** Время полёта снаряда или взмаха до попадания, мс. */
const FLIGHT: Record<FxKind, number> = { melee: 260, arrow: 260, orb: 330, flask: 440 };
/** Задержка между снарядами по нескольким целям. */
const STAGGER = 70;
const DEFAULT_BLADE = '#dcdcdc';
const SHIELD = '#8ecae6';
const HEAL = '#80ed99';

/** Дебафы ложатся облаком, остальные статусы — свечением. */
const DEBUFFS = new Set<StatusId>(['weak', 'bleed', 'burn', 'stun', 'exhaust', 'poison', 'vulnerable']);

function emptyPlan(): FxPlan {
  return { shots: [], impact: 0, after: [], lunged: new Set() };
}

function addShots(plan: FxPlan, kind: FxKind, color: string, blade: string, from: EventTarget, targets: EventTarget[]): void {
  targets.forEach((to, i) => {
    plan.shots.push({ kind, color, blade, from, to, delay: i * STAGGER });
    plan.impact = Math.max(plan.impact, i * STAGGER + FLIGHT[kind]);
  });
  if (targets.length) plan.lunged.add(from);
}

/** Снаряд оружия героя: ближнее — взмах, дальнее — стрела, магическое — шар; праща кидает камень через `fx` базы. */
function weaponShot(run: RunState): { kind: FxKind; color: string } {
  const base = weaponBase(run.hero.weapon);
  const type = base.type ?? 'melee';
  const kind = base.fx?.kind ?? (type === 'ranged' ? 'arrow' : type === 'magic' ? 'orb' : 'melee');
  const color = base.fx?.color ?? (kind === 'melee' ? '#ffffff' : kind === 'arrow' ? '#e9c46a' : '#b388ff');
  return { kind, color };
}

/**
 * Анимация по списку эффектов приёма: есть эффект по врагам — снаряд по ним (род из `fx`, иначе атака — оружием,
 * заклинание — шаром; один статус без урона летит только если `fx` задан, иначе хватит облака из события);
 * только на себя — свечение героя, у зелья — глоток.
 */
function planEffects(
  plan: FxPlan,
  effects: Effect[],
  fx: FxSpec | undefined,
  weapon: { kind: FxKind; color: string },
  blade: string,
  target: number | undefined,
  all: number[],
  selfColor: string,
  potion: boolean,
): void {
  const hostile = effects.find((e) => (e.type === 'attack' || e.type === 'blockStrike' || e.type === 'spell' || e.type === 'status' || e.type === 'pull') && e.target !== 'self');
  if (!hostile || !('target' in hostile)) {
    // Приём на себя: зелье — глоток, блок — щит перед героем, остальное — свечение.
    const kind = potion ? 'drink' : effects.some((e) => e.type === 'block') ? 'shield' : 'glow';
    plan.after.push({ kind, color: kind === 'shield' ? (fx?.color ?? SHIELD) : (fx?.color ?? selfColor), target: 'hero' });
    return;
  }
  const targets = hostile.target === 'allEnemies' ? all : target !== undefined && all.includes(target) ? [target] : all.slice(0, 1);
  let kind = fx?.kind;
  let color = fx?.color;
  if (!kind) {
    if (effects.some((e) => e.type === 'attack' || e.type === 'blockStrike')) {
      kind = weapon.kind;
      color ??= weapon.color;
    } else if (effects.some((e) => e.type === 'spell')) {
      kind = 'orb';
      color ??= '#b388ff';
    } else return;
  }
  addShots(plan, kind, color ?? DEFAULT_BLADE, blade, 'hero', targets);
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
  if (action.type === 'attack') {
    // Плеть хлещет весь ряд: взмах по каждому врагу.
    addShots(plan, weapon.kind, weapon.color, blade, 'hero', b.hero.stats.sweep > 0 ? all : [action.target]);
  } else if (action.type === 'artifact') {
    const def = artifactDef(action.artifactId);
    const inst = b.hero.artifacts.find((a) => a.id === def.id);
    const effects = def.effects?.(inst?.tier ?? 1) ?? [];
    planEffects(plan, effects, def.fx, weapon, blade, action.target, all, def.school === 'magic' ? '#b388ff' : '#ffd166', false);
  } else if (action.type === 'potion' && b.hero.potion) {
    const def = potionDef(b.hero.potion);
    planEffects(plan, def.effects, { kind: 'flask', ...def.fx }, weapon, blade, action.target, all, '#ffffff', true);
  }
  return plan;
}

/**
 * План анимации шага врагов: приём элиты или босса с `fx` летит в жертву (первый союзник, иначе герой),
 * наскок ему не нужен. Рядовые враги и приёмы без `fx` — наскок как раньше.
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
    if (def.rank === 'normal') continue;
    const fx = def.actions.find((a) => a.name === ev.name)?.fx;
    if (!fx?.kind) continue;
    const blade = fx.color ?? DEFAULT_BLADE;
    addShots(plan, fx.kind, fx.kind === 'melee' ? '#ffffff' : blade, blade, e.uid, [victim]);
  }
  return plan;
}

/** Облако, свечение или щит по событию боя: статус по своему цвету, блок — щит перед бойцом, лечение — зелёное свечение. */
export function eventFx(ev: BattleEvent): { kind: 'glow' | 'cloud' | 'shield'; color: string } | null {
  switch (ev.type) {
    case 'status':
      return { kind: DEBUFFS.has(ev.status) ? 'cloud' : 'glow', color: STATUS_COLORS[ev.status] };
    case 'block':
      return { kind: 'shield', color: SHIELD };
    case 'heal':
      return { kind: 'glow', color: HEAL };
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

/** Клинок 7×16: остриё, лезвие с бликом, гарда, рукоять. */
const SWORD = [
  '...o...',
  '..oWo..',
  '.oBWBo.',
  '.oBWBo.',
  '.oBWBo.',
  '.oBWBo.',
  '.oBWBo.',
  '.oBWBo.',
  '.oBWBo.',
  '.oBWBo.',
  'ogggggo',
  '..ohho.',
  '..ohho.',
  '..ohho.',
  '..oggo.',
  '...o...',
];
function swordImg(blade: string): HTMLImageElement {
  return img(gridUrl(`sword:${blade}`, SWORD, { o: OUTLINE, B: blade, W: mix(blade, '#ffffff', 0.55), g: '#c9a227', h: '#6b4226' }), 7, 16, 4);
}

/** Стрела 14×5 остриём вправо: оперение цветом, древко, стальной наконечник. */
const ARROW = ['.F.........o..', 'FF.ssssssssoo.', 'FFFsssssssssoo', 'FF.ssssssssoo.', '.F.........o..'];
function arrowImg(color: string): HTMLImageElement {
  return img(gridUrl(`arrow:${color}`, ARROW, { F: color, s: '#8a6b3f', o: '#dcdcdc' }), 14, 5, 3);
}

/** Шар 7×7: тёмная кромка, тело, блик. */
const ORB = ['..ooo..', '.oBBBo.', 'oBWWBBo', 'oBWBBBo', 'oBBBBBo', '.oBBBo.', '..ooo..'];
function orbImg(color: string): HTMLImageElement {
  const el = img(gridUrl(`orb:${color}`, ORB, { o: mix(color, '#000000', 0.45), B: color, W: mix(color, '#ffffff', 0.6) }), 7, 7, 4);
  el.style.filter = `drop-shadow(0 0 6px ${color})`;
  return el;
}

/** Склянка 7×9: пробка, горлышко, стекло, жидкость цветом. */
const FLASK = ['..ooo..', '..oco..', '..oGo..', '.oGGGo.', 'oGLLLGo', 'oLLLLLo', 'oLLLLLo', '.oLLLo.', '..ooo..'];
function flaskImg(color: string): HTMLImageElement {
  return img(gridUrl(`flask:${color}`, FLASK, { o: OUTLINE, c: '#8a6b3f', G: '#cfe8ff', L: color }), 7, 9, 4);
}

/** Щит 11×13: контур, кайма, поле цветом, блик слева сверху, умбон по центру. */
const SHIELD_SPRITE = [
  '.ooooooooo.',
  'oRRRRRRRRRo',
  'oRWWBBBBBRo',
  'oRWBBBBBBRo',
  'oRWBBuuBBRo',
  'oRBBBuuBBRo',
  'oRBBBBBBBRo',
  'oRBBBBBBBRo',
  '.oRBBBBBRo.',
  '.oRBBBBBRo.',
  '..oRBBBRo..',
  '...oRBRo...',
  '....ooo....',
];
function shieldImg(color: string): HTMLImageElement {
  const el = img(
    gridUrl(`shield:${color}`, SHIELD_SPRITE, { o: OUTLINE, R: mix(color, '#000000', 0.35), B: color, W: mix(color, '#ffffff', 0.55), u: '#f4d35e' }),
    11,
    13,
    4,
  );
  el.style.filter = `drop-shadow(0 0 5px ${color})`;
  return el;
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
 * Разыграть снаряды и взмахи на текущем поле. Возвращает, через сколько мс они попадут (0 — нечего играть).
 * Наскок бьющего в ближнем бою — класс acting его зоне, как у наскока врагов.
 */
export function playShots(root: HTMLElement, plan: FxPlan): number {
  const layer = root.querySelector<HTMLElement>('.fx-layer');
  if (!layer || plan.shots.length === 0) return 0;
  const lunged = new Set<EventTarget>();
  for (const s of plan.shots) {
    if (s.kind === 'melee' && !lunged.has(s.from)) {
      lunged.add(s.from);
      restart(zone(root, s.from), 'acting');
    }
    window.setTimeout(() => shoot(root, layer, s), s.delay);
  }
  return plan.impact;
}

function shoot(root: HTMLElement, layer: HTMLElement, s: Shot): void {
  const a = anchor(root, layer, s.from);
  const b = anchor(root, layer, s.to);
  if (!a || !b) return;
  const dir = a.x <= b.x ? 1 : -1;
  switch (s.kind) {
    case 'melee':
      slash(layer, b, dir, s.blade, s.color);
      break;
    case 'arrow':
      fly(layer, a, b, arrowImg(s.color), FLIGHT.arrow - 30, 'linear', (el, end) => animate(el, [{ transform: end, opacity: 1 }, { transform: end, opacity: 0 }], { duration: 160, delay: 60 }, () => el.remove()));
      break;
    case 'orb':
      fly(layer, a, b, orbImg(s.color), FLIGHT.orb - 30, 'ease-in', (el, end) => burst(el, end));
      break;
    case 'flask':
      throwFlask(layer, a, b, s.color);
      break;
  }
}

/** Взмах клинком по цели: рукоять у центра спрайта, лезвие проходит дугой над ним; в момент удара — росчерк. */
function slash(layer: HTMLElement, b: Pt, dir: number, blade: string, color: string): void {
  const sword = swordImg(blade);
  sword.style.transformOrigin = '50% 88%';
  const base = `translate(${b.x - dir * 12 - sword.width / 2}px, ${b.y + 12 - sword.height * 0.88}px)`;
  const r = (deg: number) => `${base} rotate(${deg * dir}deg)`;
  layer.appendChild(sword);
  animate(sword, [
    { transform: r(-110), opacity: 0 },
    { transform: r(-95), opacity: 1, offset: 0.25 },
    { transform: r(45), opacity: 1, offset: 0.7 },
    { transform: r(60), opacity: 0 },
  ], { duration: FLIGHT.melee, easing: 'ease-in' }, () => sword.remove());
  window.setTimeout(() => {
    const line = document.createElement('div');
    line.className = 'fx fx-slash';
    line.style.background = color;
    line.style.boxShadow = `0 0 6px ${color}`;
    const len = Math.max(48, b.w * 0.7);
    line.style.left = `${b.x - len / 2}px`;
    line.style.top = `${b.y - 2}px`;
    line.style.width = `${len}px`;
    const rot = `rotate(${-40 * dir}deg)`;
    layer.appendChild(line);
    animate(line, [
      { transform: `${rot} scaleX(0)`, opacity: 1 },
      { transform: `${rot} scaleX(1)`, opacity: 1, offset: 0.4 },
      { transform: `${rot} scaleX(1)`, opacity: 0 },
    ], { duration: 200, easing: 'ease-out' }, () => line.remove());
  }, FLIGHT.melee - 120);
}

/** Прямой полёт от бойца к цели с поворотом по направлению; land получает конечный transform для добивающей анимации. */
function fly(layer: HTMLElement, a: Pt, b: Pt, el: HTMLImageElement, ms: number, easing: string, land: (el: HTMLImageElement, end: string) => void): void {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  // Старт чуть впереди стрелка, конец — центр цели.
  const sx = a.x + Math.cos(ang) * a.w * 0.3;
  const sy = a.y + Math.sin(ang) * a.w * 0.3;
  const at = (x: number, y: number) => `translate(${x - el.width / 2}px, ${y - el.height / 2}px) rotate(${ang}rad)`;
  const end = at(b.x, b.y);
  layer.appendChild(el);
  animate(el, [{ transform: at(sx, sy) }, { transform: end }], { duration: ms, easing }, () => land(el, end));
}

/** Шар лопается: раздувается и гаснет. */
function burst(el: HTMLImageElement, end: string): void {
  animate(el, [{ transform: `${end} scale(1)`, opacity: 1 }, { transform: `${end} scale(2.4)`, opacity: 0 }], { duration: 180, easing: 'ease-out' }, () => el.remove());
}

/** Склянка летит по дуге, кувыркаясь, и разбивается облаком своего цвета. */
function throwFlask(layer: HTMLElement, a: Pt, b: Pt, color: string): void {
  const wrap = document.createElement('div');
  wrap.className = 'fx';
  const flask = flaskImg(color);
  flask.style.display = 'block';
  wrap.appendChild(flask);
  layer.appendChild(wrap);
  const ms = FLIGHT.flask - 30;
  animate(wrap, [{ transform: `translate(${a.x - flask.width / 2}px, ${a.y - flask.height / 2 - 10}px)` }, { transform: `translate(${b.x - flask.width / 2}px, ${b.y - flask.height / 2}px)` }], { duration: ms, easing: 'linear' });
  animate(flask, [
    { transform: 'translateY(0) rotate(0deg)', easing: 'ease-out' },
    { transform: 'translateY(-70px) rotate(270deg)', offset: 0.5, easing: 'ease-in' },
    { transform: 'translateY(0) rotate(540deg)' },
  ], { duration: ms }, () => {
    wrap.remove();
    cloud(layer, b, color, 4);
  });
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

/**
 * Щит блока: вырастает перед бойцом со стороны противника (герой смотрит вправо, враги — влево),
 * держится и растворяется вверх. Сам боец коротко подсвечивается цветом щита.
 */
function shield(root: HTMLElement, layer: HTMLElement, t: EventTarget, color: string): void {
  const sprite = spriteOf(root, t);
  const p = anchor(root, layer, t);
  if (!sprite || !p) return;
  const el = shieldImg(color);
  const side = t === 'hero' ? 1 : -1;
  const x = p.x + side * p.w * 0.38 - el.width / 2;
  const y = p.y - el.height / 2 + p.h * 0.05;
  el.style.transformOrigin = '50% 60%';
  layer.appendChild(el);
  animate(el, [
    { transform: `translate(${x}px, ${y + 6}px) scale(0.4)`, opacity: 0 },
    { transform: `translate(${x}px, ${y}px) scale(1.15)`, opacity: 1, offset: 0.22 },
    { transform: `translate(${x}px, ${y}px) scale(1)`, opacity: 1, offset: 0.35 },
    { transform: `translate(${x}px, ${y}px) scale(1)`, opacity: 1, offset: 0.68 },
    { transform: `translate(${x}px, ${y - 10}px) scale(1.2)`, opacity: 0, filter: 'brightness(2)' },
  ], { duration: 900, easing: 'ease-out' }, () => el.remove());
  sprite.animate(
    [
      { filter: 'drop-shadow(0 0 0 transparent)' },
      { filter: `drop-shadow(0 0 8px ${color})`, offset: 0.3 },
      { filter: 'drop-shadow(0 0 0 transparent)' },
    ],
    { duration: 700, easing: 'ease-out' },
  );
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

/** Эффект на бойце после перерисовки: облако, свечение или глоток. */
export function playAfter(root: HTMLElement, fx: AfterFx): void {
  const layer = root.querySelector<HTMLElement>('.fx-layer');
  if (!layer) return;
  if (fx.kind === 'glow') glow(root, layer, fx.target, fx.color);
  else if (fx.kind === 'shield') shield(root, layer, fx.target, fx.color);
  else if (fx.kind === 'drink') drink(root, layer, fx.color);
  else {
    const p = anchor(root, layer, fx.target);
    if (p) cloud(layer, p, fx.color);
  }
}
