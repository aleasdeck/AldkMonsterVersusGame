// Страница обсуждения «Лепка Берсерка» — шаг 4 рецепта (docs/lepka-geroev.md): клипы. Облик B «Северянин», волчья
// голова и хват «как на листе» выбраны (отвергнутые — в истории ветки); на удар, сильный удар и лечение — по два варианта.
// Модель — src/ui/heroes/berserk.ts (в игру ещё не входит), враги и фоны — из игры, тонировка — та же, что в бою
// (tint.ts). Сборка — build.mjs --hero berserk.
import { Painter, type Model } from '../../src/ui/mobs/pixel';
import { FOREST_MODELS } from '../../src/ui/mobs/forest';
import { CRYPT_MODELS } from '../../src/ui/mobs/crypt';
import { CAVES_MODELS } from '../../src/ui/mobs/caves';
import { tintVar } from '../../src/ui/tint';
import { berserkModel, type BerserkVariants } from '../../src/ui/heroes/berserk';
import { HERO_CLIPS, HERO_STYLE, type SculptClip } from '../../src/ui/heroes/clips';
import { Actor, heroSet, later, mobSet, setSpeed, type Anim, type ActorSet } from './anim';

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

type Variant = 'A' | 'B';
/** Что сейчас в сцене: лепка или прежний лист, локация (она же — у плиток), варианты клипов. */
const state: { hero: Hero; loc: Loc; v: BerserkVariants } = { hero: 'sculpt', loc: 'forest', v: { attack: 'A', heavy: 'A', heal: 'A' } };

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
/** Набор кадров героя: прежний лист или лепка с вариантами клипов. Лепка рисуется при первом запросе. */
function heroAnim(hero: Hero, v: BerserkVariants = state.v): ActorSet {
  const key = hero === 'ref' ? 'ref' : `${v.attack}${v.heavy}${v.heal}`;
  let set = sets.get(key);
  if (!set) sets.set(key, (set = hero === 'ref' ? refSet(REF_IMG) : heroSet(berserkModel(v), HERO_STYLE)));
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

interface Scene { hero: Actor; foes: Actor[] }

/** Поле 960 × 320: фон локации, тонировка, враги (если нужны) и герой — живые холсты общего цикла кадров. */
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
 * Сыграть клип героя в бою так, как его покажет игра (app.ts): удар — враг вздрагивает в кадр контакта героя; блок,
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
  const { f } = liveField(loc, set, false);
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
  const m = berserkModel();
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

let scene: Scene | null = null;
function drawScene(): void {
  const live = liveField(state.loc, heroAnim(state.hero), true);
  scene = live.scene;
  fitStage(document.getElementById('scene')!, live.f);
  toggle(document.getElementById('scene-hero')!, state.hero);
  toggle(document.getElementById('scene-loc')!, state.loc);
  for (const c of ['attack', 'heavy', 'heal'] as const) toggle(document.getElementById(`scene-v-${c}`)!, state.v[c]);
  // Клипы есть только у лепки: у прежнего листа — один покой.
  document.getElementById('scene-clips')!.classList.toggle('muted', state.hero === 'ref');
  for (const card of document.querySelectorAll<HTMLElement>('[data-pick]')) {
    const [clip, v] = card.dataset.pick!.split(':') as ['attack' | 'heavy' | 'heal', Variant];
    card.setAttribute('aria-pressed', String(state.v[clip] === v));
  }
}

/**
 * Плитка клипа: кусок поля 240 × 250 вокруг героя, клип повторяется с паузой в покое. ×2, как кадр игры на FullHD,
 * если влезает в ширину.
 */
function animTile(host: HTMLElement, loc: Loc, set: ActorSet, clip: SculptClip): void {
  const CW = 250, CH = 250;
  const { f, scene: sc } = liveField(loc, set, false);
  sc.hero.auto = { clip, gap: 700 };
  sc.hero.play(clip);
  const win = h('div', 'tile-win');
  win.appendChild(f);
  host.replaceChildren(win);
  observe(host, () => {
    const z = Math.max(1, Math.min(2, Math.floor(host.clientWidth / CW)));
    win.style.width = `${CW * z}px`;
    win.style.height = `${CH * z}px`;
    f.style.transform = `scale(${z}) translate(${-(HERO_X - 100)}px, ${-(GROUND + 14 - CH)}px)`;
  });
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

/** Подпись клипа: кадры, частота, длительность, контакт. */
function clipMeta(id: SculptClip): string {
  const spec = HERO_CLIPS[id];
  return `${spec.frames} × ${spec.fps} к/с · ${Math.round((spec.frames * 1000) / spec.fps)} мс${spec.contact !== undefined ? ` · контакт ${spec.contact + 1}-й кадр, ${Math.round((spec.contact * 1000) / spec.fps)} мс` : ''}${spec.hold ? ' · держит последний кадр' : ''}`;
}

/** Что показывает клип у Берсерка — подписи плиток; варианты — у своих карточек в разметке. */
const CLIP_NOTE: Partial<Record<SculptClip, string>> = {
  power: 'Бросок (склянки, бомбы — всё, что летит): ближняя рука заносит за голову и бросает с шагом, снаряд вылетает в кадр контакта.',
  buff: '«Ярость» и прочие приёмы на себя: сжался — выпрямился с рёвом, кулак бьёт в грудь, топор вскинут; рёв рисует слой эффектов.',
  block: '«Защититься» и удар, погашенный блоком: древко поперёк груди двумя руками, присел; в кадр удара — толчок и искры о древко.',
  hurt: 'Удар прошёл в HP: отбросило назад, голова запрокинута, топор по инерции; белую вспышку добавляет движок.',
  death: 'Ноги подкосились — на колено, топор выпал, рухнул ничком, горб шкуры сверху. Последний кадр держится.',
};

/**
 * Все плитки страницы: пары вариантов (`data-var="attack:A"`), все клипы (`#clips`, с вариантами из сцены), «рядом с
 * листом» (`data-tile`) и сверка силуэта.
 */
function drawTiles(): void {
  const jobs: Array<() => void> = [];
  for (const el of document.querySelectorAll<HTMLElement>('[data-var]')) {
    el.textContent = 'рисую кадры…';
    const [clip, v] = el.dataset.var!.split(':') as ['attack' | 'heavy' | 'heal', Variant];
    jobs.push(() => animTile(el, state.loc, heroAnim('sculpt', { ...state.v, [clip]: v }), clip));
  }
  const host = document.getElementById('clips')!;
  host.replaceChildren();
  for (const clip of ['attack', 'heavy', 'power', 'heal', 'buff', 'block', 'hurt', 'death'] as SculptClip[]) {
    const spec = HERO_CLIPS[clip];
    const card = h('article', 'clip-card');
    const view = h('div', 'clip-view', 'рисую кадры…');
    const head = h('div', 'clip-head');
    const vName = clip === 'attack' || clip === 'heavy' || clip === 'heal' ? ` ${state.v[clip]}` : '';
    head.append(h('b', '', spec.name + vName), h('span', 'mono', clipMeta(clip)));
    card.append(view, head, h('p', '', CLIP_NOTE[clip] ?? 'Вариант выбран в сцене — пары вариантов выше.'));
    host.appendChild(card);
    jobs.push(() => animTile(view, state.loc, heroAnim('sculpt'), clip));
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-tile]')) {
    el.textContent = 'рисую кадры…';
    jobs.push(() => tile(el, state.loc, heroAnim(el.dataset.tile === 'ref' ? 'ref' : 'sculpt')));
  }
  jobs.push(drawOverlay);
  queue(jobs);
}

function start(): void {
  const on = (id: string, fn: (v: string) => void): void => {
    document.getElementById(id)!.addEventListener('click', (e) => {
      const v = (e.target as HTMLElement).closest<HTMLElement>('[data-v]')?.dataset.v;
      if (v) fn(v);
    });
  };
  on('scene-hero', (v) => {
    state.hero = v as Hero;
    drawScene();
  });
  on('scene-loc', (v) => {
    state.loc = v as Loc;
    drawScene();
    drawTiles();
  });
  for (const c of ['attack', 'heavy', 'heal'] as const) {
    on(`scene-v-${c}`, (v) => {
      state.v = { ...state.v, [c]: v as Variant };
      drawScene();
      drawTiles();
    });
  }
  // Карточка варианта ставит его в сцену и в сетку клипов.
  for (const card of document.querySelectorAll<HTMLButtonElement>('[data-pick]')) {
    card.addEventListener('click', () => {
      const [clip, v] = card.dataset.pick!.split(':') as ['attack' | 'heavy' | 'heal', Variant];
      state.v = { ...state.v, [clip]: v };
      drawScene();
      drawTiles();
    });
  }
  // Кнопки клипов под полем: клип героя с реакцией первого врага.
  const clipGroup = document.getElementById('scene-clips')!;
  for (const id of Object.keys(HERO_CLIPS) as SculptClip[]) {
    if (id === 'idle' || HERO_CLIPS[id].own) continue;
    const b = h('button', '', HERO_CLIPS[id].name);
    b.type = 'button';
    b.dataset.v = id;
    clipGroup.appendChild(b);
  }
  on('scene-clips', (v) => {
    if (scene && state.hero === 'sculpt') perform(scene, v as SculptClip);
  });
  on('speed', (v) => {
    setSpeed(Number(v));
    toggle(document.getElementById('speed')!, v);
  });
  toggle(document.getElementById('speed')!, '1');
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
