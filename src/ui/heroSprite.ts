import archerAvatar from '../assets/heroes/archer-avatar.png';
import archerSheet from '../assets/heroes/archer.png';
import assassinAvatar from '../assets/heroes/assassin-avatar.png';
import berserkAvatar from '../assets/heroes/berserk-avatar.png';
import mageAvatar from '../assets/heroes/mage-avatar.png';
import paladinAvatar from '../assets/heroes/paladin-avatar.png';
import warriorAvatar from '../assets/heroes/warrior-avatar.png';
import assassinSheet from '../assets/heroes/assassin.png';
import berserkSheet from '../assets/heroes/berserk.png';
import mageSheet from '../assets/heroes/mage.png';
import paladinSheet from '../assets/heroes/paladin.png';
import warriorSheet from '../assets/heroes/warrior.png';

/**
 * Рисованные герои: у каждого свой лист кадров (`src/assets/heroes/<id>.png`, ряд — клип, 8 кадров в ряду),
 * собранный из картинки генератора скриптом `tools/hero-sheet.py` — цифры манифеста печатает он же.
 * Кадры листает CSS (`.hero-sprite` в style.css), клипы боя запускает `playHeroClip`.
 */
export type HeroClip = 'idle' | 'battle' | 'slash' | 'thrust' | 'block' | 'hurt' | 'death';

interface HeroSheet {
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
  warrior: { url: warriorSheet, clips: ['idle', 'battle', 'slash', 'thrust', 'block', 'hurt', 'death'], frames: 8, cell: 172, body: 108 },
  mage: { url: mageSheet, clips: ['idle'], frames: 8, cell: 190, body: 181 },
  assassin: { url: assassinSheet, clips: ['idle'], frames: 8, cell: 182, body: 166 },
  paladin: { url: paladinSheet, clips: ['idle'], frames: 8, cell: 188, body: 180 },
  berserk: { url: berserkSheet, clips: ['idle'], frames: 8, cell: 194, body: 186 },
  archer: { url: archerSheet, clips: ['idle'], frames: 8, cell: 186, body: 170 },
};

/**
 * Аватарки героев (v0.41.1): портрет в рисованной рамке, лист генератора режет `tools/hero-avatars.py`.
 * Рамка — часть рисунка и заодно цвет героя, поэтому своей в разметке нет.
 */
const HERO_AVATARS: Record<string, string> = {
  warrior: warriorAvatar,
  mage: mageAvatar,
  assassin: assassinAvatar,
  paladin: paladinAvatar,
  berserk: berserkAvatar,
  archer: archerAvatar,
};

/** Длительность клипа, мс. У боевых — под тайминг боя: удар приходится на середину клипа, к попаданию снаряда (FLIGHT в fx.ts). */
const CLIP_MS: Record<HeroClip, number> = { idle: 1600, battle: 1300, slash: 520, thrust: 520, block: 560, hurt: 400, death: 1000 };

/** Зацикленные клипы; остальные играются один раз и замирают на последнем кадре. */
const LOOPS = new Set<HeroClip>(['idle', 'battle']);

/** Клип, играющий прямо сейчас: переживает перерисовку — новый спрайт подхватывает его с той же точки. */
let running: { hero: string; clip: HeroClip; started: number } | null = null;
let seq = 0;

function rowOf(sheet: HeroSheet, clip: HeroClip): number {
  return sheet.clips.indexOf(clip);
}

/** Клип и его ряд: чего у героя нет (боевой стойки, гибели), подменяем покоем. */
function pick(sheet: HeroSheet, clip: HeroClip): { clip: HeroClip; row: number } {
  const row = rowOf(sheet, clip);
  return row >= 0 ? { clip, row } : { clip: 'idle', row: 0 };
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
  const url = HERO_AVATARS[heroId];
  if (!url) return el;
  el.style.setProperty('--box', `${px}px`);
  el.style.setProperty('--pic', `url(${url})`);
  return el;
}

/**
 * Проиграть одноразовый клип героя в бою и вернуться в стойку. false — такого клипа у героя нет,
 * и вызывающий оставляет старый наскок (`acting`).
 */
export function playHeroClip(root: HTMLElement, heroId: string, clip: HeroClip): boolean {
  const sheet = HERO_SHEETS[heroId];
  const row = sheet ? rowOf(sheet, clip) : -1;
  if (!sheet || row < 0) return false;
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
