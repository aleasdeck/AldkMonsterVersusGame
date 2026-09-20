import skeletonSheet from '../assets/enemies/skeleton-warrior.webp';
import type { EventTarget, SpriteSpec } from '../engine/types';
import { spriteImg } from './sprites';

type EnemyClip = 'attack' | 'block' | 'hurt';
interface Motion { clip: EnemyClip; started: number }
interface PoseState { motion?: Motion }

// Состояние привязано к экземпляру врага: одинаковые uid следующего боя не наследуют старый клип.
const poses = new WeakMap<object, PoseState>();
const controllers = new WeakMap<HTMLCanvasElement, PoseState>();
const DURATION: Record<EnemyClip, number> = { attack: 640, block: 620, hurt: 440 };
const ROW: Record<EnemyClip, number> = { attack: 1, block: 2, hurt: 3 };
const image = new Image();
image.src = skeletonSheet;
export const enemyArtUrls = [skeletonSheet];
export const hasEnemySheet = (id: string): boolean => id === 'skeleton_warrior';

// Реальные границы фигур в мастере 1774×887. Меч в пятом кадре удара выходит за сетку:
// режем по фигуре, а привязываем к центру исходной ячейки и общей линии ступней.
const FRAMES = [
  [[32,44,179,223],[254,43,402,223],[472,44,623,223],[695,44,845,223],[918,44,1067,223],[1141,42,1288,223],[1362,44,1509,223],[1583,44,1732,223]],
  [[32,265,179,443],[259,265,413,443],[483,233,633,443],[695,268,853,443],[859,275,1092,443],[1148,270,1297,443],[1365,234,1518,443],[1583,266,1731,443]],
  [[32,487,179,664],[254,486,401,664],[472,496,632,664],[695,499,854,664],[921,501,1079,664],[1143,486,1288,664],[1362,487,1509,664],[1583,487,1732,664]],
  [[32,708,179,880],[254,699,415,880],[495,694,639,880],[709,698,852,880],[921,706,1074,880],[1144,704,1288,880],[1362,708,1509,880],[1583,708,1731,880]],
];

/** Скелет получает рисованный лист; остальные враги сохраняют свой процедурный спрайт. */
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
      else if (!reduced) {
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
      // Корпус переносит вес, но смещение плавно затухает к ногам: ступни не скользят.
      // Тонкие полосы сохраняют цельный силуэт щита и рёбер без разрыва в талии.
      const headHeight = 64;
      const sway = Math.sin(now / 430) * 4.5;
      for (let offset = headHeight; offset < h; offset += 2) {
        const stripHeight = Math.min(2, h - offset);
        const weight = Math.max(0, 1 - (offset - headHeight) / 86);
        const shift = sway * weight * weight * (3 - 2 * weight);
        ctx.drawImage(image, x, y + offset, w, stripHeight, left + shift, -h + offset, w, stripHeight);
      }
      const neckX = left + 57 + sway;
      ctx.translate(neckX, -h + headHeight);
      ctx.rotate(Math.sin(now / 430 + 0.5) * 0.085);
      ctx.drawImage(image, x, y, w, headHeight, -57, -headHeight, w, headHeight);
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
  state.motion = { clip, started: performance.now() };
  return true;
}

/** Возвращает момент контакта: механика уже рассчитана, её результат показываем у конца замаха. */
export function playEnemyAction(root: HTMLElement, target: EventTarget, name: string): number {
  const clip = name === 'Удар мечом' ? 'attack' : name === 'Блок' ? 'block' : null;
  if (!clip || !playEnemyClip(root, target, clip)) return 0;
  return clip === 'attack' ? 320 : 280;
}
