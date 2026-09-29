// Страница обсуждения «Лепка Берсерка» — шаги 2–3 рецепта (docs/lepka-geroev.md): модель в стойке по контурам прежнего
// листа. Облик B «Северянин» и волчья голова выбраны (отвергнутые — в истории ветки), открыт хват оружия. Клипов пока нет. Модель — src/ui/heroes/berserk.ts
// (в игру ещё не входит), враги и фоны — из игры, тонировка — та же, что в бою (tint.ts). Сборка — build.mjs --hero berserk.
import { Painter, type Model } from '../../src/ui/mobs/pixel';
import { FOREST_MODELS } from '../../src/ui/mobs/forest';
import { CRYPT_MODELS } from '../../src/ui/mobs/crypt';
import { CAVES_MODELS } from '../../src/ui/mobs/caves';
import { tintVar } from '../../src/ui/tint';
import { berserkModel, type BerserkWeapon } from '../../src/ui/heroes/berserk';
import { HERO_STYLE } from '../../src/ui/heroes/clips';
import { Actor, heroSet, mobSet, type Anim, type ActorSet } from './anim';

type Loc = 'forest' | 'crypt' | 'caves';
type Hero = 'sculpt' | 'ref';

declare global {
  interface Window { ASSETS: { bg: Record<Loc, string>; ref: string; avatar: string; others: Record<string, string> } }
}

const LOCS: Record<Loc, { name: string; foes: string[]; models: Record<string, Model> }> = {
  forest: { name: 'Лес', foes: ['goblin', 'cutthroat', 'wolf'], models: FOREST_MODELS },
  crypt: { name: 'Склеп', foes: ['skeleton_warrior', 'ghoul', 'mummy'], models: CRYPT_MODELS },
  caves: { name: 'Пещеры огня', foes: ['cultist', 'hellhound', 'imp'], models: CAVES_MODELS },
};
const GROUND = 282;
const HERO_X = 130;
const FOE_X = [380, 600, 823];

/** Что сейчас в сцене: лепка или прежний лист, хват оружия, локация (она же — у плиток). */
const state: { hero: Hero; weapon: BerserkWeapon; loc: Loc } = { hero: 'sculpt', weapon: 'axe', loc: 'forest' };

// ─── Наборы кадров ──────────────────────────────────────────────────────────

let REF_IMG: HTMLImageElement;

/** Лист: ячейка 194, фигура первого кадра — x 6…186, y 7…188 (182 точки) → рост 136, как в лепке. */
const REF = { cell: 194, x0: 6, x1: 187, foot: 189, k: 136 / 182 };

/**
 * Прежний рисованный Берсерк: один ряд покоя, 8 кадров за 1,6 с (CLIP_MS.idle в heroSprite.ts). Масштаб — как у лепки
 * (фигура первого кадра → 136), чтобы сверять силуэт; в игре лист шёл по росту 186 и выходил на 2 % ниже.
 * Опора — середина рамки фигуры и низ фигуры (земля).
 */
function refSet(img: HTMLImageElement): ActorSet {
  const { cell, k } = REF;
  let idle: Anim | undefined;
  return {
    w: cell * k, h: cell * k, ax: ((REF.x0 + REF.x1) / 2) * k, ay: REF.foot * k, smooth: true,
    has: (clip) => clip === 'idle' && !!idle,
    get(clip) {
      if (clip !== 'idle') return undefined;
      if (!idle) {
        const frames = Array.from({ length: 8 }, (_, i) => {
          const c = document.createElement('canvas');
          c.width = cell;
          c.height = cell;
          c.getContext('2d')!.drawImage(img, i * cell, 0, cell, cell, 0, 0, cell, cell);
          return c;
        });
        idle = { frames, fps: 5, loop: true, hold: false };
      }
      return idle;
    },
  };
}

const sets = new Map<string, ActorSet>();
/** Набор кадров героя: прежний лист или лепка с хватом оружия. Лепка рисуется при первом запросе. */
function heroAnim(hero: Hero, weapon: BerserkWeapon): ActorSet {
  const key = hero === 'ref' ? 'ref' : weapon;
  let set = sets.get(key);
  if (!set) sets.set(key, (set = hero === 'ref' ? refSet(REF_IMG) : heroSet(berserkModel(weapon), HERO_STYLE)));
  return set;
}
const foeSets = new Map<string, ActorSet>();
function foeAnim(loc: Loc, id: string): ActorSet {
  let set = foeSets.get(id);
  if (!set) foeSets.set(id, (set = mobSet(LOCS[loc].models[id])));
  return set;
}

// ─── Поле ───────────────────────────────────────────────────────────────────

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
}

/** Поле 960 × 320: фон локации, тонировка, враги (если нужны) и герой — живые холсты общего цикла кадров. */
function liveField(loc: Loc, hero: ActorSet, foes: boolean): HTMLElement {
  tintVar(loc);
  const f = h('div', 'field');
  const bg = h('img', 'bg');
  bg.src = window.ASSETS.bg[loc];
  bg.alt = '';
  f.appendChild(bg);
  const filter = `url(#mv-tint-${loc})`;
  if (foes) LOCS[loc].foes.forEach((id, i) => f.appendChild(new Actor(foeAnim(loc, id), FOE_X[i], GROUND, filter).el));
  f.appendChild(new Actor(hero, HERO_X, GROUND, filter).el);
  return f;
}

const observers = new WeakMap<HTMLElement, ResizeObserver>();
function observe(host: HTMLElement, fit: () => void): void {
  observers.get(host)?.disconnect();
  const ro = new ResizeObserver(fit);
  ro.observe(host);
  observers.set(host, ro);
  fit();
}

/** Поле во всю ширину блока: масштаб по ширине, как кадр игры на экране. */
function fitStage(host: HTMLElement, f: HTMLElement): void {
  host.replaceChildren(f);
  observe(host, () => {
    const k = host.clientWidth / 960;
    f.style.transform = `scale(${k})`;
    host.style.height = `${320 * k}px`;
  });
}

/**
 * Крупный план: кусок поля 170 × 180 вокруг героя целым увеличением — ×2, как кадр игры на FullHD (пиксель 1,5 —
 * ровно три точки экрана). Не влезает в ширину плитки — ×1.
 */
function tile(host: HTMLElement, loc: Loc, set: ActorSet): void {
  const CW = 164, CH = 180;
  const f = liveField(loc, set, false);
  const win = h('div', 'tile-win');
  win.appendChild(f);
  host.replaceChildren(win);
  observe(host, () => {
    const z = Math.max(1, Math.min(2, Math.floor(host.clientWidth / CW)));
    win.style.width = `${CW * z}px`;
    win.style.height = `${CH * z}px`;
    f.style.transform = `scale(${z}) translate(${-(HERO_X - CW / 2)}px, ${-(GROUND + 12 - CH)}px)`;
  });
}

// ─── Сверка силуэта ─────────────────────────────────────────────────────────

/**
 * Лист, пересчитанный в сетку лепки (пиксель 1,5): каждая клетка берёт точку листа под своей серединой тем же переводом,
 * что мерки в модели (x = 4 + (px − 6)·k, y = 140 − (189 − py)·k), — рядом лепка (первый кадр покоя) и карта
 * расхождений: красное — только на листе, голубое — только в лепке.
 */
function drawOverlay(): void {
  const host = document.getElementById('overlay');
  if (!host) return;
  const m = berserkModel(state.weapon);
  const p = new Painter(m, HERO_STYLE, 0);
  m.draw(p);
  const fig = p.finish();
  const { cell, k } = REF;
  const rc = document.createElement('canvas');
  rc.width = rc.height = cell;
  const rctx = rc.getContext('2d')!;
  rctx.drawImage(REF_IMG, 0, 0, cell, cell, 0, 0, cell, cell);
  const ref = rctx.getImageData(0, 0, cell, cell).data;
  const d = HERO_STYLE.d, pad = m.pad ?? 80, G = m.ground;
  const X0 = -8, Y0 = -2, cols = Math.round(160 / d), rows = Math.round(146 / d);
  const panels = [0, 1, 2].map(() => new ImageData(cols, rows));
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = X0 + (i + 0.5) * d, y = Y0 + (j + 0.5) * d;
      const px = Math.floor(REF.x0 + (x - 4) / k), py = Math.floor(REF.foot - (G - y) / k);
      const ro = (py * cell + px) * 4;
      const r = px >= 0 && py >= 0 && px < cell && py < cell && ref[ro + 3] > 0 ? [ref[ro], ref[ro + 1], ref[ro + 2]] : null;
      const fi = Math.floor((x + pad) / d), fj = Math.floor((y + pad) / d), so = (fj * p.W + fi) * 4;
      const s2 = fi >= 0 && fj >= 0 && fi < p.W && fj < p.H && fig[so + 3] > 0 ? [fig[so], fig[so + 1], fig[so + 2]] : null;
      const grid = Math.round(x) % 10 === 0 || Math.round(y) % 10 === 0;
      const bg = grid ? [52, 48, 58] : [30, 27, 34];
      const diff = r && s2 ? [120, 116, 124] : r ? [220, 70, 70] : s2 ? [70, 196, 220] : bg;
      [r ?? bg, s2 ?? bg, diff].forEach((c, n) => {
        const o = (j * cols + i) * 4, data = panels[n].data;
        data[o] = c[0];
        data[o + 1] = c[1];
        data[o + 2] = c[2];
        data[o + 3] = 255;
      });
    }
  }
  const names = ['Лист в пикселе 1,5', 'Лепка', 'Расхождения'];
  host.replaceChildren(...panels.map((img, n) => {
    const f = document.createElement('figure');
    const c = document.createElement('canvas');
    c.width = cols;
    c.height = rows;
    c.getContext('2d')!.putImageData(img, 0, 0);
    c.style.width = `${cols * 3}px`;
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', names[n]);
    const cap = document.createElement('figcaption');
    cap.textContent = names[n];
    f.append(c, cap);
    return f;
  }));
}

// ─── Отрисовка ──────────────────────────────────────────────────────────────

function toggle(group: HTMLElement, value: string): void {
  for (const b of group.querySelectorAll<HTMLButtonElement>('button[data-v]')) b.setAttribute('aria-pressed', String(b.dataset.v === value));
}

function drawScene(): void {
  const { hero, weapon, loc } = state;
  fitStage(document.getElementById('scene')!, liveField(loc, heroAnim(hero, weapon), true));
  toggle(document.getElementById('scene-hero')!, hero);
  toggle(document.getElementById('scene-weapon')!, weapon);
  toggle(document.getElementById('scene-loc')!, loc);
  // Хват у листа не меняется — переключатель гаснет.
  document.getElementById('scene-weapon')!.classList.toggle('muted', hero === 'ref');
  for (const card of document.querySelectorAll<HTMLElement>('[data-weapon-card]')) card.setAttribute('aria-pressed', String(card.dataset.weaponCard === weapon));
}

/**
 * Плитки: `data-tile="axe"` — лепка с этим хватом, `*` — с хватом из сцены, `ref` — прежний лист. Рисуются по одной,
 * чтобы страница не вставала на кадрах.
 */
let tileRun = 0;
function drawTiles(): void {
  const run = ++tileRun;
  const hosts = [...document.querySelectorAll<HTMLElement>('[data-tile]')];
  for (const el of hosts) if (!el.firstChild) el.textContent = 'рисую кадры…';
  let i = 0;
  const next = (): void => {
    if (run !== tileRun) return;
    // Сверка силуэта — последней, своим шагом: иначе она достраивается вместе с первой плиткой.
    if (i === hosts.length) {
      i++;
      drawOverlay();
      return;
    }
    const el = hosts[i++];
    if (!el) return;
    const spec = el.dataset.tile!;
    if (spec === 'ref') tile(el, state.loc, heroAnim('ref', 'axe'));
    else tile(el, state.loc, heroAnim('sculpt', (spec === '*' ? state.weapon : spec) as BerserkWeapon));
    window.setTimeout(next, 20);
  };
  window.setTimeout(next, 30);
}

function start(): void {
  const pick = (e: Event): string | undefined => (e.target as HTMLElement).closest<HTMLElement>('[data-v]')?.dataset.v;
  const on = (id: string, fn: (v: string) => void): void => {
    document.getElementById(id)!.addEventListener('click', (e) => {
      const v = pick(e);
      if (v) fn(v);
    });
  };
  on('scene-hero', (v) => {
    state.hero = v as Hero;
    drawScene();
  });
  on('scene-weapon', (v) => {
    state.weapon = v as BerserkWeapon;
    drawScene();
    drawTiles();
  });
  on('scene-loc', (v) => {
    state.loc = v as Loc;
    drawScene();
    drawTiles();
  });
  // Карточка хвата ставит его в сцену.
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-weapon-card]')) {
    b.addEventListener('click', () => {
      state.weapon = b.dataset.weaponCard as BerserkWeapon;
      drawScene();
      drawTiles();
    });
  }
  // Сначала показать текст, потом рисовать: сцена — полсекунды–две работы главного потока на слабом телефоне, и
  // страница с ней в первом кадре выглядела «не загрузившейся».
  document.getElementById('scene')!.textContent = 'рисую кадры…';
  window.requestAnimationFrame(() => window.setTimeout(() => {
    drawScene();
    drawTiles();
  }, 60));
}

function boot(): void {
  const img = new Image();
  img.onload = () => {
    REF_IMG = img;
    start();
  };
  img.src = window.ASSETS.ref;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
