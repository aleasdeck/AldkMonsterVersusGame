import skeletonSheet from '../assets/enemies/skeleton-warrior.webp';
import archerSheet from '../assets/enemies/skeleton-archer.webp';
import type { EventTarget, SpriteSpec } from '../engine/types';
import { spriteImg } from './sprites';

type WarriorClip = 'attack' | 'block' | 'hurt';
type EnemyClip = WarriorClip | 'shoot' | 'volley';
interface Motion { clip: EnemyClip; started: number }
interface PoseState { motion?: Motion }

// Состояние привязано к экземпляру врага: одинаковые uid следующего боя не наследуют старый клип.
const poses = new WeakMap<object, PoseState>();
const controllers = new WeakMap<HTMLCanvasElement, PoseState>();
const DURATION: Record<EnemyClip, number> = { attack: 640, block: 620, hurt: 440, shoot: 800, volley: 1000 };
const ROW: Record<WarriorClip, number> = { attack: 1, block: 2, hurt: 3 };
const image = new Image();
image.src = skeletonSheet;
const archerImage = new Image();
archerImage.src = archerSheet;
export const enemyArtUrls = [skeletonSheet, archerSheet];
export const hasEnemySheet = (id: string): boolean => id === 'skeleton_warrior' || id === 'skeleton_archer';
const ARCHER_RELEASE = 500;

// Реальные границы фигур в мастере 1774×887. Меч в пятом кадре удара выходит за сетку:
// режем по фигуре, а привязываем к центру исходной ячейки и общей линии ступней.
const FRAMES = [
  [[32,44,179,223],[254,43,402,223],[472,44,623,223],[695,44,845,223],[918,44,1067,223],[1141,42,1288,223],[1362,44,1509,223],[1583,44,1732,223]],
  [[32,265,179,443],[259,265,413,443],[483,233,633,443],[695,268,853,443],[859,275,1092,443],[1148,270,1297,443],[1365,234,1518,443],[1583,266,1731,443]],
  [[32,487,179,664],[254,486,401,664],[472,496,632,664],[695,499,854,664],[921,501,1079,664],[1143,486,1288,664],[1362,487,1509,664],[1583,487,1732,664]],
  [[32,708,179,880],[254,699,415,880],[495,694,639,880],[709,698,852,880],[921,706,1074,880],[1144,704,1288,880],[1362,708,1509,880],[1583,708,1731,880]],
];

// Мастер лучника 1254×1254: x, y, ширина, высота и центр стоп относительно левой границы.
// Нижний ряд стоит выше сетки, поэтому каждую позу привязываем по её видимым стопам.
const ARCHER_FRAMES = [
  [103,58,167,237,85], [405,58,180,237,96], [705,70,182,225,99], [1015,58,169,237,87.5],
  [103,371,167,238,85], [379,353,209,256,124], [666,362,227,247,141], [960,342,244,267,160],
  [45,657,246,265,161.5], [333,664,277,258,184.5], [692,660,234,262,123], [1015,685,172,237,89],
  [79,996,191,213,106], [395,976,194,233,82], [702,986,172,223,90], [1016,988,168,221,86],
];
// Кадр со встроенной летящей стрелой пропущен: полёт показывает общий слой fx.
const SHOOT_POSES = [[80,4], [200,5], [320,6], [420,7], [ARCHER_RELEASE,8], [620,10], [720,11], [800,0]];
const VOLLEY_POSES = [[80,4], [200,5], [320,6], [420,7], [ARCHER_RELEASE,8], [580,10], [700,8], [780,10], [900,11], [1000,0]];

/** Непрерывное покачивание: у шеи нет разреза или независимо повёрнутого фрагмента. */
function drawIdle(
  ctx: CanvasRenderingContext2D, atlas: HTMLImageElement,
  x: number, y: number, w: number, h: number, left: number, now: number,
  motion: { neck: number; sway: number; tilt: number; falloff: number },
): void {
  const sway = Math.sin(now / 430) * motion.sway;
  const tilt = Math.sin(now / 430 + 0.5) * motion.tilt;
  for (let offset = 0; offset < h; offset += 2) {
    const stripHeight = Math.min(2, h - offset);
    const weight = Math.max(0, Math.min(1, 1 - (offset - motion.neck) / motion.falloff));
    const aboveNeck = Math.max(0, motion.neck - offset);
    // Наклон плавно сходит к нулю у шеи; смещение и его производная непрерывны.
    const headShift = tilt * aboveNeck * aboveNeck / motion.neck;
    const shift = sway * weight * weight * (3 - 2 * weight) + headShift;
    ctx.drawImage(atlas, x, y + offset, w, stripHeight, left + shift, -h + offset, w, stripHeight);
  }
}

function drawArcher(ctx: CanvasRenderingContext2D, now: number, state: PoseState, reduced: boolean): void {
  if (!archerImage.complete || !archerImage.naturalWidth) return;
  let pose = 0;
  let recoil = 0;
  const motion = state.motion;
  if (motion) {
    const elapsed = Math.max(0, now - motion.started);
    if (elapsed >= DURATION[motion.clip]) state.motion = undefined;
    else if (!reduced) {
      if (motion.clip === 'hurt') {
        pose = elapsed < 120 ? 12 : elapsed < 260 ? 13 : 14;
        recoil = Math.sin(Math.PI * elapsed / DURATION.hurt) * 0.028;
      } else {
        const sequence = motion.clip === 'volley' ? VOLLEY_POSES : SHOOT_POSES;
        pose = sequence.find(([end]) => elapsed < end)?.[1] ?? 0;
      }
    }
  }
  const [x, y, w, h, anchor] = ARCHER_FRAMES[pose];
  ctx.save();
  ctx.scale(2, 2);
  ctx.translate(144, 252);
  // Рост костяка совпадает с воином, запас сверху остаётся для поднятого лука.
  ctx.scale(179 / 237, 179 / 237);
  ctx.rotate(recoil);
  ctx.imageSmoothingEnabled = false;
  if (pose === 0 && !reduced) {
    drawIdle(ctx, archerImage, x, y, w, h, -anchor, now, { neck: 82, sway: 3.8, tilt: 0.05, falloff: 115 });
  } else {
    ctx.drawImage(archerImage, x, y, w, h, -anchor, -h, w, h);
  }
  ctx.restore();
}

/** Скелеты получают рисованные листы; остальные враги сохраняют процедурный спрайт. */
export function enemySprite(spec: SpriteSpec, id: string, px: number, cls = '', instance?: object): HTMLElement {
  if (!hasEnemySheet(id)) return spriteImg(spec, id, px, cls);
  const canvas = document.createElement('canvas');
  canvas.width = 576;
  canvas.height = 512;
  canvas.style.width = `${px * 288 / 256}px`;
  canvas.style.height = `${px}px`;
  canvas.className = `sprite enemy-sheet ${cls.replace(/\bbob\b/g, '')}`.trim();
  canvas.dataset.enemyArt = id;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', id);
  const state = instance ? poses.get(instance) ?? {} : {};
  if (instance) poses.set(instance, state);
  controllers.set(canvas, state);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const draw = (now: number) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (id === 'skeleton_archer') {
      drawArcher(ctx, now, state, reduced);
      canvas.dataset.clip = state.motion?.clip ?? 'idle';
      return;
    }
    if (!image.complete || !image.naturalWidth) return;
    let row = 0;
    let frame = 0;
    let dx = 0;
    let dy = 0;
    let angle = 0;
    const motion = state.motion;
    if (motion) {
      // RAF передаёт время начала кадра, которое может предшествовать performance.now()
      // запуска клипа в этом же кадре. Отрицательный прогресс дал бы индекс −1 и оборвал отрисовку.
      const t = Math.max(0, Math.min(1, (now - motion.started) / DURATION[motion.clip]));
      if (t >= 1) state.motion = undefined;
      else if (!reduced && motion.clip !== 'shoot' && motion.clip !== 'volley') {
        row = ROW[motion.clip];
        // Седьмой кадр мастера повторял замах: исключаем его из единственного удара.
        const sequence = motion.clip === 'attack' ? [0, 1, 2, 3, 4, 4, 5, 7] : [0, 1, 2, 3, 4, 5, 6, 7];
        frame = sequence[Math.min(7, Math.floor(t * 8))];
        const pulse = Math.sin(Math.PI * t);
        dx = motion.clip === 'attack' ? -12 * pulse : motion.clip === 'hurt' ? 9 * pulse : 2 * pulse;
        dy = motion.clip === 'block' ? 2 * pulse : 0;
        angle = motion.clip === 'hurt' ? 0.04 * pulse : 0;
      }
    }
    canvas.dataset.clip = state.motion?.clip ?? 'idle';
    const [x, y, right, bottom] = FRAMES[row][frame];
    const w = right - x;
    const h = bottom - y;
    ctx.save();
    ctx.scale(2, 2);
    // Убираем нижний прозрачный отступ: ступни стоят у основания места под спрайт.
    ctx.translate(144 + dx, 252 + dy);
    ctx.rotate(angle);
    ctx.imageSmoothingEnabled = false;
    const left = x - (frame + 0.5) * (1774 / 8);
    if (row === 0 && !reduced) {
      drawIdle(ctx, image, x, y, w, h, left, now, { neck: 64, sway: 4.5, tilt: 0.085, falloff: 86 });
    } else {
      ctx.drawImage(image, x, y, w, h, left, -h, w, h);
    }
    ctx.restore();
  };
  draw(performance.now());
  const tick = (now: number) => {
    // Старый canvas после render() больше не держит таймер; новый продолжает тот же PoseState.
    if (!canvas.isConnected) return;
    draw(now);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return canvas;
}

export function playEnemyClip(root: HTMLElement, target: EventTarget, clip: EnemyClip): boolean {
  if (target === 'hero') return false;
  const canvas = root.querySelector<HTMLCanvasElement>(`[data-uid="${target}"] .enemy-sheet`);
  const state = canvas && controllers.get(canvas);
  if (!state) return false;
  const archer = canvas!.dataset.enemyArt === 'skeleton_archer';
  if (archer ? clip !== 'shoot' && clip !== 'volley' && clip !== 'hurt' : clip === 'shoot' || clip === 'volley') return false;
  state.motion = { clip, started: performance.now() };
  return true;
}

/** Момент контакта в ближнем бою или выпуска стрелы; полёт добавляется в плане fx. */
export function playEnemyAction(root: HTMLElement, target: EventTarget, name: string): number {
  const clip = name === 'Удар мечом' ? 'attack' : name === 'Блок' ? 'block' : name === 'Выстрел' ? 'shoot' : name === 'Залп' ? 'volley' : null;
  if (!clip || !playEnemyClip(root, target, clip)) return 0;
  if (clip === 'shoot' || clip === 'volley') return ARCHER_RELEASE;
  return clip === 'attack' ? 320 : 280;
}
