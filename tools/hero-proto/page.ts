// Страница обсуждения «Лепка Воина»: модель и клипы из игры (src/ui/heroes) рядом с прежним рисованным листом —
// бой на поле с реакцией врага, клипы по одному, сравнение с референсом. Враги и фоны — из игры; тонировка — та же,
// что в бою (tint.ts). Облики, шлемы и оружие выбраны раньше — их варианты лежат в истории ветки.
import { Painter, type Model, type Style } from '../../src/ui/mobs/pixel';
import { FOREST_MODELS } from '../../src/ui/mobs/forest';
import { CRYPT_MODELS } from '../../src/ui/mobs/crypt';
import { CAVES_MODELS } from '../../src/ui/mobs/caves';
import { tintVar } from '../../src/ui/tint';
import { warriorModel } from '../../src/ui/heroes/warrior';
import { HERO_CLIPS, HERO_STYLE, type SculptClip } from '../../src/ui/heroes/clips';
import { Actor, heroSet, later, mobSet, refSet, setSpeed, type ActorSet } from './anim';

type Loc = 'forest' | 'crypt' | 'caves';
type Look = 'ref' | 'sculpt';

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
const MODEL = warriorModel();

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

/** Прежний рисованный Воин: первый кадр ряда боевой стойки, масштаб как был в игре (фигура 107 → 128). */
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

let REF: Fig;
let REF_IMG: HTMLImageElement;
let SCULPT: Fig;

// ─── Поле ───────────────────────────────────────────────────────────────────

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
}

/** Поле боя 960 × 320: фон локации и герой в своей точке, тонировка локации. */
function field(loc: Loc, hero: Fig): HTMLElement {
  tintVar(loc);
  const f = h('div', 'field');
  const bg = h('img', 'bg');
  bg.src = window.ASSETS.bg[loc];
  bg.alt = '';
  f.appendChild(bg);
  f.appendChild(figEl(hero, HERO_X, loc));
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
function tile(host: HTMLElement, loc: Loc, hero: Fig): void {
  const CW = 150, CH = 190;
  const f = field(loc, hero);
  const win = h('div', 'tile-win');
  win.appendChild(f);
  host.replaceChildren(win);
  const fit = (): void => {
    const z = Math.max(1, Math.min(2, Math.floor(host.clientWidth / CW)));
    win.style.width = `${CW * z}px`;
    win.style.height = `${CH * z}px`;
    f.style.transform = `scale(${z}) translate(${-(HERO_X - CW / 2)}px, ${-(GROUND + 16 - CH)}px)`;
  };
  fit();
  new ResizeObserver(fit).observe(host);
}

function toggle(group: HTMLElement, value: string): void {
  for (const b of group.querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-pressed', String(b.dataset.v === value));
}

// ─── Анимация: бой на поле и клипы по одному ───────────────────────────────

const sets = new Map<Look, ActorSet>();
/** Набор клипов героя: прежний лист или лепка из игры. */
function heroAnim(look: Look): ActorSet {
  let set = sets.get(look);
  if (!set) sets.set(look, (set = look === 'ref' ? refSet(REF_IMG) : heroSet(MODEL, HERO_STYLE)));
  return set;
}
const foeSets = new Map<string, ActorSet>();
function foeAnim(loc: Loc, id: string): ActorSet {
  let set = foeSets.get(id);
  if (!set) foeSets.set(id, (set = mobSet(LOCS[loc].models[id])));
  return set;
}

interface Scene { hero: Actor; foes: Actor[] }

/** Поле с живыми бойцами: фон, враги и герой — холсты, которые листает общий цикл кадров. */
function liveField(loc: Loc, hero: ActorSet, foes: boolean): { f: HTMLElement; scene: Scene } {
  tintVar(loc);
  const f = h('div', 'field');
  const bg = h('img', 'bg');
  bg.src = window.ASSETS.bg[loc];
  bg.alt = '';
  f.appendChild(bg);
  const filter = `url(#mv-tint-${loc})`;
  const foeActors = foes ? LOCS[loc].foes.map((id, i) => new Actor(foeAnim(loc, id), FOE_X[i], GROUND, filter)) : [];
  for (const a of foeActors) f.appendChild(a.el);
  const heroActor = new Actor(hero, HERO_X, GROUND, filter);
  f.appendChild(heroActor.el);
  return { f, scene: { hero: heroActor, foes: foeActors } };
}

/** Момент контакта клипа от его начала, мс. */
function contactMs(set: ActorSet, clip: string): number {
  const a = set.get(clip);
  return a?.contact !== undefined ? (a.contact * 1000) / a.fps : 0;
}

/**
 * Сыграть клип героя в бою так, как его покажет игра (app.ts): удар — враг вздрагивает в кадр контакта героя;
 * блок, урон, смерть и Ответный удар — сначала бьёт враг, и удар о щит или отдача приходятся на его контакт.
 */
function perform(sc: Scene, clip: SculptClip): void {
  const foe = sc.foes[0];
  const hero = sc.hero;
  const foeHit = foe ? contactMs(foe.set, 'attack') : 0;
  switch (clip) {
    case 'attack': case 'heavy': case 'bash': case 'power':
      hero.play(clip);
      if (foe) later(contactMs(hero.set, clip), () => foe.play('hurt'));
      break;
    case 'block': case 'riposte': {
      // Удар о щит: у блока — кадр контакта, у Ответного удара — второй кадр (искры), ответ — его кадр контакта.
      const shieldAt = clip === 'block' ? contactMs(hero.set, clip) : (1000 / (hero.set.get(clip)?.fps ?? 12));
      if (!foe) { hero.play(clip); break; }
      foe.play('attack');
      later(Math.max(0, foeHit - shieldAt), () => hero.play(clip));
      if (clip === 'riposte') later(Math.max(0, foeHit - shieldAt) + contactMs(hero.set, clip), () => foe.play('hurt'));
      break;
    }
    case 'hurt': case 'death':
      if (!foe) { hero.play(clip); break; }
      foe.play('attack');
      later(foeHit, () => hero.play(clip));
      break;
    default:
      hero.play(clip);
  }
}

/** Плитка клипа: кусок поля 240 × 240 вокруг героя, клип повторяется с паузой в покое. */
function animTile(host: HTMLElement, loc: Loc, set: ActorSet, clip: SculptClip): void {
  const CW = 240, CH = 240;
  const { f, scene } = liveField(loc, set, false);
  scene.hero.auto = { clip, gap: 700 };
  scene.hero.play(clip);
  const win = h('div', 'tile-win');
  win.appendChild(f);
  host.replaceChildren(win);
  const fit = (): void => {
    const z = Math.max(1, Math.min(2, Math.floor(host.clientWidth / CW)));
    win.style.width = `${CW * z}px`;
    win.style.height = `${CH * z}px`;
    f.style.transform = `scale(${z}) translate(${-(HERO_X - 110)}px, ${-(GROUND + 18 - CH)}px)`;
  };
  fit();
  new ResizeObserver(fit).observe(host);
}

function start(): void {
  let look: Look = 'sculpt';
  let loc: Loc = 'forest';
  const lookGroup = document.getElementById('scene-look')!;
  const locGroup = document.getElementById('scene-loc')!;
  const stage = document.getElementById('scene')!;
  const pick = (e: Event): string | undefined => (e.target as HTMLElement).closest('button')?.dataset.v;
  let scene: Scene | null = null;
  const drawScene = (): void => {
    const live = liveField(loc, heroAnim(look), true);
    scene = live.scene;
    fitStage(stage, live.f);
    toggle(lookGroup, look);
    toggle(locGroup, loc);
  };
  // Кнопки клипов под полем: клип героя с реакцией первого врага.
  const clipGroup = document.getElementById('scene-clips')!;
  for (const [id, spec] of Object.entries(HERO_CLIPS) as Array<[SculptClip, (typeof HERO_CLIPS)[SculptClip]]>) {
    if (id === 'idle') continue;
    const b = h('button', spec.own ? 'clip own' : 'clip', spec.name);
    b.type = 'button';
    b.dataset.v = id;
    clipGroup.appendChild(b);
  }
  clipGroup.addEventListener('click', (e) => {
    const v = pick(e) as SculptClip | undefined;
    if (v && scene) perform(scene, v);
  });
  const speedGroup = document.getElementById('speed')!;
  speedGroup.addEventListener('click', (e) => {
    const v = pick(e);
    if (!v) return;
    setSpeed(Number(v));
    toggle(speedGroup, v);
  });
  toggle(speedGroup, '1');
  // Карточки клипов: рисуются по одной, чтобы страница не вставала на время отрисовки всех кадров.
  const clipsHost = document.getElementById('clips')!;
  const drawClips = (): void => {
    const set = heroAnim('sculpt');
    const ids = (Object.keys(HERO_CLIPS) as SculptClip[]).filter((c) => c !== 'idle');
    clipsHost.replaceChildren();
    const cards = ids.map((id) => {
      const spec = HERO_CLIPS[id];
      const card = h('article', spec.own ? 'clip-card own' : 'clip-card');
      const view = h('div', 'clip-view');
      view.textContent = 'рисую кадры…';
      const head = h('div', 'clip-head');
      head.append(h('b', '', spec.name), h('span', 'mono', `${spec.frames} × ${spec.fps} к/с · ${Math.round((spec.frames * 1000) / spec.fps)} мс${spec.contact !== undefined ? ` · контакт ${spec.contact + 1}-й, ${Math.round((spec.contact * 1000) / spec.fps)} мс` : ''}${spec.hold ? ' · держит последний кадр' : ''}`));
      card.append(view, head, h('p', '', spec.when));
      clipsHost.appendChild(card);
      return { id, view };
    });
    let i = 0;
    const next = (): void => {
      const c = cards[i++];
      if (!c) return;
      set.get(c.id);
      animTile(c.view, loc, set, c.id);
      window.setTimeout(next, 30);
    };
    window.setTimeout(next, 60);
  };
  // Плитки рядом с референсом: `data-tile` — ref (прежний лист) или sculpt (лепка).
  const drawTiles = (): void => {
    for (const el of document.querySelectorAll<HTMLElement>('[data-tile]')) tile(el, loc, el.dataset.tile === 'ref' ? REF : SCULPT);
  };
  lookGroup.addEventListener('click', (e) => {
    const v = pick(e) as Look | undefined;
    if (v) { look = v; drawScene(); }
  });
  locGroup.addEventListener('click', (e) => {
    const v = pick(e) as Loc | undefined;
    if (v) { loc = v; drawScene(); drawTiles(); drawClips(); }
  });
  drawScene();
  drawTiles();
  drawClips();
}

function boot(): void {
  const img = new Image();
  img.onload = () => {
    REF = refFig(img);
    REF_IMG = img;
    SCULPT = still(MODEL, HERO_STYLE);
    start();
  };
  img.src = window.ASSETS.ref;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
