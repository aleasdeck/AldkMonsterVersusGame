// Страница обсуждения «Лепка троих» (docs/lepka-geroev.md, шаг 4 — клипы): Маг, Ассасин и Лучник в облике A (выбор
// пользователя), девять общих клипов, у удара, сильного удара и лечения — по два варианта; сцена боя с врагами, отряд из
// шести героев на одном полу. Модели — src/ui/heroes/{mage,assassin,archer}.ts (в игру ещё не входят: `<герой>Model(opts)`),
// Воин, Паладин и Берсерк — из игры, враги и фоны — тоже, тонировка — та же, что в бою (tint.ts).
// Сборка — build.mjs --hero trio. Облики B и C и прежняя сверка силуэта — в истории ветки.
import type { Model } from '../../src/ui/mobs/pixel';
import { FOREST_MODELS } from '../../src/ui/mobs/forest';
import { CRYPT_MODELS } from '../../src/ui/mobs/crypt';
import { CAVES_MODELS } from '../../src/ui/mobs/caves';
import { tintVar } from '../../src/ui/tint';
import { mageModel, MAGE_CLIP_NOTES, MAGE_REC_VARIANTS, MAGE_VARIANTS } from '../../src/ui/heroes/mage';
import { assassinModel, ASSASSIN_CLIP_NOTES, ASSASSIN_REC_VARIANTS, ASSASSIN_VARIANTS } from '../../src/ui/heroes/assassin';
import { archerModel, ARCHER_CLIP_NOTES, ARCHER_REC_VARIANTS, ARCHER_VARIANTS } from '../../src/ui/heroes/archer';
import { warriorModel } from '../../src/ui/heroes/warrior';
import { paladinModel } from '../../src/ui/heroes/paladin';
import { berserkModel } from '../../src/ui/heroes/berserk';
import type { HeroModel } from '../../src/ui/heroes/model';
import { HERO_CLIPS, HERO_STYLE, type SculptClip } from '../../src/ui/heroes/clips';
import { HERO_BODY_HEIGHT } from '../../src/data/characterSizes';
import { Actor, heroSet, later, mobSet, setSpeed, type Anim, type ActorSet } from './anim';

type Loc = 'forest' | 'crypt' | 'caves';
type HeroId = 'mage' | 'assassin' | 'archer';
type V = 'a' | 'b';
type Variants = Partial<Record<SculptClip, V>>;
interface VariantInfo { id: V; name: string; note: string }

/** Фоны, прежние листы и портреты — data URI из build.mjs. Свой тип, а не `Window.ASSETS`: у страниц одиночных героев он другой. */
const ASSETS = (window as unknown as { ASSETS: { bg: Record<Loc, string>; refs: Record<HeroId, string>; avatars: Record<HeroId, string> } }).ASSETS;

/** Общие клипы по порядку страницы (покой — в сцене и отряде). */
const COMMON: SculptClip[] = ['attack', 'heavy', 'power', 'heal', 'buff', 'block', 'hurt', 'death'];

/**
 * Герои страницы: модель с вариантами клипов и ростом, варианты и рекомендация аниматора, подписи клипов — из файла
 * модели. Прежний лист: ячейка, рост фигуры в игре (`body` из HERO_SHEETS) и ряды клипов — у Мага на листе семь рядов,
 * у остальных только покой.
 */
const HEROES: Record<HeroId, {
  name: string;
  model: (v: Variants, height: number) => HeroModel;
  variants: Partial<Record<SculptClip, readonly VariantInfo[]>>;
  rec: Variants;
  notes: Partial<Record<SculptClip, string>>;
  cell: number;
  body: number;
  rows: Partial<Record<SculptClip, number>>;
}> = {
  mage: {
    name: 'Маг', model: (variants, height) => mageModel({ variants, height }), variants: MAGE_VARIANTS, rec: MAGE_REC_VARIANTS, notes: MAGE_CLIP_NOTES,
    cell: 186, body: 134, rows: { idle: 1, attack: 2, heavy: 2, power: 3, heal: 3, buff: 3, block: 4, hurt: 5, death: 6 },
  },
  assassin: { name: 'Ассасин', model: (variants) => assassinModel({ variants }), variants: ASSASSIN_VARIANTS, rec: ASSASSIN_REC_VARIANTS, notes: ASSASSIN_CLIP_NOTES, cell: 182, body: 166, rows: { idle: 0 } },
  archer: { name: 'Лучник', model: (variants) => archerModel({ variants }), variants: ARCHER_VARIANTS, rec: ARCHER_REC_VARIANTS, notes: ARCHER_CLIP_NOTES, cell: 186, body: 170, rows: { idle: 0 } },
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

/**
 * Что сейчас на странице: локация, герой сцены, лепка или прежний лист, выбранные варианты клипов (по умолчанию —
 * рекомендация аниматора) и рост Мага: 120 по таблице, 106 — площадь Воина, 98 — как прежний лист стоял в бою.
 */
const state: { loc: Loc; hero: HeroId; ref: boolean; vars: Record<HeroId, Variants>; mageH: number } = {
  loc: 'forest',
  hero: 'mage',
  ref: false,
  vars: { mage: { ...MAGE_REC_VARIANTS }, assassin: { ...ASSASSIN_REC_VARIANTS }, archer: { ...ARCHER_REC_VARIANTS } },
  mageH: 120,
};

// ─── Наборы кадров ──────────────────────────────────────────────────────────

const REF_IMG = new Map<HeroId, HTMLImageElement>();

/** Длительность рядов прежнего листа в игре, мс (CLIP_MS в heroSprite.ts). */
const REF_MS: Partial<Record<SculptClip, number>> = { idle: 1300, attack: 520, heavy: 640, power: 560, heal: 800, buff: 560, block: 560, hurt: 400, death: 1000 };

/**
 * Прежний рисованный лист в масштабе игры (`body` → HERO_BODY_HEIGHT): 8 кадров на ряд, опора — середина рамки фигуры
 * первого кадра стойки и её низ. У Мага клипы — ряды листа, как их играла игра; у остальных только стойка.
 */
function refSet(id: HeroId): ActorSet {
  const { cell, body, rows } = HEROES[id];
  const img = REF_IMG.get(id)!;
  const frame = (row: number, i: number): HTMLCanvasElement => {
    const c = document.createElement('canvas');
    c.width = cell;
    c.height = cell;
    c.getContext('2d')!.drawImage(img, i * cell, row * cell, cell, cell, 0, 0, cell, cell);
    return c;
  };
  const first = frame(rows.idle ?? 0, 0);
  const d = first.getContext('2d')!.getImageData(0, 0, cell, cell).data;
  let x0 = cell, x1 = -1, y1 = -1;
  for (let j = 0; j < cell; j++) for (let i = 0; i < cell; i++) {
    if (d[(j * cell + i) * 4 + 3] < 128) continue;
    x0 = Math.min(x0, i); x1 = Math.max(x1, i); y1 = Math.max(y1, j);
  }
  const k = HERO_BODY_HEIGHT[id] / body;
  const cache = new Map<string, Anim>();
  return {
    w: cell * k, h: cell * k, ax: ((x0 + x1 + 1) / 2) * k, ay: (y1 + 1) * k, smooth: true,
    has: (clip) => cache.has(clip),
    get(clip) {
      const row = rows[clip as SculptClip];
      if (row === undefined) return undefined;
      let a = cache.get(clip);
      if (!a) {
        const ms = REF_MS[clip as SculptClip] ?? 600;
        a = { frames: Array.from({ length: 8 }, (_, i) => frame(row, i)), fps: 8000 / ms, loop: clip === 'idle', hold: clip === 'death', contact: clip === 'block' ? 3 : 4 };
        cache.set(clip, a);
      }
      return a;
    },
  };
}

/** Полный набор вариантов героя: рекомендация аниматора, поверх — выбранное. */
const fullVars = (id: HeroId, v: Variants): Variants => ({ ...HEROES[id].rec, ...v });
const varKey = (v: Variants): string => COMMON.filter((c) => v[c]).map((c) => `${c}=${v[c]}`).join(',');
const heightOf = (id: HeroId): number => (id === 'mage' ? state.mageH : HERO_BODY_HEIGHT[id]);

const sets = new Map<string, ActorSet>();
function cached(key: string, make: () => ActorSet): ActorSet {
  let set = sets.get(key);
  if (!set) sets.set(key, (set = make()));
  return set;
}
/** Лепка героя с вариантами клипов: одинаковые наборы вариантов делят кадры. */
function modelSet(id: HeroId, v: Variants = state.vars[id]): ActorSet {
  const full = fullVars(id, v), height = heightOf(id);
  return cached(`${id}|${varKey(full)}|${height}`, () => heroSet(HEROES[id].model(full, height), HERO_STYLE));
}
const refOf = (id: HeroId): ActorSet => cached(`${id}|ref`, () => refSet(id));
const readySet = (id: 'warrior' | 'paladin' | 'berserk'): ActorSet =>
  cached(id, () => heroSet(id === 'warrior' ? warriorModel() : id === 'paladin' ? paladinModel() : berserkModel(), HERO_STYLE));
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

interface Scene { hero: Actor; foes: Actor[] }

/** Поле 960 × 320: фон локации, тонировка, враги (если нужны), лишние бойцы и герой на HERO_X — живые холсты общего цикла. */
function field(loc: Loc, hero: ActorSet | null, foes: boolean, extra: Array<{ set: ActorSet; x: number }> = []): { f: HTMLElement; scene: Scene | null } {
  tintVar(loc);
  const f = h('div', 'field');
  const bg = h('img', 'bg');
  bg.src = ASSETS.bg[loc];
  bg.alt = '';
  f.appendChild(bg);
  const filter = `url(#mv-tint-${loc})`;
  const foeActors = foes ? LOCS[loc].foes.map((id, i) => new Actor(foeAnim(loc, id), FOE_X[i], GROUND, filter)) : [];
  for (const a of foeActors) f.appendChild(a.el);
  for (const a of extra) f.appendChild(new Actor(a.set, a.x, GROUND, filter).el);
  if (!hero) return { f, scene: null };
  const heroActor = new Actor(hero, HERO_X, GROUND, filter);
  f.appendChild(heroActor.el);
  return { f, scene: { hero: heroActor, foes: foeActors } };
}

const observers = new WeakMap<HTMLElement, ResizeObserver>();
function observe(host: HTMLElement, fit: () => void): void {
  observers.get(host)?.disconnect();
  const ro = new ResizeObserver(fit);
  ro.observe(host);
  observers.set(host, ro);
  fit();
}

/** Окно на поле во всю ширину блока: кусок `cw × ch`, низ — чуть ниже земли (но не ниже кадра), масштаб по ширине блока. */
function fitWindow(host: HTMLElement, f: HTMLElement, cw: number, ch: number): void {
  const win = h('div', 'win');
  win.appendChild(f);
  host.replaceChildren(win);
  const top = Math.max(0, Math.min(320 - ch, GROUND + 14 - ch));
  observe(host, () => {
    const k = host.clientWidth / cw;
    win.style.height = `${ch * k}px`;
    f.style.transform = `scale(${k}) translate(0px, ${-top}px)`;
  });
}

/** Момент контакта клипа от его начала, мс. */
function contactMs(set: ActorSet, clip: string): number {
  const a = set.get(clip);
  return a?.contact !== undefined ? (a.contact * 1000) / a.fps : 0;
}

/**
 * Сыграть клип героя так, как его покажет игра (app.ts): удар и приём — враг вздрагивает в кадр контакта героя; блок,
 * урон и смерть — сначала бьёт враг, и блок или отдача приходятся на его контакт.
 */
function perform(sc: Scene, clip: SculptClip): void {
  const foe = sc.foes[0];
  const hero = sc.hero;
  const foeHit = foe ? contactMs(foe.set, 'attack') : 0;
  switch (clip) {
    case 'attack': case 'heavy': case 'power':
      hero.play(clip);
      if (foe) later(contactMs(hero.set, clip), () => foe.play('hurt'));
      break;
    case 'block':
      if (!foe) { hero.play(clip); break; }
      foe.play('attack');
      later(Math.max(0, foeHit - contactMs(hero.set, clip)), () => hero.play(clip));
      break;
    case 'hurt': case 'death':
      if (!foe) { hero.play(clip); break; }
      foe.play('attack');
      later(foeHit, () => hero.play(clip));
      break;
    default:
      hero.play(clip);
  }
}

/**
 * Плитка клипа: кусок поля 240 × 240 вокруг героя, клип повторяется с паузой в покое. ×2, как кадр игры на FullHD
 * (пиксель 1,5 — ровно три точки экрана), если влезает в ширину, иначе ×1.
 */
const TW = 240, TH = 240;
function animTile(host: HTMLElement, set: ActorSet, clip: SculptClip): void {
  const { f, scene } = field(state.loc, set, false);
  scene!.hero.auto = { clip, gap: 700 };
  scene!.hero.play(clip);
  const win = h('div', 'tile-win');
  win.appendChild(f);
  host.replaceChildren(win);
  observe(host, () => {
    const z = Math.max(1, Math.min(2, Math.floor(host.clientWidth / TW)));
    win.style.width = `${TW * z}px`;
    win.style.height = `${TH * z}px`;
    f.style.transform = `scale(${z}) translate(${-(HERO_X - 100)}px, ${-(GROUND + 14 - TH)}px)`;
  });
}

// ─── Отрисовка ──────────────────────────────────────────────────────────────

function toggle(group: HTMLElement, value: string): void {
  for (const b of group.querySelectorAll<HTMLButtonElement>('button[data-v]')) b.setAttribute('aria-pressed', String(b.dataset.v === value));
}
function button(text: string, v: string): HTMLButtonElement {
  const b = h('button', '', text);
  b.type = 'button';
  b.dataset.v = v;
  return b;
}

/** Подпись клипа: кадры, частота, длительность, контакт. */
function clipMeta(id: SculptClip): string {
  const spec = HERO_CLIPS[id];
  return `${spec.frames} × ${spec.fps} к/с · ${Math.round((spec.frames * 1000) / spec.fps)} мс${spec.contact !== undefined ? ` · контакт ${spec.contact + 1}-й кадр` : ''}${spec.hold ? ' · держит последний кадр' : ''}`;
}

let scene: Scene | null = null;
/** Сцена: выбранный герой (лепка с выбранными вариантами или прежний лист) против трёх врагов локации. */
function drawScene(): void {
  const set = state.ref ? refOf(state.hero) : modelSet(state.hero);
  const live = field(state.loc, set, true);
  scene = live.scene;
  fitWindow(document.getElementById('scene')!, live.f, 960, 320);
  toggle(document.getElementById('scene-hero')!, state.hero);
  toggle(document.getElementById('scene-src')!, state.ref ? 'ref' : 'sculpt');
  toggle(document.getElementById('scene-loc')!, state.loc);
  // Варианты героя сцены: группа кнопок на клип с вариантами.
  const vars = document.getElementById('scene-vars')!;
  vars.replaceChildren();
  const hero = HEROES[state.hero];
  for (const clip of COMMON) {
    const list = hero.variants[clip];
    if (!list?.length) continue;
    const g = h('span', 'tog');
    g.setAttribute('role', 'group');
    g.setAttribute('aria-label', `Вариант: ${HERO_CLIPS[clip].name}`);
    g.dataset.clip = clip;
    g.append(h('span', 'tog-label', HERO_CLIPS[clip].name));
    for (const v of list) g.appendChild(button(`${v.id.toUpperCase()} «${v.name}»`, v.id));
    toggle(g, fullVars(state.hero, state.vars[state.hero])[clip] ?? 'a');
    vars.appendChild(g);
  }
  vars.classList.toggle('muted', state.ref);
  // Клипы, которых у прежнего листа нет, приглушены.
  for (const b of document.querySelectorAll<HTMLButtonElement>('#scene-clips button[data-v]')) b.classList.toggle('off', !set.get(b.dataset.v!));
}

/**
 * Отряд: шесть героев на одном полу в порядке выбора героя — Воин, Паладин и Берсерк из игры, трое новых в облике A.
 * Проверка стиля: один свет, один пиксель, один рост.
 */
const SQUAD: Array<{ key: HeroId | 'warrior' | 'paladin' | 'berserk'; name: string }> = [
  { key: 'warrior', name: 'Воин' }, { key: 'mage', name: 'Маг' }, { key: 'assassin', name: 'Ассасин' },
  { key: 'paladin', name: 'Паладин' }, { key: 'berserk', name: 'Берсерк' }, { key: 'archer', name: 'Лучник' },
];
function drawSquad(): void {
  const host = document.getElementById('squad')!;
  const extra = SQUAD.map((s, i) => ({ set: s.key in HEROES ? modelSet(s.key as HeroId) : readySet(s.key as 'warrior'), x: 78 + i * 161 }));
  fitWindow(host, field(state.loc, null, false, extra).f, 960, 200);
  document.getElementById('squad-names')!.replaceChildren(...SQUAD.map((s) => {
    const el = h('span', s.key in HEROES ? 'new' : '');
    el.append(h('b', '', s.name), h('span', '', s.key === 'mage' ? `облик A, рост ${state.mageH}` : s.key in HEROES ? 'облик A' : 'в игре'));
    return el;
  }));
}

/** Карточка плитки: клип по кругу, шапка с именем и числами, подпись. */
function tileCard(jobs: Array<() => void>, set: () => ActorSet, clip: SculptClip, title: string, note: string, badge = ''): HTMLElement {
  const card = h('article', 'clip-card');
  const view = h('div', 'clip-view', 'рисую кадры…');
  const head = h('div', 'clip-head');
  head.append(h('b', '', title));
  if (badge) head.append(h('span', 'badge', badge));
  head.append(h('span', 'mono', clipMeta(clip)));
  card.append(view, head);
  if (note) card.append(h('p', '', note));
  jobs.push(() => animTile(view, set(), clip));
  return card;
}

/** Раздел героя: пары вариантов (удар, сильный удар, лечение) и остальные клипы. */
function drawHero(id: HeroId, jobs: Array<() => void>): void {
  const hero = HEROES[id];
  const pairs = document.querySelector<HTMLElement>(`[data-pairs="${id}"]`)!;
  pairs.replaceChildren();
  const rest = document.querySelector<HTMLElement>(`[data-clips="${id}"]`)!;
  rest.replaceChildren();
  for (const clip of COMMON) {
    const list = hero.variants[clip];
    if (list?.length) {
      const row = h('div', 'pair');
      row.append(h('h4', '', HERO_CLIPS[clip].name));
      if (hero.notes[clip]) row.append(h('p', 'note prose', hero.notes[clip]!));
      const grid = h('div', 'pair-grid');
      for (const v of list) {
        grid.appendChild(tileCard(jobs, () => modelSet(id, { ...state.vars[id], [clip]: v.id }), clip, `${v.id.toUpperCase()} «${v.name}»`, v.note, hero.rec[clip] === v.id ? 'рекомендует аниматор' : ''));
      }
      row.append(grid);
      pairs.appendChild(row);
    } else {
      rest.appendChild(tileCard(jobs, () => modelSet(id), clip, HERO_CLIPS[clip].name, hero.notes[clip] ?? ''));
    }
  }
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

/** Всё, что зависит от локации: сцена, отряд и плитки. Сначала — то, что видно первым. */
function drawAll(): void {
  const jobs: Array<() => void> = [drawScene, drawSquad];
  for (const id of HERO_IDS) drawHero(id, jobs);
  queue(jobs);
}

/** Прежние портреты рядом с заголовком героя — характер и палитра. */
function drawPortraits(): void {
  for (const id of HERO_IDS) {
    const host = document.querySelector<HTMLElement>(`[data-portrait="${id}"]`);
    if (!host || host.firstChild) continue;
    const img = h('img');
    img.src = ASSETS.avatars[id];
    img.width = img.height = 112;
    img.alt = `${HEROES[id].name}, прежний рисованный портрет`;
    host.appendChild(img);
  }
}

function start(): void {
  const on = (id: string, fn: (v: string, el: HTMLElement) => void): void => {
    document.getElementById(id)!.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-v]');
      if (el?.dataset.v) fn(el.dataset.v, el);
    });
  };
  on('scene-hero', (v) => {
    state.hero = v as HeroId;
    drawScene();
  });
  on('scene-src', (v) => {
    state.ref = v === 'ref';
    drawScene();
  });
  on('scene-vars', (v, el) => {
    const clip = el.closest<HTMLElement>('[data-clip]')?.dataset.clip as SculptClip | undefined;
    if (!clip) return;
    state.vars[state.hero] = { ...state.vars[state.hero], [clip]: v as V };
    drawScene();
    if (scene) perform(scene, clip);
  });
  const clipGroup = document.getElementById('scene-clips')!;
  for (const id of COMMON) clipGroup.appendChild(button(HERO_CLIPS[id].name, id));
  on('scene-clips', (v) => {
    if (scene) perform(scene, v as SculptClip);
  });
  on('scene-loc', (v) => {
    state.loc = v as Loc;
    drawAll();
  });
  // Рост Мага — две группы кнопок (в отряде и в разделе Мага), обе с `data-mageh`.
  for (const g of document.querySelectorAll<HTMLElement>('[data-mageh]')) {
    g.addEventListener('click', (e) => {
      const v = (e.target as HTMLElement).closest<HTMLElement>('[data-v]')?.dataset.v;
      if (!v) return;
      state.mageH = Number(v);
      for (const other of document.querySelectorAll<HTMLElement>('[data-mageh]')) toggle(other, v);
      const jobs: Array<() => void> = [drawScene, drawSquad];
      drawHero('mage', jobs);
      queue(jobs);
    });
    toggle(g, String(state.mageH));
  }
  on('speed', (v) => {
    setSpeed(Number(v));
    toggle(document.getElementById('speed')!, v);
  });
  toggle(document.getElementById('speed')!, '1');
  drawPortraits();
  // Сначала показать текст, потом рисовать: шесть героев по 24 кадра покоя и десятки клипов — секунды работы потока.
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
    img.src = ASSETS.refs[id];
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
