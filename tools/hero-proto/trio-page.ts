// Страница обсуждения «Лепка троих» (docs/lepka-geroev.md, шаги 1–3): Маг, Ассасин и Лучник — по три облика одной
// лепки у каждого рядом с прежним рисованным листом; сцена боя, отряд из шести героев на одном полу и сверка силуэта.
// Модели — src/ui/heroes/{mage,assassin,archer}.ts (в игру ещё не входят, облик — `<герой>Model(look)`), Воин,
// Паладин и Берсерк — из игры, враги и фоны — тоже, тонировка — та же, что в бою (tint.ts). Сборка — build.mjs --hero trio.
import { Painter, type Model } from '../../src/ui/mobs/pixel';
import { FOREST_MODELS } from '../../src/ui/mobs/forest';
import { CRYPT_MODELS } from '../../src/ui/mobs/crypt';
import { CAVES_MODELS } from '../../src/ui/mobs/caves';
import { tintVar } from '../../src/ui/tint';
import { mageModel, MAGE_LOOKS, MAGE_RECOMMENDED } from '../../src/ui/heroes/mage';
import { assassinModel, ASSASSIN_LOOKS, ASSASSIN_RECOMMENDED } from '../../src/ui/heroes/assassin';
import { archerModel, ARCHER_LOOKS, ARCHER_RECOMMENDED } from '../../src/ui/heroes/archer';
import { warriorModel } from '../../src/ui/heroes/warrior';
import { paladinModel } from '../../src/ui/heroes/paladin';
import { berserkModel } from '../../src/ui/heroes/berserk';
import type { HeroModel } from '../../src/ui/heroes/model';
import { HERO_STYLE } from '../../src/ui/heroes/clips';
import { HERO_BODY_HEIGHT } from '../../src/data/characterSizes';
import { Actor, heroSet, mobSet, setSpeed, type Anim, type ActorSet } from './anim';

type Loc = 'forest' | 'crypt' | 'caves';
type HeroId = 'mage' | 'assassin' | 'archer';
type Look = 'a' | 'b' | 'c';
/** Что стоит у героя в сцене и в отряде: облик лепки или прежний лист. */
type Pick = Look | 'ref';

declare global {
  interface Window { ASSETS: { bg: Record<Loc, string>; refs: Record<HeroId, string>; avatars: Record<HeroId, string> } }
}

interface LookInfo { id: Look; name: string; note: string }

/**
 * Герои страницы: облики и рекомендация лепщика — из файла модели; ряд прежнего листа, по которому снимались мерки
 * (у Мага — ряд боевой стойки `battle`, у остальных на листе только покой), и его частота, как в игре (CLIP_MS).
 */
const HEROES: Record<HeroId, { name: string; looks: readonly LookInfo[]; rec: Look; model: (look: Look) => HeroModel; cell: number; row: number; fps: number }> = {
  mage: { name: 'Маг', looks: MAGE_LOOKS, rec: MAGE_RECOMMENDED, model: (l) => mageModel(l), cell: 186, row: 1, fps: 8000 / 1300 },
  assassin: { name: 'Ассасин', looks: ASSASSIN_LOOKS, rec: ASSASSIN_RECOMMENDED, model: (l) => assassinModel(l), cell: 182, row: 0, fps: 5 },
  archer: { name: 'Лучник', looks: ARCHER_LOOKS, rec: ARCHER_RECOMMENDED, model: (l) => archerModel(l), cell: 186, row: 0, fps: 5 },
};
const HERO_IDS = Object.keys(HEROES) as HeroId[];

const LOCS: Record<Loc, { name: string; foes: string[]; models: Record<string, Model> }> = {
  forest: { name: 'Лес', foes: ['goblin', 'cutthroat', 'wolf'], models: FOREST_MODELS },
  crypt: { name: 'Склеп', foes: ['skeleton_warrior', 'ghoul', 'mummy'], models: CRYPT_MODELS },
  caves: { name: 'Пещеры огня', foes: ['cultist', 'hellhound', 'imp'], models: CAVES_MODELS },
};
const GROUND = 282;
const HERO_X = 130;
const FOE_X = [380, 600, 823];

const state: { loc: Loc; hero: HeroId; pick: Record<HeroId, Pick> } = {
  loc: 'forest',
  hero: 'mage',
  pick: { mage: MAGE_RECOMMENDED, assassin: ASSASSIN_RECOMMENDED, archer: ARCHER_RECOMMENDED },
};

// ─── Наборы кадров ──────────────────────────────────────────────────────────

const REF_IMG = new Map<HeroId, HTMLImageElement>();

/** Рамка непрозрачных точек кадра листа: x0…x1, y0…y1 включительно. */
interface Box { x0: number; y0: number; x1: number; y1: number }

/** Кадр листа героя холстом: ряд из HEROES, `i`-й кадр. */
function refFrame(id: HeroId, i: number): HTMLCanvasElement {
  const { cell, row } = HEROES[id];
  const c = document.createElement('canvas');
  c.width = cell;
  c.height = cell;
  c.getContext('2d')!.drawImage(REF_IMG.get(id)!, i * cell, row * cell, cell, cell, 0, 0, cell, cell);
  return c;
}

function alphaBox(c: HTMLCanvasElement): Box {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  const b: Box = { x0: c.width, y0: c.height, x1: -1, y1: -1 };
  for (let j = 0; j < c.height; j++) for (let i = 0; i < c.width; i++) {
    if (d[(j * c.width + i) * 4 + 3] < 128) continue;
    b.x0 = Math.min(b.x0, i); b.x1 = Math.max(b.x1, i); b.y0 = Math.min(b.y0, j); b.y1 = Math.max(b.y1, j);
  }
  return b;
}

/**
 * Прежний рисованный лист: 8 кадров ряда стойки. Масштаб — как мерки лепки (рост фигуры первого кадра → рост героя
 * в игре, HERO_BODY_HEIGHT), опора — середина рамки фигуры и её низ (земля).
 */
function refSet(id: HeroId): ActorSet {
  const frames = Array.from({ length: 8 }, (_, i) => refFrame(id, i));
  const b = alphaBox(frames[0]);
  const k = HERO_BODY_HEIGHT[id] / (b.y1 + 1 - b.y0);
  const cell = HEROES[id].cell;
  const idle: Anim = { frames, fps: HEROES[id].fps, loop: true, hold: false };
  return {
    w: cell * k, h: cell * k, ax: ((b.x0 + b.x1 + 1) / 2) * k, ay: (b.y1 + 1) * k, smooth: true,
    has: (clip) => clip === 'idle',
    get: (clip) => (clip === 'idle' ? idle : undefined),
  };
}

const sets = new Map<string, ActorSet>();
/** Набор кадров по ключу: `mage:a` — облик лепки, `mage:ref` — прежний лист, `warrior` — герой из игры. Рисуется при первом запросе. */
function setOf(key: string): ActorSet {
  let set = sets.get(key);
  if (set) return set;
  const [id, look] = key.split(':') as [string, Pick | undefined];
  if (look === 'ref') set = refSet(id as HeroId);
  else if (look) set = heroSet(HEROES[id as HeroId].model(look), HERO_STYLE);
  else set = heroSet(id === 'warrior' ? warriorModel() : id === 'paladin' ? paladinModel() : berserkModel(), HERO_STYLE);
  sets.set(key, set);
  return set;
}
const pickKey = (id: HeroId, pick: Pick = state.pick[id]): string => `${id}:${pick}`;

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

/** Поле 960 × 320: фон локации, тонировка, бойцы — живые холсты общего цикла кадров. */
function field(loc: Loc, actors: Array<{ set: ActorSet; x: number }>): HTMLElement {
  tintVar(loc);
  const f = h('div', 'field');
  const bg = h('img', 'bg');
  bg.src = window.ASSETS.bg[loc];
  bg.alt = '';
  f.appendChild(bg);
  const filter = `url(#mv-tint-${loc})`;
  for (const a of actors) f.appendChild(new Actor(a.set, a.x, GROUND, filter).el);
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

/**
 * Окно на поле во всю ширину блока: кусок `cw × ch` (x от `left`, низ — чуть ниже земли), масштаб по ширине блока.
 * Сцена и отряд — так же, как кадр игры на экране.
 */
function fitWindow(host: HTMLElement, f: HTMLElement, left: number, cw: number, ch: number): void {
  const win = h('div', 'win');
  win.appendChild(f);
  host.replaceChildren(win);
  observe(host, () => {
    const k = host.clientWidth / cw;
    win.style.height = `${ch * k}px`;
    f.style.transform = `scale(${k}) translate(${-left}px, ${-(GROUND + 14 - ch)}px)`;
  });
}

/**
 * Крупный план: кусок поля 150 × 180 вокруг героя целым увеличением — ×2, как кадр игры на FullHD (пиксель 1,5 —
 * ровно три точки экрана). Не влезает в ширину плитки — ×1.
 */
const TW = 150, TH = 180;
function tile(host: HTMLElement, set: ActorSet): void {
  const f = field(state.loc, [{ set, x: HERO_X }]);
  const win = h('div', 'tile-win');
  win.appendChild(f);
  host.replaceChildren(win);
  observe(host, () => {
    const z = Math.max(1, Math.min(2, Math.floor(host.clientWidth / TW)));
    win.style.width = `${TW * z}px`;
    win.style.height = `${TH * z}px`;
    f.style.transform = `scale(${z}) translate(${-(HERO_X - TW / 2)}px, ${-(GROUND + 12 - TH)}px)`;
  });
}

// ─── Сверка силуэта ─────────────────────────────────────────────────────────

/**
 * Лист, пересчитанный в сетку лепки (пиксель 1,5), лепка (первый кадр покоя) и карта расхождений: красное — только на
 * листе, голубое — только в лепке. Масштаб листа — тот же, что у мерок (рост фигуры → HERO_BODY_HEIGHT), низ фигуры —
 * на земле модели; по горизонтали лист подвинут туда, где силуэты совпадают больше всего (у каждого лепщика свой
 * отступ x, а сверяется форма).
 */
function drawOverlay(id: HeroId): void {
  const host = document.querySelector<HTMLElement>(`[data-overlay="${id}"]`);
  if (!host) return;
  const pick = state.pick[id];
  const look: Look = pick === 'ref' ? HEROES[id].rec : pick;
  const m = HEROES[id].model(look);
  const p = new Painter(m, HERO_STYLE, 0);
  m.draw(p);
  const fig = p.finish();
  const d = HERO_STYLE.d, pad = m.pad ?? 80, G = m.ground;
  const sculptAt = (x: number, y: number): number[] | null => {
    const fi = Math.floor((x + pad) / d), fj = Math.floor((y + pad) / d), so = (fj * p.W + fi) * 4;
    return fi >= 0 && fj >= 0 && fi < p.W && fj < p.H && fig[so + 3] > 0 ? [fig[so], fig[so + 1], fig[so + 2]] : null;
  };
  // Рамка лепки в единицах поля.
  let sx0 = Infinity, sx1 = -Infinity, sy0 = Infinity;
  for (let j = 0; j < p.H; j++) for (let i = 0; i < p.W; i++) {
    if (fig[(j * p.W + i) * 4 + 3] === 0) continue;
    const x = i * d - pad, y = j * d - pad;
    sx0 = Math.min(sx0, x); sx1 = Math.max(sx1, x + d); sy0 = Math.min(sy0, y);
  }
  const rc = refFrame(id, 0);
  const ref = rc.getContext('2d')!.getImageData(0, 0, rc.width, rc.height).data;
  const b = alphaBox(rc);
  const k = HERO_BODY_HEIGHT[id] / (b.y1 + 1 - b.y0);
  const cell = HEROES[id].cell;
  const refAt = (x: number, y: number, dx: number): number[] | null => {
    const px = Math.floor(b.x0 + (x - dx) / k), py = Math.floor(b.y1 + 1 - (G - y) / k);
    const ro = (py * cell + px) * 4;
    return px >= 0 && py >= 0 && px < cell && py < cell && ref[ro + 3] > 127 ? [ref[ro], ref[ro + 1], ref[ro + 2]] : null;
  };
  // Сдвиг листа: левый край фигуры листа — в единицах поля; перебор в полосе ±30 от совпадения левых краёв.
  const refW = (b.x1 + 1 - b.x0) * k;
  const X0 = Math.floor(Math.min(sx0, sx0 - 30) - 6), X1 = Math.ceil(Math.max(sx1, sx0 + 30 + refW) + 6);
  const Y0 = Math.floor(Math.min(sy0, G - HERO_BODY_HEIGHT[id]) - 6), Y1 = G + 3;
  const cols = Math.round((X1 - X0) / d), rows = Math.round((Y1 - Y0) / d);
  let best = sx0, bestScore = -1;
  for (let dx = sx0 - 30; dx <= sx0 + 30; dx += d / 2) {
    let both = 0, any = 0;
    for (let j = 0; j < rows; j += 2) for (let i = 0; i < cols; i += 2) {
      const x = X0 + (i + 0.5) * d, y = Y0 + (j + 0.5) * d;
      const r = !!refAt(x, y, dx), s = !!sculptAt(x, y);
      if (r && s) both++;
      if (r || s) any++;
    }
    const score = any ? both / any : 0;
    if (score > bestScore) { bestScore = score; best = dx; }
  }
  const panels = [0, 1, 2].map(() => new ImageData(cols, rows));
  let onlyRef = 0, onlySculpt = 0, both = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = X0 + (i + 0.5) * d, y = Y0 + (j + 0.5) * d;
      const r = refAt(x, y, best), s2 = sculptAt(x, y);
      const grid = Math.round(x) % 10 === 0 || Math.round(y) % 10 === 0;
      const bg = grid ? [52, 48, 58] : [30, 27, 34];
      const diff = r && s2 ? [120, 116, 124] : r ? [220, 70, 70] : s2 ? [70, 196, 220] : bg;
      if (r && s2) both++; else if (r) onlyRef++; else if (s2) onlySculpt++;
      [r ?? bg, s2 ?? bg, diff].forEach((c, n) => {
        const o = (j * cols + i) * 4, data = panels[n].data;
        data[o] = c[0];
        data[o + 1] = c[1];
        data[o + 2] = c[2];
        data[o + 3] = 255;
      });
    }
  }
  const lookName = HEROES[id].looks.find((l) => l.id === look)?.name ?? look;
  const names = ['Лист в пикселе 1,5', `Лепка, облик ${look.toUpperCase()} «${lookName}»`, 'Расхождения'];
  const figs = panels.map((img, n) => {
    const f = h('figure');
    const c = h('canvas');
    c.width = cols;
    c.height = rows;
    c.getContext('2d')!.putImageData(img, 0, 0);
    c.style.width = `${cols * 2}px`;
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', names[n]);
    f.append(c, h('figcaption', '', names[n]));
    return f;
  });
  const total = both + onlyRef + onlySculpt;
  const pct = (v: number): string => `${Math.round((v / total) * 100)} %`;
  const sum = h('p', 'note overlay-sum');
  sum.innerHTML = `Совпадает <b>${pct(both)}</b> общей площади, только на листе — <b class="minus">${pct(onlyRef)}</b>, только в лепке — <b class="plus">${pct(onlySculpt)}</b>.`;
  host.replaceChildren(...figs, sum);
}

// ─── Отрисовка ──────────────────────────────────────────────────────────────

function toggle(group: HTMLElement, value: string): void {
  for (const b of group.querySelectorAll<HTMLButtonElement>('button[data-v]')) b.setAttribute('aria-pressed', String(b.dataset.v === value));
}

/** Сцена: выбранный герой в выбранном облике против трёх врагов локации. */
function drawScene(): void {
  const host = document.getElementById('scene')!;
  const actors = [{ set: setOf(pickKey(state.hero)), x: HERO_X }, ...LOCS[state.loc].foes.map((id, i) => ({ set: foeAnim(state.loc, id), x: FOE_X[i] }))];
  fitWindow(host, field(state.loc, actors), 0, 960, 320);
  toggle(document.getElementById('scene-hero')!, state.hero);
  toggle(document.getElementById('scene-loc')!, state.loc);
  const looks = document.getElementById('scene-look')!;
  looks.querySelectorAll('button').forEach((b) => b.remove());
  for (const v of ['ref', ...HEROES[state.hero].looks.map((l) => l.id)] as Pick[]) {
    const info = HEROES[state.hero].looks.find((l) => l.id === v);
    const b = h('button', '', info ? `${v.toUpperCase()} «${info.name}»` : 'Лист (было)');
    b.type = 'button';
    b.dataset.v = v;
    looks.appendChild(b);
  }
  toggle(looks, state.pick[state.hero]);
}

/**
 * Отряд: шесть героев на одном полу в порядке игры — Воин, Паладин и Берсерк из игры, трое новых в выбранных обликах.
 * Проверка стиля: один свет, один пиксель, один рост.
 */
const SQUAD: Array<{ key: string | HeroId; name: string }> = [
  { key: 'warrior', name: 'Воин' }, { key: 'mage', name: 'Маг' }, { key: 'assassin', name: 'Ассасин' },
  { key: 'paladin', name: 'Паладин' }, { key: 'berserk', name: 'Берсерк' }, { key: 'archer', name: 'Лучник' },
];
function drawSquad(): void {
  const host = document.getElementById('squad')!;
  const actors = SQUAD.map((s, i) => ({ set: setOf(s.key in HEROES ? pickKey(s.key as HeroId) : s.key), x: 78 + i * 161 }));
  fitWindow(host, field(state.loc, actors), 0, 960, 200);
  const cap = document.getElementById('squad-names')!;
  cap.replaceChildren(...SQUAD.map((s) => {
    const pick = s.key in HEROES ? state.pick[s.key as HeroId] : null;
    const look = pick && pick !== 'ref' ? HEROES[s.key as HeroId].looks.find((l) => l.id === pick) : null;
    const el = h('span', pick ? 'new' : '');
    el.append(h('b', '', s.name), h('span', '', pick === 'ref' ? 'лист' : look ? `${look.id.toUpperCase()} «${look.name}»` : 'в игре'));
    return el;
  }));
}

/** Карточки героя: прежний лист и три облика; кнопка карточки ставит облик в сцену и отряд. */
function drawCards(id: HeroId, jobs: Array<() => void>): void {
  const host = document.querySelector<HTMLElement>(`[data-cards="${id}"]`)!;
  host.replaceChildren();
  const hero = HEROES[id];
  const entries: Array<{ pick: Pick; name: string; note: string }> = [
    { pick: 'ref', name: 'Лист', note: 'Прежний рисованный лист генератора — референс мерок, силуэта и палитры.' },
    ...hero.looks.map((l) => ({ pick: l.id, name: l.name, note: l.note })),
  ];
  for (const e of entries) {
    const card = h('article', 'look-card');
    card.dataset.pick = e.pick;
    const view = h('div', 'look-view', 'рисую кадры…');
    const head = h('div', 'look-head');
    head.append(h('span', 'look-letter', e.pick === 'ref' ? '—' : e.pick.toUpperCase()), h('b', '', e.name));
    if (e.pick === hero.rec) head.appendChild(h('span', 'badge', 'рекомендует лепщик'));
    const btn = h('button', 'pick', e.pick === 'ref' ? 'Лист в сцену' : 'В сцену и отряд');
    btn.type = 'button';
    btn.addEventListener('click', () => choose(id, e.pick));
    card.append(view, head, h('p', '', e.note), btn);
    host.appendChild(card);
    jobs.push(() => tile(view, setOf(pickKey(id, e.pick))));
  }
  markCards(id);
}

function markCards(id: HeroId): void {
  for (const card of document.querySelectorAll<HTMLElement>(`[data-cards="${id}"] .look-card`)) {
    const on = card.dataset.pick === state.pick[id];
    card.classList.toggle('on', on);
    card.querySelector('button.pick')?.setAttribute('aria-pressed', String(on));
  }
}

function choose(id: HeroId, pick: Pick): void {
  state.pick[id] = pick;
  state.hero = id;
  markCards(id);
  drawScene();
  drawSquad();
  if (pick !== 'ref') drawOverlay(id);
}

/** Очередь плиток: рисуются по одной, чтобы страница не вставала на кадрах. */
let tileRun = 0;
function queue(jobs: Array<() => void>): void {
  const run = ++tileRun;
  let i = 0;
  const next = (): void => {
    if (run !== tileRun) return;
    const job = jobs[i++];
    if (!job) return;
    job();
    window.setTimeout(next, 30);
  };
  window.setTimeout(next, 60);
}

/** Всё, что зависит от локации: сцена, отряд, плитки и сверка. Сначала — то, что видно первым. */
function drawAll(): void {
  const jobs: Array<() => void> = [drawScene, drawSquad];
  for (const id of HERO_IDS) drawCards(id, jobs);
  for (const id of HERO_IDS) jobs.push(() => drawOverlay(id));
  queue(jobs);
}

/** Прежние портреты рядом с заголовком героя — характер и палитра. */
function drawPortraits(): void {
  for (const id of HERO_IDS) {
    const host = document.querySelector<HTMLElement>(`[data-portrait="${id}"]`);
    if (!host || host.firstChild) continue;
    const img = h('img');
    img.src = window.ASSETS.avatars[id];
    img.width = img.height = 112;
    img.alt = `${HEROES[id].name}, прежний рисованный портрет`;
    host.appendChild(img);
  }
}

function start(): void {
  const on = (id: string, fn: (v: string) => void): void => {
    document.getElementById(id)!.addEventListener('click', (e) => {
      const v = (e.target as HTMLElement).closest<HTMLElement>('[data-v]')?.dataset.v;
      if (v) fn(v);
    });
  };
  on('scene-hero', (v) => {
    state.hero = v as HeroId;
    drawScene();
  });
  on('scene-look', (v) => choose(state.hero, v as Pick));
  on('scene-loc', (v) => {
    state.loc = v as Loc;
    drawAll();
  });
  on('speed', (v) => {
    setSpeed(Number(v));
    toggle(document.getElementById('speed')!, v);
  });
  toggle(document.getElementById('speed')!, '1');
  drawPortraits();
  // Сначала показать текст, потом рисовать: двенадцать героев по 24 кадра — несколько секунд работы главного потока.
  document.getElementById('scene')!.textContent = 'рисую кадры…';
  document.getElementById('squad')!.textContent = 'рисую кадры…';
  window.requestAnimationFrame(() => window.setTimeout(drawAll, 60));
}

function boot(): void {
  let left = HERO_IDS.length;
  for (const id of HERO_IDS) {
    const img = new Image();
    img.onload = () => {
      REF_IMG.set(id, img);
      if (--left === 0) start();
    };
    img.src = window.ASSETS.refs[id];
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
