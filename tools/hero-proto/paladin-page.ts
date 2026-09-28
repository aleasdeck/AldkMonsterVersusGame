// Страница обсуждения «Лепка Паладина» — шаги 2–3 рецепта (docs/lepka-geroev.md): модель в стойке по меркам прежнего
// листа, три облика одной лепкой, шлем и оружие. Клипов пока нет — сначала облик. Модель — src/ui/heroes/paladin.ts
// (в игру ещё не входит), враги и фоны — из игры, тонировка — та же, что в бою (tint.ts). Сборка — build.mjs --hero paladin.
import { Painter, type Model } from '../../src/ui/mobs/pixel';
import { FOREST_MODELS } from '../../src/ui/mobs/forest';
import { CRYPT_MODELS } from '../../src/ui/mobs/crypt';
import { CAVES_MODELS } from '../../src/ui/mobs/caves';
import { tintVar } from '../../src/ui/tint';
import { paladinModel, type PaladinHelm, type PaladinLookId, type PaladinWeapon } from '../../src/ui/heroes/paladin';
import { HERO_STYLE } from '../../src/ui/heroes/clips';
import { Actor, heroSet, mobSet, type Anim, type ActorSet } from './anim';

type Loc = 'forest' | 'crypt' | 'caves';
type Look = PaladinLookId | 'ref';

declare global {
  interface Window { ASSETS: { bg: Record<Loc, string>; ref: string; avatar: string } }
}

const LOCS: Record<Loc, { name: string; foes: string[]; models: Record<string, Model> }> = {
  forest: { name: 'Лес', foes: ['goblin', 'cutthroat', 'wolf'], models: FOREST_MODELS },
  crypt: { name: 'Склеп', foes: ['skeleton_warrior', 'ghoul', 'mummy'], models: CRYPT_MODELS },
  caves: { name: 'Пещеры огня', foes: ['cultist', 'hellhound', 'imp'], models: CAVES_MODELS },
};
const GROUND = 282;
const HERO_X = 130;
const FOE_X = [357, 590, 823];

/** Что сейчас выбрано в сцене; карточки шлемов и оружия рисуются в выбранном облике. */
const state: { look: Look; helm: PaladinHelm; weapon: PaladinWeapon; loc: Loc } = { look: 'B', helm: 'great', weapon: 'hammer', loc: 'forest' };

// ─── Наборы кадров ──────────────────────────────────────────────────────────

let REF_IMG: HTMLImageElement;

/**
 * Прежний рисованный Паладин: один ряд покоя, 8 кадров за 1,6 с (CLIP_MS.idle в heroSprite.ts), масштаб как в игре —
 * фигура 180 точек листа → рост 132. Опора — середина рамки фигуры (x 12…178) и низ ячейки листа (земля на 184).
 */
function refSet(img: HTMLImageElement): ActorSet {
  const cell = 188, k = 132 / 180;
  let idle: Anim | undefined;
  return {
    w: cell * k, h: cell * k, ax: ((12 + 178) / 2) * k, ay: 184 * k, smooth: true,
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
/** Набор кадров героя: прежний лист или лепка в облике, шлеме и с оружием. Лепка рисуется при первом запросе. */
function heroAnim(look: Look, helm: PaladinHelm, weapon: PaladinWeapon): ActorSet {
  const key = look === 'ref' ? 'ref' : `${look}:${helm}:${weapon}`;
  let set = sets.get(key);
  if (!set) sets.set(key, (set = look === 'ref' ? refSet(REF_IMG) : heroSet(paladinModel(look, helm, weapon), HERO_STYLE)));
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
 * Крупный план: кусок поля 160 × 190 вокруг героя целым увеличением — ×2, как кадр игры на FullHD (пиксель 1,5 —
 * ровно три точки экрана). Не влезает в ширину плитки — ×1.
 */
function tile(host: HTMLElement, loc: Loc, set: ActorSet): void {
  const CW = 160, CH = 190;
  const f = liveField(loc, set, false);
  const win = h('div', 'tile-win');
  win.appendChild(f);
  host.replaceChildren(win);
  observe(host, () => {
    const z = Math.max(1, Math.min(2, Math.floor(host.clientWidth / CW)));
    win.style.width = `${CW * z}px`;
    win.style.height = `${CH * z}px`;
    f.style.transform = `scale(${z}) translate(${-(HERO_X - CW / 2)}px, ${-(GROUND + 14 - CH)}px)`;
  });
}

// ─── Отрисовка ──────────────────────────────────────────────────────────────

function toggle(group: HTMLElement, value: string): void {
  for (const b of group.querySelectorAll<HTMLButtonElement>('button[data-v]')) b.setAttribute('aria-pressed', String(b.dataset.v === value));
}

function drawScene(): void {
  const { look, helm, weapon, loc } = state;
  fitStage(document.getElementById('scene')!, liveField(loc, heroAnim(look, helm, weapon), true));
  toggle(document.getElementById('scene-look')!, look);
  toggle(document.getElementById('scene-helm')!, helm);
  toggle(document.getElementById('scene-weapon')!, weapon);
  toggle(document.getElementById('scene-loc')!, loc);
  // Шлем и оружие у листа не меняются — переключатели гаснут.
  for (const id of ['scene-helm', 'scene-weapon']) document.getElementById(id)!.classList.toggle('muted', look === 'ref');
  for (const card of document.querySelectorAll<HTMLElement>('[data-look-card]')) card.classList.toggle('shown', card.dataset.lookCard === look);
  for (const card of document.querySelectorAll<HTMLElement>('[data-helm-card]')) card.setAttribute('aria-pressed', String(card.dataset.helmCard === helm));
  for (const card of document.querySelectorAll<HTMLElement>('[data-weapon-card]')) card.setAttribute('aria-pressed', String(card.dataset.weaponCard === weapon));
}

/**
 * Плитки: `data-tile="A:bucket:hammer"` — облик, шлем, оружие; `*` — взять из сцены (карточки шлемов и оружия
 * показывают выбранный облик); `ref` — прежний лист. Рисуются по одной, чтобы страница не вставала на кадрах.
 */
let tileRun = 0;
function drawTiles(): void {
  drawOverlay();
  const run = ++tileRun;
  const hosts = [...document.querySelectorAll<HTMLElement>('[data-tile]')];
  for (const el of hosts) if (!el.firstChild) el.textContent = 'рисую кадры…';
  let i = 0;
  const next = (): void => {
    if (run !== tileRun) return;
    const el = hosts[i++];
    if (!el) return;
    const spec = el.dataset.tile!;
    if (spec === 'ref') tile(el, state.loc, heroAnim('ref', 'great', 'hammer'));
    else {
      const [lk, hm, wp] = spec.split(':');
      const look = (lk === '*' ? (state.look === 'ref' ? 'B' : state.look) : lk) as PaladinLookId;
      tile(el, state.loc, heroAnim(look, (hm === '*' ? state.helm : hm) as PaladinHelm, (wp === '*' ? state.weapon : wp) as PaladinWeapon));
    }
    window.setTimeout(next, 20);
  };
  window.setTimeout(next, 30);
  const lookName = document.querySelectorAll<HTMLElement>('[data-look-name]');
  const name = state.look === 'ref' ? 'B' : state.look;
  for (const el of lookName) el.textContent = name;
}

/**
 * Сверка силуэта: лист пересчитан в сетку лепки (пиксель 1,5) — каждая клетка берёт точку листа под своей серединой
 * по тому же переводу, что мерки, — рядом лепка в выбранном облике (первый кадр покоя) и карта расхождений.
 */
function drawOverlay(): void {
  const host = document.getElementById('overlay');
  if (!host) return;
  const look = state.look === 'ref' ? 'B' : state.look;
  const m = paladinModel(look, state.helm, state.weapon);
  const p = new Painter(m, HERO_STYLE, 0);
  m.draw(p);
  const fig = p.finish();
  const rc = document.createElement('canvas');
  rc.width = rc.height = 188;
  const rctx = rc.getContext('2d')!;
  rctx.drawImage(REF_IMG, 0, 0, 188, 188, 0, 0, 188, 188);
  const ref = rctx.getImageData(0, 0, 188, 188).data;
  const k = 132 / 180, d = HERO_STYLE.d, pad = m.pad ?? 80;
  const X0 = -8, Y0 = 0, cols = Math.round(148 / d), rows = Math.round(138 / d);
  const panels = [0, 1, 2].map(() => new ImageData(cols, rows));
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = X0 + (i + 0.5) * d, y = Y0 + (j + 0.5) * d;
      const px = Math.floor(12 + (x - 5) / k), py = Math.floor(184 - (136 - y) / k);
      const ro = (py * 188 + px) * 4;
      const r = px >= 0 && py >= 0 && px < 188 && py < 188 && ref[ro + 3] > 0 ? [ref[ro], ref[ro + 1], ref[ro + 2]] : null;
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
  const names = ['Лист в пикселе 1,5', `Лепка, облик ${look}`, 'Расхождения'];
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

function start(): void {
  const pick = (e: Event): string | undefined => (e.target as HTMLElement).closest<HTMLElement>('[data-v]')?.dataset.v;
  const on = (id: string, fn: (v: string) => void): void => {
    document.getElementById(id)!.addEventListener('click', (e) => {
      const v = pick(e);
      if (v) fn(v);
    });
  };
  on('scene-look', (v) => {
    const was = state.look === 'ref' ? 'B' : state.look;
    state.look = v as Look;
    drawScene();
    // Карточки шлемов и оружия показывают выбранный облик.
    if ((state.look === 'ref' ? 'B' : state.look) !== was) drawTiles();
  });
  on('scene-helm', (v) => {
    state.helm = v as PaladinHelm;
    drawScene();
    drawTiles();
  });
  on('scene-weapon', (v) => {
    state.weapon = v as PaladinWeapon;
    drawScene();
    drawTiles();
  });
  on('scene-loc', (v) => {
    state.loc = v as Loc;
    drawScene();
    drawTiles();
  });
  // Кнопки на карточках: облик — в сцену и прокрутка к ней; шлем и оружие — в сцену.
  const scene = document.getElementById('battle-h')!;
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-show-look]')) {
    b.addEventListener('click', () => {
      state.look = b.dataset.showLook as Look;
      drawScene();
      drawTiles();
      scene.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-helm-card]')) {
    b.addEventListener('click', () => {
      state.helm = b.dataset.helmCard as PaladinHelm;
      drawScene();
      drawTiles();
    });
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-weapon-card]')) {
    b.addEventListener('click', () => {
      state.weapon = b.dataset.weaponCard as PaladinWeapon;
      drawScene();
      drawTiles();
    });
  }
  drawScene();
  drawTiles();
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
