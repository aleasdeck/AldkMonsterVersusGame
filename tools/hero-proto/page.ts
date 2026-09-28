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

type Pixel = 1 | 2;
type Variant = 'ref' | `${WarriorLookId}${Pixel}`;
const figs = new Map<string, Fig>();
let REF: Fig;

function heroFig(v: Variant, weapon: WeaponKind = 'sword'): Fig {
  if (v === 'ref') return REF;
  const key = `${v}-${weapon}`;
  let f = figs.get(key);
  if (!f) figs.set(key, (f = still(warriorModel(v[0] as WarriorLookId, weapon), { ...MOB_STYLE, d: Number(v[1]) })));
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
 * Крупный план героя на полу локации: кусок поля 150 × 190 вокруг героя, целым увеличением (пиксели не плывут).
 * Увеличение — наибольшее целое, что влезает в ширину плитки, но не больше `zmax`.
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
  // ── Сцена ──
  let sceneHero: Variant = 'A1';
  let sceneLoc: Loc = 'forest';
  const heroGroup = document.getElementById('scene-hero')!;
  const locGroup = document.getElementById('scene-loc')!;
  const stage = document.getElementById('scene')!;
  const drawScene = (): void => {
    fitStage(stage, field(sceneLoc, heroFig(sceneHero), true));
    toggle(heroGroup, sceneHero);
    toggle(locGroup, sceneLoc);
  };
  heroGroup.addEventListener('click', (e) => {
    const v = (e.target as HTMLElement).closest('button')?.dataset.v as Variant | undefined;
    if (v) { sceneHero = v; drawScene(); }
  });
  locGroup.addEventListener('click', (e) => {
    const v = (e.target as HTMLElement).closest('button')?.dataset.v as Loc | undefined;
    if (v) { sceneLoc = v; drawScene(); redrawTiles(); }
  });
  drawScene();

  // ── Плитки: рядом с референсом, облики, оружие ──
  let pixel: Pixel = 1;
  const pixGroup = document.getElementById('pixel')!;
  const redrawTiles = (): void => {
    for (const el of document.querySelectorAll<HTMLElement>('[data-tile]')) {
      const [v, weapon] = el.dataset.tile!.split(':') as [string, WeaponKind | undefined];
      const variant = (v === 'ref' ? 'ref' : v.length === 1 ? `${v}${pixel}` : v) as Variant;
      tile(el, sceneLoc, heroFig(variant, weapon ?? 'sword'), Number(el.dataset.zoom ?? 3));
    }
    toggle(pixGroup, String(pixel));
    for (const el of document.querySelectorAll<HTMLElement>('[data-pixlabel]')) el.textContent = `пиксель ${pixel}`;
  };
  pixGroup.addEventListener('click', (e) => {
    const v = (e.target as HTMLElement).closest('button')?.dataset.v;
    if (v) { pixel = Number(v) as Pixel; redrawTiles(); }
  });
  for (const card of document.querySelectorAll<HTMLElement>('[data-look]')) {
    card.querySelector('button')?.addEventListener('click', () => {
      sceneHero = `${card.dataset.look}${pixel}` as Variant;
      drawScene();
      document.getElementById('battle-h')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  redrawTiles();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
