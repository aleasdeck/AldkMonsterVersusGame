// Страница обсуждения «Лепка Паладина» (docs/lepka-geroev.md): Паладин в игре с v0.54.5. Облик, шлем, клипы и аватарка
// выбраны (отвергнутые — в истории ветки), модель — src/ui/heroes/paladin.ts, та же, что в игре. Враги и фоны —
// из игры, тонировка — та же, что в бою (tint.ts). Сборка — build.mjs --hero paladin.
import { Painter, type Model } from '../../src/ui/mobs/pixel';
import { FOREST_MODELS } from '../../src/ui/mobs/forest';
import { CRYPT_MODELS } from '../../src/ui/mobs/crypt';
import { CAVES_MODELS } from '../../src/ui/mobs/caves';
import { tintVar } from '../../src/ui/tint';
import { paladinModel } from '../../src/ui/heroes/paladin';
import { warriorModel } from '../../src/ui/heroes/warrior';
import { renderAvatar } from '../../src/ui/heroes/avatar';
import type { HeroModel } from '../../src/ui/heroes/model';
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
const FOE_X = [357, 590, 823];

/** Что сейчас в сцене: лепка или прежний лист, локация (она же — у плиток). */
const state: { hero: Hero; loc: Loc } = { hero: 'sculpt', loc: 'forest' };

// ─── Наборы кадров ──────────────────────────────────────────────────────────

let REF_IMG: HTMLImageElement;

/**
 * Прежний рисованный Паладин: один ряд покоя, 8 кадров за 1,6 с (CLIP_MS.idle прежнего heroSprite.ts, до v0.54.7), масштаб как в игре —
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

const sets = new Map<Hero, ActorSet>();
/** Набор кадров героя: прежний лист или лепка. Лепка рисуется при первом запросе. */
function heroAnim(hero: Hero): ActorSet {
  let set = sets.get(hero);
  if (!set) sets.set(hero, (set = hero === 'ref' ? refSet(REF_IMG) : heroSet(paladinModel(), HERO_STYLE)));
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
 * урон и смерть — сначала бьёт враг, и удар о щит или отдача приходятся на его контакт.
 */
function perform(sc: Scene, clip: SculptClip): void {
  const foe = sc.foes[0];
  const hero = sc.hero;
  const foeHit = foe ? contactMs(foe.set, 'attack') : 0;
  switch (clip) {
    case 'attack': case 'heavy': case 'power': case 'smite':
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
 * Крупный план: кусок поля 160 × 190 вокруг героя целым увеличением — ×2, как кадр игры на FullHD (пиксель 1,5 —
 * ровно три точки экрана). Не влезает в ширину плитки — ×1.
 */
function tile(host: HTMLElement, loc: Loc, set: ActorSet): void {
  const CW = 160, CH = 190;
  const { f } = liveField(loc, set, false);
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

let scene: Scene | null = null;
function drawScene(): void {
  const live = liveField(state.loc, heroAnim(state.hero), true);
  scene = live.scene;
  fitStage(document.getElementById('scene')!, live.f);
  toggle(document.getElementById('scene-hero')!, state.hero);
  toggle(document.getElementById('scene-loc')!, state.loc);
  // Клипы есть только у лепки: у прежнего листа — один покой.
  document.getElementById('scene-clips')!.classList.toggle('muted', state.hero === 'ref');
}

/**
 * Плитка клипа: кусок поля 240 × 250 вокруг героя, клип повторяется с паузой в покое. ×2, как кадр игры на FullHD,
 * если влезает в ширину.
 */
function animTile(host: HTMLElement, loc: Loc, set: ActorSet, clip: SculptClip): void {
  const CW = 240, CH = 250;
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
    f.style.transform = `scale(${z}) translate(${-(HERO_X - 105)}px, ${-(GROUND + 14 - CH)}px)`;
  });
}

/**
 * Плитки: `data-tile="sculpt"` или `ref`, `data-loc` — своя локация (иначе — из сцены). Рисуются по одной, чтобы
 * страница не вставала на кадрах.
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
    tile(el, (el.dataset.loc as Loc | undefined) ?? state.loc, heroAnim(el.dataset.tile as Hero));
    window.setTimeout(next, 20);
  };
  window.setTimeout(next, 30);
}

/**
 * Сверка силуэта: лист пересчитан в сетку лепки (пиксель 1,5) — каждая клетка берёт точку листа под своей серединой
 * по тому же переводу, что мерки, — рядом лепка в выбранном облике (первый кадр покоя) и карта расхождений.
 */
function drawOverlay(): void {
  const host = document.getElementById('overlay');
  if (!host) return;
  const m = paladinModel();
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

// ─── Клипы: пары вариантов и остальные ────────────────────────────────────

/** Подпись клипа: кадры, частота, длительность, контакт. */
function clipMeta(id: SculptClip): string {
  const spec = HERO_CLIPS[id];
  return `${spec.frames} × ${spec.fps} к/с · ${Math.round((spec.frames * 1000) / spec.fps)} мс${spec.contact !== undefined ? ` · контакт ${spec.contact + 1}-й кадр, ${Math.round((spec.contact * 1000) / spec.fps)} мс` : ''}${spec.hold ? ' · держит последний кадр' : ''}`;
}

/** Очередь плиток клипов: рисуются по одной, чтобы страница не вставала на время отрисовки кадров. */
let clipRun = 0;
function queue(jobs: Array<() => void>): void {
  const run = ++clipRun;
  let i = 0;
  const next = (): void => {
    if (run !== clipRun) return;
    const job = jobs[i++];
    if (!job) return;
    job();
    window.setTimeout(next, 30);
  };
  window.setTimeout(next, 60);
}

/** Все клипы (`#clips`) — плитки с клипом по кругу на локации из сцены; свой клип Паладина — первым. */
function drawClips(): void {
  const jobs: Array<() => void> = [];
  const host = document.getElementById('clips')!;
  host.replaceChildren();
  for (const clip of ['smite', 'attack', 'heavy', 'power', 'heal', 'buff', 'block', 'hurt', 'death'] as SculptClip[]) {
    const spec = HERO_CLIPS[clip];
    const card = h('article', spec.own ? 'clip-card own' : 'clip-card');
    const view = h('div', 'clip-view', 'рисую кадры…');
    const head = h('div', 'clip-head');
    head.append(h('b', '', spec.name), h('span', 'mono', clipMeta(clip)));
    card.append(view, head, h('p', '', CLIP_NOTE[clip] ?? spec.when));
    host.appendChild(card);
    jobs.push(() => animTile(view, state.loc, heroAnim('sculpt'), clip));
  }
  queue(jobs);
}

/** Что показывает клип у Паладина — вместо общей подписи из HERO_CLIPS (там — у Воина). */
const CLIP_NOTE: Partial<Record<SculptClip, string>> = {
  smite: 'Свой приём «Молот света» («Крест лучей»): молот к небу — боёк раскаляется светом, лучи встают крестом; удар через верх, в кадр удара — вспышка.',
  attack: 'Удар «Сверху»: предплечье вверх-назад, молот горизонтально за головой — шаг, и молот через верх на врага; щит на размахе уходит за корпус.',
  heavy: 'Сильный удар «Сверху с шагом»: привстал на носки, молот за спиной — широкий шаг, удар через верх, из-под шага пыль.',
  power: 'Заклинание, бросок: молот вскинут к небу, свет собирается на бойке — и боёк на цель, рука во всю длину.',
  heal: 'Лечение «Свет щита»: стоя, щит поднят к груди, шлем склонён — крест на щите заливается светом, лучи выходят за кромку.',
  buff: 'Ореол возмездия, Боевой клич и прочие приёмы на себя: молот отвесно над головой, щит в сторону, шлем запрокинут, боёк светится.',
  block: '«Защититься» и удар, погашенный блоком: щит к лицу, присел, молот впереди-внизу у бедра; в кадр удара — искры о кромку.',
  hurt: 'Удар прошёл в HP: отбросило назад, шлем запрокинут, щит в сторону, боёк молота по инерции отстаёт вперёд; белую вспышку добавляет движок.',
  death: 'Отбросило, молот выскользнул, колено на землю, упал на спину — щит на груди, молот рядом. Последний кадр держится.',
};

// ─── Аватарка ───────────────────────────────────────────────────────────────

const avatarModels = new Map<string, HeroModel>();
/** Модель под портрет: Паладин и Воин из своей лепки. */
function portraitModel(id: 'paladin' | 'warrior'): HeroModel {
  let m = avatarModels.get(id);
  if (!m) avatarModels.set(id, (m = id === 'warrior' ? warriorModel() : paladinModel()));
  return m;
}

/** Холст аватарки: `px` — размер в игре (112, 80, 44), клетки — как в игре (`avatarCells`), `k` — увеличение. */
function avatarCanvas(model: HeroModel, px: number, k: number, label: string): HTMLCanvasElement {
  const n = px >= 64 ? Math.round(px / 2) : 44;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  c.getContext('2d')?.putImageData(new ImageData(renderAvatar(model, n), n, n), 0, 0);
  c.style.width = `${px * k}px`;
  c.style.imageRendering = px >= 64 ? 'pixelated' : 'auto';
  c.setAttribute('role', 'img');
  c.setAttribute('aria-label', label);
  return c;
}

/**
 * Аватарка (`#avatars`): три размера игры ×2, как на FullHD, и ряд выбора героя (`#avatar-row`) — шесть героев по 112
 * в порядке игры, остальные — как в игре сейчас.
 */
function drawAvatars(): void {
  const sizes = document.getElementById('avatars')!;
  sizes.replaceChildren();
  for (const px of [112, 80, 44]) {
    const f = h('figure');
    f.append(avatarCanvas(portraitModel('paladin'), px, 2, `Аватарка Паладина, ${px} точек`), h('figcaption', '', px === 112 ? '112 выбор' : px === 80 ? '80 лист' : '44 консоль'));
    sizes.appendChild(f);
  }
  const row = document.getElementById('avatar-row')!;
  row.replaceChildren();
  const heroes: Array<[string, string]> = [['warrior', 'Воин'], ['mage', 'Маг'], ['assassin', 'Ассасин'], ['paladin', 'Паладин'], ['berserk', 'Берсерк'], ['archer', 'Лучник']];
  for (const [id, name] of heroes) {
    const f = h('figure', id === 'paladin' ? 'me' : '');
    if (id === 'warrior' || id === 'paladin') f.appendChild(avatarCanvas(portraitModel(id), 112, 1, `${name}, аватарка из лепки`));
    else {
      const img = h('img');
      img.src = window.ASSETS.others[id];
      img.width = img.height = 112;
      img.alt = `${name}, рисованный портрет`;
      f.appendChild(img);
    }
    f.appendChild(h('figcaption', '', name));
    row.appendChild(f);
  }
  const old = document.getElementById('avatar-old');
  if (old) {
    const img = h('img');
    img.src = window.ASSETS.avatar;
    img.width = img.height = 224;
    img.alt = 'Прежний рисованный портрет Паладина';
    old.replaceChildren(img);
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
    state.hero = v as Hero;
    drawScene();
  });
  on('scene-loc', (v) => {
    state.loc = v as Loc;
    drawScene();
    drawTiles();
    drawClips();
  });
  // Кнопки клипов под полем: клип героя с реакцией первого врага; свой клип Паладина — отдельным цветом.
  const clipGroup = document.getElementById('scene-clips')!;
  for (const [id, spec] of Object.entries(HERO_CLIPS) as Array<[SculptClip, (typeof HERO_CLIPS)[SculptClip]]>) {
    if (id === 'idle' || (spec.own && id !== 'smite')) continue;
    const b = h('button', spec.own ? 'own' : '', spec.name);
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
  drawScene();
  drawTiles();
  drawClips();
  drawAvatars();
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
