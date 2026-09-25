import { renderSheet, type Model, type Sheet } from './pixel';
import { MOB_STYLE } from './styles';
import { FOREST_MODELS } from './forest';
import { SWAMP_MODELS } from './swamp';
import { HIVE_MODELS } from './hive';
import { SHIP_MODELS } from './ship';
import { CAVES_MODELS } from './caves';
import { CRYPT_MODELS } from './crypt';
import { enemyDef } from '../../data/enemies';
import type { EventTarget } from '../../engine/types';

/**
 * Враги пиксельной лепки в игре: Лес (v0.52), Болота (v0.52.2), Осквернённый улей (v0.52.3), Пиратский корабль (v0.52.4) и Пещеры огня (v0.52.5). Лист врага — три ряда кадров (покой, удар, урон),
 * рисуется один раз, лежит одной картинкой в data URL; ряды и кадры листает CSS (`.mob-sheet` в style.css).
 * Клип удара запускает `playMobAction` (из `playEnemyAction`, до перерисовки поля), клип урона — `playMobClip`
 * (из `playEnemyClip` на событии урона). Идущий клип переживает `App.render()`: состояние живёт на экземпляре врага.
 */
export const MOB_MODELS: Record<string, Model> = { ...FOREST_MODELS, ...SWAMP_MODELS, ...HIVE_MODELS, ...SHIP_MODELS, ...CAVES_MODELS, ...CRYPT_MODELS };

type ActClip = 'attack' | 'hurt';

/** Рисуется ли этот враг лепкой. */
export function hasMobArt(id: string): boolean {
  return Object.hasOwn(MOB_MODELS, id);
}

type Row = 'idle' | ActClip;
/** Ряды листа. */
const ROW: Record<Row, number> = { idle: 0, attack: 1, hurt: 2 };

/**
 * Запечённый лист: картинка и то, что нужно разметке, — размер кадра и число кадров в рядах.
 * Сами RGBA-кадры после запекания не держим: на весь Лес это около 11 МБ.
 */
interface Baked { url: string; cols: number; w: number; h: number; d: number; n: Record<Row, number> }
const baked = new Map<string, Baked>();

/** Мерки кадра покоя в пикселях поля: по ним разметка ставит врага на пол. */
interface Metrics { w: number; h: number; top: number; foot: number; left: number; right: number }
const metrics = new Map<string, Metrics>();

function measure(sh: Sheet): Metrics {
  const d = sh.d;
  return { w: sh.w * d, h: sh.h * d, top: sh.top * d, foot: sh.foot * d, left: sh.left * d, right: sh.right * d };
}

function bake(id: string): Baked {
  const hit = baked.get(id);
  if (hit) return hit;
  const model = MOB_MODELS[id];
  const rows: Record<Row, Sheet> = {
    idle: renderSheet(model, MOB_STYLE),
    attack: renderSheet(model, MOB_STYLE, 'attack'),
    hurt: renderSheet(model, MOB_STYLE, 'hurt'),
  };
  const { idle } = rows;
  const cols = Math.max(...Object.values(rows).map((sh) => sh.frames.length));
  const canvas = document.createElement('canvas');
  canvas.width = idle.w * cols;
  canvas.height = idle.h * 3;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    for (const row of Object.keys(ROW) as Row[]) {
      const sh = rows[row];
      sh.frames.forEach((f, i) => ctx.putImageData(new ImageData(new Uint8ClampedArray(f), sh.w, sh.h), i * sh.w, ROW[row] * sh.h));
    }
  }
  const out: Baked = {
    url: canvas.toDataURL(), cols, w: idle.w, h: idle.h, d: idle.d,
    n: { idle: idle.frames.length, attack: rows.attack.frames.length, hurt: rows.hurt.frames.length },
  };
  baked.set(id, out);
  if (!metrics.has(id)) metrics.set(id, measure(idle));
  return out;
}

/** Очередь прогрева: листы врагов локации рисуются впрок, по одному за такт — первый бой начинается без заминки. */
const queue: string[] = [];
let warming = false;

export function warmMobs(ids: Iterable<string>): void {
  for (const id of ids) if (hasMobArt(id) && !baked.has(id) && !queue.includes(id)) queue.push(id);
  if (warming || queue.length === 0) return;
  warming = true;
  const next = (): void => {
    const id = queue.shift();
    if (id === undefined) {
      warming = false;
      return;
    }
    if (!baked.has(id)) bake(id);
    window.setTimeout(next, 40);
  };
  window.setTimeout(next, 40);
}

/**
 * Размеры листа в пикселях поля: кадр целиком, пустые поля над макушкой и под линией земли, пустые края слева и справа.
 * Лепка рисуется ровно своим пикселем, поэтому рост задаёт модель, а не таблица `ENEMY_BODY_HEIGHT`.
 * В браузере лист всё равно понадобится — мерки приходят с запеканием; без DOM (тесты размеров) хватает кадров покоя.
 */
export function mobMetrics(id: string): Metrics {
  let m = metrics.get(id);
  if (!m) {
    if (typeof document === 'undefined') metrics.set(id, measure(renderSheet(MOB_MODELS[id], MOB_STYLE)));
    else bake(id);
    m = metrics.get(id)!;
  }
  return m;
}

const IDLE_MS = (MOB_STYLE.frames / MOB_STYLE.fps) * 1000;
const clipMs = (clip: ActClip): number => (MOB_STYLE.clips[clip].frames / MOB_STYLE.clips[clip].fps) * 1000;
/** Момент контакта удара от начала клипа: к нему игра приурочивает цифру урона и снаряд. */
export const MOB_CONTACT_MS = ((MOB_STYLE.clips.attack.contact ?? 0) / MOB_STYLE.clips.attack.fps) * 1000;

/** Состояние спрайта: фаза покоя (сдвиг от общих часов) и идущий клип. Живёт на экземпляре врага и переживает render(). */
interface MobState { id: string; offset: number; run?: { clip: ActClip; started: number } }
const states = new WeakMap<object, MobState>();
const byEl = new WeakMap<HTMLElement, MobState>();
let seq = 0;

function setRow(el: HTMLElement, row: number, n: number, dur: number, delay: number, once: boolean): void {
  el.style.setProperty('--row', String(row));
  el.style.setProperty('--n', String(n));
  el.style.setProperty('--dur', `${dur}ms`);
  el.style.setProperty('--delay', `${delay}ms`);
  el.classList.toggle('once', once);
}

/** Клип кончился: покой продолжается с первого кадра — последний кадр клипа с ним совпадает. */
function endClip(st: MobState): void {
  const run = st.run;
  if (!run) return;
  const end = run.started + clipMs(run.clip);
  st.offset = (IDLE_MS - (end % IDLE_MS)) % IDLE_MS;
  st.run = undefined;
}

/** Выставить на элемент ряд, число кадров и фазу: идущий клип с той же точки, иначе покой от общих часов. */
function apply(el: HTMLElement, st: MobState, now: number): void {
  const b = bake(st.id);
  const run = st.run;
  if (run) {
    const dur = clipMs(run.clip);
    const elapsed = now - run.started;
    if (elapsed < dur - 1) {
      setRow(el, ROW[run.clip], b.n[run.clip], dur, -elapsed, true);
      return;
    }
    endClip(st);
  }
  setRow(el, ROW.idle, b.n.idle, IDLE_MS, -((now + st.offset) % IDLE_MS), false);
}

/**
 * Спрайт с циклом покоя высотой `px` (кадр целиком, с пустыми полями — их срезает разметка).
 * `instance` — объект врага или союзника: по нему новый спрайт после render() продолжает фазу и идущий клип.
 */
export function mobSprite(id: string, px: number, cls = '', instance?: object): HTMLElement {
  const b = bake(id);
  const k = px / (b.h * b.d);
  let st = instance ? states.get(instance) : undefined;
  if (!st) {
    st = { id, offset: ((seq++ * 0.382) % 1) * IDLE_MS };
    if (instance) states.set(instance, st);
  }
  const el = document.createElement('div');
  el.className = `sprite mob-sheet ${cls}`.trim();
  el.dataset.mob = id;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', id);
  el.style.setProperty('--sheet', `url(${b.url})`);
  el.style.setProperty('--w', `${b.w * b.d * k}px`);
  el.style.setProperty('--h', `${px}px`);
  el.style.setProperty('--cols', String(b.cols));
  byEl.set(el, st);
  const state = st;
  apply(el, state, performance.now());
  el.addEventListener('animationend', (e) => {
    if (e.animationName !== 'mob-once') return;
    endClip(state);
    apply(el, state, performance.now());
  });
  return el;
}

const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Запустить клип на спрайте бойца `target` (враг или союзник на поле). `from` — с какого момента клипа, мс.
 * false — у бойца нет лепки (или движение отключено): игра играет свой общий наскок и тряску.
 */
export function playMobClip(root: HTMLElement, target: EventTarget, clip: ActClip, from = 0): boolean {
  if (target === 'hero' || reducedMotion()) return false;
  const el = root.querySelector<HTMLElement>(`[data-uid="${target}"] .mob-sheet`);
  const st = el ? byEl.get(el) : undefined;
  if (!el || !st) return false;
  st.run = { clip, started: performance.now() - from };
  // Тот же клип подряд (второй удар по нему же) иначе не начнётся заново: снимаем анимацию и возвращаем.
  el.style.animationName = 'none';
  void el.offsetWidth;
  el.style.animationName = '';
  apply(el, st, performance.now());
  return true;
}

/**
 * Приём врага лепкой: если он бьёт (урон, кража), играет клип удара и возвращает момент контакта в мс —
 * игра подождёт его с цифрой урона и снарядом. Иначе 0: для воя, блока, лечения остаётся общий наскок.
 */
export function playMobAction(root: HTMLElement, target: EventTarget, name: string): number {
  if (target === 'hero') return 0;
  const el = root.querySelector<HTMLElement>(`[data-uid="${target}"] .mob-sheet`);
  const id = el?.dataset.mob;
  if (!id) return 0;
  const action = enemyDef(id).actions.find((a) => a.name === name);
  const strikes = action?.effects.some((e) => e.type === 'attack' || e.type === 'stealGold' || e.type === 'stealArtifact');
  if (!strikes) return 0;
  return playMobClip(root, target, 'attack') ? MOB_CONTACT_MS : 0;
}

/** Второй и следующие удары многоударного приёма: клип удара с кадра перед контактом — замах уже был. */
export function replayMobStrike(root: HTMLElement, target: EventTarget): boolean {
  const c = MOB_STYLE.clips.attack;
  return playMobClip(root, target, 'attack', (((c.contact ?? 1) - 1) / c.fps) * 1000);
}
