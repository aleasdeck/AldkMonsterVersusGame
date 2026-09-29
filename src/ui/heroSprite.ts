import archerAvatar from '../assets/heroes/archer-avatar.png';
import archerSheet from '../assets/heroes/archer.png';
import assassinAvatar from '../assets/heroes/assassin-avatar.png';
import mageAvatar from '../assets/heroes/mage-avatar.png';
import assassinSheet from '../assets/heroes/assassin.png';
import mageSheet from '../assets/heroes/mage.png';
import { avatarCells, hasHeroArt, heroAvatarUrl, heroClipContact, heroFrameMs, heroSheetSprite, playHeroSculptClip } from './heroes';

/**
 * Герои на поле. Воин, Паладин и Берсерк — пиксельной лепкой (heroes/, свои клипы у каждого), остальные — рисованными листами
 * (`src/assets/heroes/<id>.png`, ряд — клип, 8 кадров в ряду), собранными из картинки генератора скриптом
 * `tools/hero-sheet.py` — цифры манифеста печатает он же. Кадры листает CSS (`.hero-sprite` и `.hero-sheet`
 * в style.css), клипы боя запускает `playHeroClip` — одинаково для обоих.
 *
 * Клипы названы по роли, а не по рисунку: `battle` — покой в бою, `buff` — клич и бафы, `bash` и `riposte` —
 * личные приёмы Воина, `smite` — Паладина. Чего у рисованного героя нет — подменяется по цепочке `FALLBACK`.
 */
export type HeroClip = 'idle' | 'battle' | 'attack' | 'heavy' | 'power' | 'heal' | 'buff' | 'block' | 'hurt' | 'death' | 'bash' | 'riposte' | 'smite';

export interface HeroSheet {
  url: string;
  /** Ряды листа по порядку; чего нет — не играем (герой останется в покое). */
  clips: HeroClip[];
  frames: number;
  /** Сторона квадратной ячейки, px. */
  cell: number;
  /** Рост фигуры в покое внутри ячейки, px: по нему считается масштаб, чтобы герой вышел заказанной высоты. */
  body: number;
}

const HERO_SHEETS: Record<string, HeroSheet> = {
  mage: { url: mageSheet, clips: ['idle', 'battle', 'attack', 'power', 'block', 'hurt', 'death'], frames: 8, cell: 186, body: 134 },
  assassin: { url: assassinSheet, clips: ['idle'], frames: 8, cell: 182, body: 166 },
  archer: { url: archerSheet, clips: ['idle'], frames: 8, cell: 186, body: 170 },
};

/** Лист героя и его разметка: по ним слой эффектов снимает силуэт кадра (латы блока, v0.52.7). */
export function heroSheetInfo(heroId: string): Readonly<HeroSheet> | undefined {
  return HERO_SHEETS[heroId];
}

/**
 * Аватарки героев (v0.41.1): портрет в рисованной рамке, лист генератора режет `tools/hero-avatars.py`.
 * Рамка — часть рисунка и заодно цвет героя, поэтому своей в разметке нет. У героев-лепки (Воин с v0.54.3, Паладин с v0.54.5,
 * Берсерк с v0.54.6) аватарка рисуется из модели (heroes/avatar.ts) — рисованной у них нет.
 */
const HERO_AVATARS: Record<string, string> = {
  mage: mageAvatar,
  assassin: assassinAvatar,
  archer: archerAvatar,
};

/** Длительность клипа, мс. У боевых — под тайминг боя: удар приходится на середину клипа, к попаданию снаряда (FLIGHT в fx.ts). */
const CLIP_MS: Record<HeroClip, number> = { idle: 1600, battle: 1300, attack: 520, heavy: 640, power: 560, heal: 800, buff: 560, block: 560, hurt: 400, death: 1000, bash: 640, riposte: 560, smite: 830 };

/**
 * Чем заменить клип, которого у героя нет: тяжёлый удар — обычным, лечение — приёмом. Без замены клип не играется:
 * клич рисованный герой не играет, как и до лепки, — его приём на себя светится эффектом.
 */
const FALLBACK: Partial<Record<HeroClip, HeroClip>> = { heavy: 'attack', heal: 'power', power: 'attack', bash: 'heavy', riposte: 'block', smite: 'heavy', battle: 'idle' };

/** Зацикленные клипы; остальные играются один раз и замирают на последнем кадре. */
const LOOPS = new Set<HeroClip>(['idle', 'battle']);

/** Клип, играющий прямо сейчас: переживает перерисовку — новый спрайт подхватывает его с той же точки. */
let running: { hero: string; clip: HeroClip; started: number } | null = null;
let seq = 0;

function rowOf(sheet: HeroSheet, clip: HeroClip): number {
  return sheet.clips.indexOf(clip);
}

/** Клип и его ряд по цепочке замен; null — играть нечего. */
function resolve(sheet: HeroSheet, clip: HeroClip): { clip: HeroClip; row: number } | null {
  for (let c: HeroClip | undefined = clip; c; c = FALLBACK[c]) {
    const row = rowOf(sheet, c);
    if (row >= 0) return { clip: c, row };
  }
  return null;
}

/** То же для клипа в покое: там замены всегда есть, крайняя — обычный покой. */
function pick(sheet: HeroSheet, clip: HeroClip): { clip: HeroClip; row: number } {
  return resolve(sheet, clip) ?? { clip: 'idle', row: 0 };
}

function setClip(el: HTMLElement, clip: HeroClip, row: number, elapsed = 0): void {
  el.style.setProperty('--row', String(row));
  el.style.setProperty('--dur', `${CLIP_MS[clip]}ms`);
  el.style.setProperty('--delay', `${-elapsed}ms`);
  el.classList.toggle('once', !LOOPS.has(clip));
}

/**
 * Спрайт героя: место в разметке — квадрат `px` по фигуре в покое, а лист рисуется поверх шире ячейки,
 * чтобы замах мечом и падение не обрезались. `base` — что играть в покое: 'battle' в бою, 'death' на гибели.
 */
export function heroSprite(heroId: string, px: number, base: HeroClip = 'idle'): HTMLElement {
  if (hasHeroArt(heroId)) return heroSheetSprite(heroId, px, base === 'death' ? 'death' : 'idle');
  const sheet = HERO_SHEETS[heroId];
  const el = document.createElement('div');
  el.className = 'sprite hero-sprite';
  el.dataset.hero = heroId;
  el.dataset.base = base;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', heroId);
  if (!sheet) return el;
  const k = px / sheet.body;
  el.style.setProperty('--box', `${px}px`);
  el.style.setProperty('--cell', `${sheet.cell * k}px`);
  el.style.setProperty('--frames', String(sheet.frames));
  el.style.setProperty('--sheet', `url(${sheet.url})`);
  // Клип, начатый до перерисовки, доигрывается на новом спрайте: отрицательная задержка сдвигает его к той же точке.
  const live = base === 'battle' && running?.hero === heroId ? rowOf(sheet, running.clip) : -1;
  if (live >= 0 && running) setClip(el, running.clip, live, Date.now() - running.started);
  else {
    const p = pick(sheet, base);
    setClip(el, p.clip, p.row);
  }
  return el;
}

/**
 * Аватарка героя — квадрат `px`. Стоит там, где нужен сам герой, а не его поза: блок героя в консоли,
 * плитка выбора, шапка листа персонажа. В бою, на выборе крупно и на итогах остаётся спрайт — там важны
 * стойка, снаряжение и падение.
 */
export function heroAvatar(heroId: string, px: number): HTMLElement {
  const el = document.createElement('div');
  el.className = 'hero-avatar';
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', heroId);
  el.style.setProperty('--box', `${px}px`);
  if (hasHeroArt(heroId)) {
    // Лепка — пиксель в пиксель: увеличивать без сглаживания, ужимать (подсказка) — со сглаживанием.
    el.classList.toggle('sculpt', avatarCells(px) <= px);
    el.style.setProperty('--pic', `url(${heroAvatarUrl(heroId, px)})`);
    return el;
  }
  const url = HERO_AVATARS[heroId];
  if (!url) return el;
  el.style.setProperty('--pic', `url(${url})`);
  return el;
}

/** Файлы героя — лист кадров и портрет: их заказывает впрок preload.ts, пока герой ещё не на экране. */
export function heroArtUrls(heroId: string): string[] {
  return [HERO_SHEETS[heroId]?.url, HERO_AVATARS[heroId]].filter((url): url is string => !!url);
}

/**
 * Проиграть одноразовый клип героя в бою и вернуться в стойку. false — такого клипа у героя нет,
 * и вызывающий оставляет старый наскок (`acting`). `from` — с какого момента клипа, мс (только у лепки:
 * блок на ударе врага начинается сразу с удара о щит).
 */
export function playHeroClip(root: HTMLElement, heroId: string, want: HeroClip, from = 0): boolean {
  if (hasHeroArt(heroId)) return want !== 'idle' && want !== 'battle' && playHeroSculptClip(root, heroId, want, from);
  const sheet = HERO_SHEETS[heroId];
  const found = sheet ? resolve(sheet, want) : null;
  if (!sheet || !found) return false;
  const { clip, row } = found;
  running = { hero: heroId, clip, started: Date.now() };
  const mine = ++seq;
  const el = root.querySelector<HTMLElement>('.hero-zone .hero-sprite');
  if (el) {
    el.classList.remove('once');
    void el.offsetWidth; // перезапуск анимации, даже если клип тот же
    setClip(el, clip, row);
  }
  window.setTimeout(() => {
    if (mine !== seq) return; // сверху лёг другой клип — возвращать стойку будет он
    running = null;
    const back = root.querySelector<HTMLElement>('.hero-zone .hero-sprite');
    if (!back) return;
    const p = pick(sheet, (back.dataset.base as HeroClip) ?? 'idle');
    setClip(back, p.clip, p.row);
  }, CLIP_MS[clip]);
  return true;
}

/**
 * Момент контакта клипа, мс от начала: удар о цель, взмах приёма, удар о щит. 0 — у клипа нет контакта или герой
 * рисованный (его листы подогнаны под время снаряда, `CLIP_MS`). По нему бой приурочивает цифру урона и эффект.
 */
export function heroContactMs(heroId: string, clip: HeroClip): number {
  if (!hasHeroArt(heroId) || clip === 'idle' || clip === 'battle') return 0;
  return heroClipContact(heroId, clip);
}

/** Длительность кадра клипа героя-лепки, мс (0 — рисованный). */
export function heroClipFrameMs(heroId: string, clip: HeroClip): number {
  if (!hasHeroArt(heroId) || clip === 'idle' || clip === 'battle') return 0;
  return heroFrameMs(heroId, clip);
}
