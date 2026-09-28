// Страница обсуждения «Лепка Воина»: модель героя лепкой рядом с нынешним рисованным листом, три облика,
// два размера пикселя, оружие в руке. Анимаций нет — сначала модель (решение пользователя).
// Враги и фоны — из игры; тонировка — та же, что в бою (tint.ts).
import { Painter, type Model, type Style } from '../../src/ui/mobs/pixel';
import { MOB_STYLE } from '../../src/ui/mobs/styles';
import { FOREST_MODELS } from '../../src/ui/mobs/forest';
import { CRYPT_MODELS } from '../../src/ui/mobs/crypt';
import { CAVES_MODELS } from '../../src/ui/mobs/caves';
import { tintVar } from '../../src/ui/tint';
import { warriorModel, type WarriorLookId, type WeaponKind } from './warrior';

type Loc = 'forest' | 'crypt' | 'caves';

declare global {
  interface Window { ASSETS: { bg: Record<Loc, string>; ref: string } }
}

const LOCS: Record<Loc, { name: string; foes: string[]; models: Record<string, Model> }> = {
  forest: { name: 'Лес', foes: ['goblin', 'cutthroat', 'wolf'], models: FOREST_MODELS },
  crypt: { name: 'Склеп', foes: ['skeleton_warrior', 'ghoul', 'mummy'], models: CRYPT_MODELS },
  caves: { name: 'Пещеры огня', foes: ['cultist', 'hellhound', 'imp'], models: CAVES_MODELS },
};
const GROUND = 282;
const HERO_X = 130;
const FOE_X = [357, 590, 823];

// ─── Фигуры ─────────────────────────────────────────────────────────────────

/** Кадр бойца: холст в пикселях рисунка, размер на поле и точка опоры (середина фигуры, линия земли). */
interface Fig { src: HTMLCanvasElement; w: number; h: number; ax: number; ay: number; smooth?: boolean }

/** Первый кадр покоя модели: тот же Painter, что в игре, без клипов. */
function still(model: Model, style: Style): Fig {
  const p = new Painter(model, style, 0);
  model.draw(p);
  const px = p.finish();
  const c = document.createElement('canvas');
  c.width = p.W;
  c.height = p.H;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(px), p.W, p.H), 0, 0);
  let x0 = p.W, x1 = 0;
  for (let j = 0; j < p.H; j++) for (let i = 0; i < p.W; i++) if (px[(j * p.W + i) * 4 + 3] === 255) { x0 = Math.min(x0, i); x1 = Math.max(x1, i); }
  const d = style.d;
  const groundRow = Math.round((model.ground + (model.pad ?? 22)) / d);
  return { src: c, w: p.W * d, h: p.H * d, ax: ((x0 + x1 + 1) / 2) * d, ay: groundRow * d };
}

/** Нынешний рисованный Воин: первый кадр ряда боевой стойки, масштаб как в игре (фигура 107 → 128). */
function refFig(img: HTMLImageElement): Fig {
  const cell = 162, k = 128 / 107;
  const c = document.createElement('canvas');
  c.width = cell;
  c.height = cell;
  c.getContext('2d')!.drawImage(img, 0, cell, cell, cell, 0, 0, cell, cell);
  return { src: c, w: cell * k, h: cell * k, ax: ((31 + 134) / 2) * k, ay: 135 * k, smooth: true };
}

function figEl(f: Fig, x: number, loc: Loc): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = f.src.width;
  c.height = f.src.height;
  c.getContext('2d')!.drawImage(f.src, 0, 0);
  c.className = f.smooth ? 'fig smooth' : 'fig';
  c.style.cssText = `left:${x - f.ax}px;top:${GROUND - f.ay}px;width:${f.w}px;height:${f.h}px;filter:url(#mv-tint-${loc})`;
  return c;
}

// ─── Варианты героя ─────────────────────────────────────────────────────────

/**
 * Размер пикселя рисунка в пикселях поля: 2 — как враги и фоны, 1 — вдвое подробнее, 1.5 — между ними
 * (на FullHD кадр игры ×2, и пиксель 1.5 — ровно три точки экрана).
 */
type Pixel = 2 | 1.5 | 1;
type Look = 'ref' | WarriorLookId;
const figs = new Map<string, Fig>();
let REF: Fig;

function heroFig(look: Look, pixel: Pixel, weapon: WeaponKind = 'sword'): Fig {
  if (look === 'ref') return REF;
  const key = `${look}-${pixel}-${weapon}`;
  let f = figs.get(key);
  if (!f) figs.set(key, (f = still(warriorModel(look, weapon), { ...MOB_STYLE, d: pixel })));
  return f;
}

const foeFigs = new Map<string, Fig>();
function foeFig(loc: Loc, id: string): Fig {
  let f = foeFigs.get(id);
  if (!f) foeFigs.set(id, (f = still(LOCS[loc].models[id], MOB_STYLE)));
  return f;
}

// ─── Поле ───────────────────────────────────────────────────────────────────

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
}

/** Поле боя 960 × 320: фон локации, герой и враги в своих точках, тонировка локации. */
function field(loc: Loc, hero: Fig | null, foes: boolean): HTMLElement {
  tintVar(loc);
  const f = h('div', 'field');
  const bg = h('img', 'bg');
  bg.src = window.ASSETS.bg[loc];
  bg.alt = '';
  f.appendChild(bg);
  if (foes) LOCS[loc].foes.forEach((id, i) => f.appendChild(figEl(foeFig(loc, id), FOE_X[i], loc)));
  if (hero) f.appendChild(figEl(hero, HERO_X, loc));
  return f;
}

/** Поле во всю ширину блока: масштаб по ширине, как кадр игры на экране. */
function fitStage(host: HTMLElement, f: HTMLElement): void {
  host.replaceChildren(f);
  const fit = (): void => {
    const k = host.clientWidth / 960;
    f.style.transform = `scale(${k})`;
    host.style.height = `${320 * k}px`;
  };
  fit();
  new ResizeObserver(fit).observe(host);
}

/**
 * Крупный план героя на полу локации: кусок поля 150 × 190 вокруг героя, целым увеличением — как кадр игры
 * на FullHD (×2): пиксель 1.5 там ровно три точки. Не влезает в ширину плитки — ×1.
 */
function tile(host: HTMLElement, loc: Loc, hero: Fig, zmax: number): void {
  const CW = 150, CH = 190;
  const f = field(loc, hero, false);
  const win = h('div', 'tile-win');
  win.appendChild(f);
  host.replaceChildren(win);
  const fit = (): void => {
    const z = Math.max(1, Math.min(zmax, Math.floor(host.clientWidth / CW)));
    win.style.width = `${CW * z}px`;
    win.style.height = `${CH * z}px`;
    f.style.transform = `scale(${z}) translate(${-(HERO_X - CW / 2)}px, ${-(GROUND + 16 - CH)}px)`;
  };
  fit();
  new ResizeObserver(fit).observe(host);
}

// ─── Разметка ───────────────────────────────────────────────────────────────

function toggle(group: HTMLElement, value: string): void {
  for (const b of group.querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-pressed', String(b.dataset.v === value));
}

function boot(): void {
  const img = new Image();
  img.onload = () => {
    REF = refFig(img);
    start();
  };
  img.src = window.ASSETS.ref;
}

function start(): void {
  // Одно состояние на страницу: облик в бою, размер пикселя (и в бою, и в плитках обликов и оружия), локация.
  let look: Look = 'A';
  let pixel: Pixel = 1.5;
  let loc: Loc = 'forest';
  const lookGroup = document.getElementById('scene-look')!;
  const pixGroups = [...document.querySelectorAll<HTMLElement>('[data-pixel-group]')];
  const locGroup = document.getElementById('scene-loc')!;
  const stage = document.getElementById('scene')!;
  const drawScene = (): void => {
    fitStage(stage, field(loc, heroFig(look, pixel), true));
    toggle(lookGroup, look);
    toggle(locGroup, loc);
  };
  // Плитки: `data-tile` — облик (A, B, C, ref) и оружие; `data-pixel` — свой размер пикселя, иначе общий.
  const drawTiles = (): void => {
    for (const el of document.querySelectorAll<HTMLElement>('[data-tile]')) {
      const [l, weapon] = el.dataset.tile!.split(':') as [Look, WeaponKind | undefined];
      const px = el.dataset.pixel ? (Number(el.dataset.pixel) as Pixel) : pixel;
      tile(el, loc, heroFig(l, px, weapon ?? 'sword'), 2);
    }
    for (const g of pixGroups) toggle(g, String(pixel));
    for (const el of document.querySelectorAll<HTMLElement>('[data-pixlabel]')) el.textContent = `пиксель ${String(pixel).replace('.', ',')}`;
  };
  const pick = (e: Event): string | undefined => (e.target as HTMLElement).closest('button')?.dataset.v;
  lookGroup.addEventListener('click', (e) => {
    const v = pick(e) as Look | undefined;
    if (v) { look = v; drawScene(); }
  });
  for (const g of pixGroups) {
    g.addEventListener('click', (e) => {
      const v = pick(e);
      if (v) { pixel = Number(v) as Pixel; drawScene(); drawTiles(); }
    });
  }
  locGroup.addEventListener('click', (e) => {
    const v = pick(e) as Loc | undefined;
    if (v) { loc = v; drawScene(); drawTiles(); }
  });
  for (const card of document.querySelectorAll<HTMLElement>('[data-look]')) {
    card.querySelector('button')?.addEventListener('click', () => {
      look = card.dataset.look as Look;
      drawScene();
      document.getElementById('battle-h')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  drawScene();
  drawTiles();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
