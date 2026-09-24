import { renderSheet, type Model, type Sheet } from './pixel';
import { MOB_STYLES, type MobStyleId } from './styles';
import { FOREST_MODELS } from './forest';

/**
 * Враги пиксельной лепки в игре (прототип v0.52). Пока только Лес и только по параметру адреса `&mobs=a|b|c`:
 * без него остаются прежние процедурные спрайты, пока пользователь выбирает вариант.
 * Лист кадров покоя рисуется один раз на врага и вариант, лежит полосой в data URL, листает его CSS (`.mob-sheet`).
 */
export const MOB_MODELS: Record<string, Model> = { ...FOREST_MODELS };

let active: MobStyleId | null = null;

/** Включить вариант (`a`, `b`, `c`); другое значение возвращает прежние спрайты. */
export function setMobStyle(id: string | null): void {
  active = id && Object.hasOwn(MOB_STYLES, id) ? (id as MobStyleId) : null;
}

/** Рисуется ли этот враг лепкой при текущем варианте. */
export function hasMobArt(id: string): boolean {
  return active !== null && Object.hasOwn(MOB_MODELS, id);
}

interface Baked { sheet: Sheet; url: string }
const baked = new Map<string, Baked>();

function bake(id: string): Baked {
  const key = `${id}:${active}`;
  const hit = baked.get(key);
  if (hit) return hit;
  const sheet = renderSheet(MOB_MODELS[id], MOB_STYLES[active ?? 'b']);
  const strip = document.createElement('canvas');
  strip.width = sheet.w * sheet.frames.length;
  strip.height = sheet.h;
  const ctx = strip.getContext('2d');
  if (ctx) sheet.frames.forEach((f, i) => ctx.putImageData(new ImageData(new Uint8ClampedArray(f), sheet.w, sheet.h), i * sheet.w, 0));
  const out = { sheet, url: strip.toDataURL() };
  baked.set(key, out);
  return out;
}

/**
 * Размеры листа в пикселях поля: кадр целиком и пустые поля над макушкой и под линией земли.
 * Лепка рисуется ровно своим пикселем, поэтому рост задаёт модель, а не таблица `ENEMY_BODY_HEIGHT`.
 */
export function mobMetrics(id: string): { w: number; h: number; top: number; foot: number } {
  const { sheet } = bake(id);
  return { w: sheet.w * sheet.d, h: sheet.h * sheet.d, top: sheet.top * sheet.d, foot: sheet.foot * sheet.d };
}

/** Сдвиг фазы покоя у экземпляра врага: два волка не дышат в унисон, а перерисовка не сбрасывает цикл. */
const phases = new WeakMap<object, number>();
let seq = 0;

/** Спрайт с циклом покоя высотой `px` (кадр целиком, с пустыми полями — их срезает разметка). */
export function mobSprite(id: string, px: number, cls = '', instance?: object): HTMLElement {
  const { sheet, url } = bake(id);
  const k = px / (sheet.h * sheet.d);
  const dur = (sheet.frames.length / sheet.fps) * 1000;
  let offset = instance ? phases.get(instance) : undefined;
  if (offset === undefined) {
    offset = ((seq++ * 0.382) % 1) * dur;
    if (instance) phases.set(instance, offset);
  }
  const el = document.createElement('div');
  el.className = `sprite mob-sheet ${cls}`.trim();
  el.dataset.mob = id;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', id);
  el.style.setProperty('--sheet', `url(${url})`);
  el.style.setProperty('--w', `${sheet.w * sheet.d * k}px`);
  el.style.setProperty('--h', `${px}px`);
  el.style.setProperty('--n', String(sheet.frames.length));
  el.style.setProperty('--dur', `${dur}ms`);
  // Отрицательная задержка от общих часов: новый спрайт после render() подхватывает цикл с той же точки.
  el.style.setProperty('--delay', `${-((performance.now() + offset) % dur)}ms`);
  return el;
}
